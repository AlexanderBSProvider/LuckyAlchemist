import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { createAnimationTokenGuard } from "../lib/animation-token";
import { symbols } from "../data";
import type { IconName } from "../data/icon-paths";
import type { EventBus, GameEventMap } from "../store/events";
import { loadIconTexture } from "./icon-textures";
import type { RenderTicker } from "./pixi-app";
import { scheduleTimedTriggers } from "./vfx/frame-triggers";

export interface CauldronSceneDeps {
  events: EventBus<GameEventMap>;
  ticker: RenderTicker;
  /** The DOM element `ui/lab-panel.ts` reserves for the scene (`.brew-cauldron`) — the
   * scene is drawn at this element's screen rect every frame, so DOM keeps owning layout
   * while Pixi owns the visuals (ARCHITECTURE.md §6). */
  anchor: HTMLElement;
}

// Design reference size the CSS scene uses (`min(300px, 74vw)`) — pixel-based values below
// (bubble travel distance, glow radius) scale relative to it so smaller viewports shrink
// proportionally, matching the CSS box.
const DESIGN_SIZE = 300;

const COLOR_GOLD = 0xc9a227;
const COLOR_GLYPH = 0xede4cf; // parchment ink — engraved symbols must read on the dark deck
const COLOR_EMERALD = 0x3fa372;
const COLOR_EMERALD_DEEP = 0x1c4d38; // shaded brew under the surface
const COLOR_EMERALD_LIGHT = 0x6fd6a0; // specular highlight on the brew
const COLOR_IRON = 0x211a13; // cast-iron cauldron body
const COLOR_IRON_DARK = 0x13100b; // shaded underside + legs
const COLOR_SPARK = 0xf2e9d8; // parchment motes
const COLOR_SPARK_GOLD = 0xe8b54a; // success sparks
const COLOR_PUFF_DARK = 0x2a241c; // failure steam puff

// The five era-1 element symbols map 1:1 onto their engraved game-icons keys.
const ELEMENT_ICONS: readonly IconName[] = ["fire", "earth", "water", "metal", "spirit"];
function elementIcon(id: string): IconName {
  return (ELEMENT_ICONS as readonly string[]).includes(id) ? (id as IconName) : "spirit";
}

const RING_CONFIGS = [
  { insetFraction: 0, revolutionMs: 95_000, direction: 1, symbolSize: 24 },
  { insetFraction: 0.15, revolutionMs: 70_000, direction: -1, symbolSize: 21 },
  { insetFraction: 0.3, revolutionMs: 50_000, direction: 1, symbolSize: 18 },
] as const;

// Surface bubbles that pop on the brew, plus taller steam wisps rising off it.
const BUBBLES = [
  { xFraction: 0.3, radius: 3, delayMs: 0 },
  { xFraction: 0.55, radius: 2, delayMs: 1200 },
  { xFraction: 0.68, radius: 2.5, delayMs: 2300 },
] as const;
const STEAM = [
  { xFraction: 0.4, delayMs: 0 },
  { xFraction: 0.52, delayMs: 1500 },
  { xFraction: 0.62, delayMs: 3000 },
] as const;

const BUBBLE_LOOP_MS = 3400;
const STEAM_LOOP_MS = 4200;
const BURST_SPIN_MS = 1150;
const BURST_REVOLUTIONS = 2;
const FLASH_MS = 520;
const SHAKE_MS = 420;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Ease matching CSS's `cubic-bezier(0.22, 0.8, 0.3, 1)` closely enough for a spin settle. */
function easeOutBurst(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface RingSymbol {
  readonly sprite: Sprite;
  readonly unit: { x: number; y: number };
  readonly size: number;
}

interface Ring {
  readonly container: Container;
  readonly border: Graphics;
  readonly symbols: RingSymbol[];
  readonly radiusFraction: number;
}

function buildRing(config: (typeof RING_CONFIGS)[number]): Ring {
  const container = new Container();
  const radiusFraction = 0.5 * (1 - config.insetFraction);

  // Unit circle stroked entirely inward of radius 1 (`alignment: 1`) — the whole shape is
  // uniformly scaled per frame in `layoutRing`, so stroke thickness tracks the ring radius.
  const border = new Graphics()
    .circle(0, 0, 1)
    .stroke({ width: 0.03, color: COLOR_GOLD, alpha: 0.5, alignment: 1 });
  container.addChild(border);

  const ringSymbols: RingSymbol[] = symbols.map((symbol, i) => {
    const angle = ((360 / symbols.length) * i * Math.PI) / 180;
    // Sprite starts blank; the baked, colored icon texture swaps in when it resolves.
    const sprite = new Sprite(Texture.EMPTY);
    sprite.anchor.set(0.5);
    void loadIconTexture(elementIcon(symbol.id), COLOR_GLYPH, 96).then((texture) => {
      sprite.texture = texture;
    });
    container.addChild(sprite);
    return { sprite, unit: { x: Math.cos(angle), y: Math.sin(angle) }, size: config.symbolSize };
  });

  return { container, border, symbols: ringSymbols, radiusFraction };
}

function layoutRing(ring: Ring, boxSize: number): void {
  const radius = ring.radiusFraction * boxSize;
  ring.border.scale.set(radius);
  const symbolScale = ((boxSize / DESIGN_SIZE) * 1) / 96;
  for (const symbol of ring.symbols) {
    symbol.sprite.position.set(symbol.unit.x * radius, symbol.unit.y * radius);
    symbol.sprite.scale.set(symbol.size * symbolScale);
    // Keep symbols upright while the ring spins.
    symbol.sprite.rotation = -ring.container.rotation;
  }
}

interface Cauldron {
  readonly container: Container;
  readonly glow: Graphics;
  readonly body: Graphics;
  readonly liquidDeep: Graphics;
  readonly liquid: Graphics;
  readonly liquidGlow: Graphics;
  readonly rimHighlight: Graphics;
}

/**
 * Cast-iron pot drawn from primitives (design decision: no art sprites): three stubby legs,
 * a rounded belly, a wide gold-edged rim, and a layered emerald brew with a moving specular.
 * Everything is authored in a unit space (belly radius = 1) and scaled per frame.
 */
function buildCauldron(): Cauldron {
  const container = new Container();

  const glow = new Graphics().circle(0, 0, 1).fill({ color: COLOR_EMERALD });

  const body = new Graphics();
  // Three legs first (behind the belly).
  for (const legX of [-0.62, 0, 0.62]) {
    body
      .moveTo(legX - 0.12, 0.7)
      .lineTo(legX + 0.12, 0.7)
      .lineTo(legX + 0.16, 1.12)
      .lineTo(legX - 0.16, 1.12)
      .closePath()
      .fill({ color: COLOR_IRON_DARK });
  }
  // Belly: a full disc gives the rounded cast-iron pot; a darker underside crescent shades it.
  body.circle(0, 0, 1).fill({ color: COLOR_IRON });
  body.ellipse(0, 0.34, 0.92, 0.72).fill({ color: COLOR_IRON_DARK, alpha: 0.55 });
  // Wide rim band on top, edged in engraved gold.
  body.ellipse(0, -0.86, 1.16, 0.3).fill({ color: COLOR_IRON });
  body.ellipse(0, -0.86, 1.16, 0.3).stroke({ width: 0.07, color: COLOR_GOLD, alpha: 0.6 });
  // Inner mouth (dark well the brew sits in).
  body.ellipse(0, -0.86, 0.98, 0.24).fill({ color: COLOR_IRON_DARK });

  // Brew surface: deep shade → emerald body → animated specular, all clipped to the mouth.
  const liquidDeep = new Graphics()
    .ellipse(0, -0.86, 0.96, 0.23)
    .fill({ color: COLOR_EMERALD_DEEP });
  const liquid = new Graphics().ellipse(0, -0.9, 0.86, 0.19).fill({ color: COLOR_EMERALD });
  const liquidGlow = new Graphics()
    .ellipse(-0.24, -0.94, 0.34, 0.08)
    .fill({ color: COLOR_EMERALD_LIGHT });

  // Gold specular arc along the lower-left belly.
  const rimHighlight = new Graphics()
    .arc(0, 0, 0.92, Math.PI * 0.72, Math.PI * 1.04)
    .stroke({ width: 0.06, color: COLOR_GOLD, alpha: 0.5 });

  container.addChild(glow, body, liquidDeep, liquid, liquidGlow, rimHighlight);
  return { container, glow, body, liquidDeep, liquid, liquidGlow, rimHighlight };
}

interface Bubble {
  readonly graphic: Graphics;
  readonly config: (typeof BUBBLES)[number];
}

interface SteamWisp {
  readonly graphic: Graphics;
  readonly config: (typeof STEAM)[number];
}

interface Mote {
  readonly graphic: Graphics;
  readonly spawnedAt: number;
  readonly intensity: number;
  readonly color: number;
  readonly rise: number;
  readonly drift: number;
}

/**
 * Draws the alchemist's cauldron and three symbol rings. Reacts to `brew:success`/
 * `brew:fail` (see `store/actions.ts`) instead of `store.subscribe`, since the burst is a
 * one-shot reaction to an outcome, not a function of continuous state.
 */
export function mountCauldronScene(stage: Container, deps: CauldronSceneDeps): () => void {
  const { events, ticker, anchor } = deps;

  const sceneRoot = new Container();
  // Soft emerald backglow behind the whole ring stack — lifts the cauldron block off the
  // near-black deck so it reads as the tab's hero prop instead of vanishing into it.
  const backGlow = new Graphics().circle(0, 0, 1).fill({ color: COLOR_EMERALD });
  backGlow.alpha = 0.08;
  const ringsGroup = new Container();
  const rings = RING_CONFIGS.map(buildRing);
  for (const ring of rings) ringsGroup.addChild(ring.container);
  const cauldron = buildCauldron();
  const bubbles: Bubble[] = BUBBLES.map((config) => {
    const graphic = new Graphics().circle(0, 0, 1).fill({ color: COLOR_SPARK });
    cauldron.container.addChild(graphic);
    return { graphic, config };
  });
  const steam: SteamWisp[] = STEAM.map((config) => {
    const graphic = new Graphics().circle(0, 0, 1).fill({ color: 0xd8e6dd });
    cauldron.container.addChild(graphic);
    return { graphic, config };
  });

  // One-shot success flash: a gold ring blooming out of the cauldron mouth.
  const flash = new Graphics().circle(0, 0, 1).fill({ color: COLOR_SPARK_GOLD });
  flash.visible = false;
  sceneRoot.addChild(backGlow, ringsGroup, cauldron.container, flash);
  stage.addChild(sceneRoot);

  const motes: Mote[] = [];

  const tokenGuard = createAnimationTokenGuard();
  let burstCancel: (() => void) | null = null;
  let burstStartMs: number | null = null;
  let burstToken: number | null = null;
  let flashStartMs: number | null = null;
  let shakeStartMs: number | null = null;

  const clearBurst = (): void => {
    burstCancel?.();
    burstCancel = null;
    burstStartMs = null;
    burstToken = null;
  };

  let lastFrameDeltaMs = 16;

  const spawnMote = (intensity: number, kind: "success" | "fail"): void => {
    const color =
      kind === "success" ? COLOR_SPARK_GOLD : Math.random() < 0.5 ? COLOR_PUFF_DARK : COLOR_SPARK;
    const graphic = new Graphics().circle(0, 0, 1).fill({ color });
    cauldron.container.addChild(graphic);
    motes.push({
      graphic,
      spawnedAt: performance.now(),
      intensity,
      color,
      rise: 0.7 + Math.random() * 0.9,
      drift: (Math.random() - 0.5) * 1.4,
    });
  };

  const startBurst = (kind: "success" | "fail"): void => {
    clearBurst();
    burstToken = tokenGuard.next();
    burstStartMs = performance.now();
    // Rings ease to a stop; the outcome punch (flash or shake) lands as they settle, right
    // before the DOM rolls reveal (ui/lab-panel.ts stages those ~0.9s in).
    if (kind === "success") flashStartMs = performance.now();
    else shakeStartMs = performance.now();
    const moteKind = kind;
    burstCancel = scheduleTimedTriggers(BURST_SPIN_MS, [
      {
        at: 0.4,
        run: () => {
          spawnMote(0.8, moteKind);
        },
      },
      {
        at: 0.62,
        run: () => {
          spawnMote(1, moteKind);
        },
      },
      {
        at: 0.82,
        run: () => {
          spawnMote(0.9, moteKind);
        },
      },
    ]);
  };

  const unsubscribeBrewSuccess = events.on("brew:success", () => {
    startBurst("success");
  });
  const unsubscribeBrewFail = events.on("brew:fail", () => {
    startBurst("fail");
  });

  const moteDurationMs = 620;

  const onTick = (deltaMs: number): void => {
    lastFrameDeltaMs = deltaMs;
    const rect = anchor.getBoundingClientRect();
    const boxSize = Math.max(1, Math.min(rect.width, rect.height));
    const nowMs = performance.now();

    // Failure shake: a brief decaying jitter of the whole scene root.
    let shakeX = 0;
    let shakeY = 0;
    if (shakeStartMs !== null && !prefersReducedMotion()) {
      const s = (nowMs - shakeStartMs) / SHAKE_MS;
      if (s >= 1) {
        shakeStartMs = null;
      } else {
        const decay = (1 - s) * boxSize * 0.03;
        shakeX = (Math.random() - 0.5) * decay;
        shakeY = (Math.random() - 0.5) * decay;
      }
    }
    sceneRoot.position.set(
      rect.left + rect.width / 2 + shakeX,
      rect.top + rect.height / 2 + shakeY,
    );

    for (const ring of rings) layoutRing(ring, boxSize);

    const cauldronScale = boxSize * 0.17;
    cauldron.container.position.set(0, boxSize * 0.04);
    cauldron.container.scale.set(cauldronScale);

    const pulse = 0.5 + 0.5 * Math.sin(nowMs / 2000);
    cauldron.glow.scale.set(1.7);
    cauldron.glow.position.set(0, -0.86);
    cauldron.glow.alpha = 0.16 + pulse * 0.22;
    // Brew wobble: the surface ellipse breathes and its specular slides side to side.
    const wave = Math.sin(nowMs / 900);
    cauldron.liquid.scale.set(1, 1 + wave * 0.06);
    cauldron.liquidGlow.position.set(-0.24 + wave * 0.18, -0.94);
    cauldron.liquidGlow.alpha = 0.35 + pulse * 0.3;

    backGlow.scale.set(boxSize * 0.55);
    backGlow.alpha = 0.06 + pulse * 0.05;

    // Surface bubbles rise and pop just under the rim.
    for (const bubble of bubbles) {
      const phase = ((nowMs + bubble.config.delayMs) % BUBBLE_LOOP_MS) / BUBBLE_LOOP_MS;
      const travel = (boxSize / DESIGN_SIZE) * 30;
      const x = (bubble.config.xFraction - 0.5) * boxSize * 0.34;
      const y = -boxSize * 0.14 - phase * travel;
      const alpha = phase < 0.15 ? (phase / 0.15) * 0.9 : phase > 0.85 ? 0 : 0.9 * (1 - phase);
      bubble.graphic.position.set(x, y);
      bubble.graphic.scale.set(bubble.config.radius * (boxSize / DESIGN_SIZE));
      bubble.graphic.alpha = Math.max(0, alpha);
    }

    // Steam wisps drift higher and dissolve above the pot.
    for (const wisp of steam) {
      const phase = ((nowMs + wisp.config.delayMs) % STEAM_LOOP_MS) / STEAM_LOOP_MS;
      const rise = (boxSize / DESIGN_SIZE) * 78;
      const x =
        (wisp.config.xFraction - 0.5) * boxSize * 0.3 +
        Math.sin(phase * 6 + wisp.config.delayMs) * boxSize * 0.02;
      const y = -boxSize * 0.16 - phase * rise;
      wisp.graphic.position.set(x, y);
      wisp.graphic.scale.set((3 + phase * 5) * (boxSize / DESIGN_SIZE));
      wisp.graphic.alpha = Math.max(
        0,
        (phase < 0.2 ? phase / 0.2 : 1 - (phase - 0.2) / 0.8) * 0.14,
      );
    }

    // Outcome motes (sparks / dark puffs) rise out of the mouth and fade.
    for (let i = motes.length - 1; i >= 0; i--) {
      const mote = motes[i];
      if (!mote) continue;
      const elapsed = nowMs - mote.spawnedAt;
      const t = Math.min(1, elapsed / moteDurationMs);
      const x = mote.drift * t * boxSize * 0.12;
      const y = -boxSize * 0.16 - mote.rise * t * boxSize * 0.18;
      mote.graphic.position.set(x, y);
      mote.graphic.scale.set(boxSize * 0.012 * (1 + t * 2) * mote.intensity);
      mote.graphic.alpha = (1 - t) * 0.75 * mote.intensity;
      if (t >= 1) {
        cauldron.container.removeChild(mote.graphic);
        mote.graphic.destroy();
        motes.splice(i, 1);
      }
    }

    // Success flash: a gold ring blooming from the mouth.
    if (flashStartMs !== null) {
      const f = (nowMs - flashStartMs) / FLASH_MS;
      if (f >= 1) {
        flashStartMs = null;
        flash.visible = false;
      } else {
        flash.visible = true;
        flash.position.set(0, boxSize * 0.04 - cauldronScale * 0.86);
        flash.scale.set(boxSize * 0.08 * (0.5 + f * 1.6));
        flash.alpha = (1 - f) * 0.5;
      }
    }

    if (!prefersReducedMotion()) {
      for (const [i, ring] of rings.entries()) {
        const config = RING_CONFIGS[i];
        if (!config) continue;
        const angularSpeed = ((2 * Math.PI) / config.revolutionMs) * config.direction;
        ring.container.rotation += angularSpeed * lastFrameDeltaMs;
      }
    }

    if (burstStartMs !== null && burstToken !== null && tokenGuard.isCurrent(burstToken)) {
      const elapsed = nowMs - burstStartMs;
      const t = Math.min(1, elapsed / BURST_SPIN_MS);
      ringsGroup.rotation = easeOutBurst(t) * BURST_REVOLUTIONS * 2 * Math.PI;
      if (t >= 1) clearBurst();
    }
  };

  ticker.add(onTick);

  return () => {
    ticker.remove(onTick);
    clearBurst();
    unsubscribeBrewSuccess();
    unsubscribeBrewFail();
    stage.removeChild(sceneRoot);
    sceneRoot.destroy({ children: true });
  };
}
