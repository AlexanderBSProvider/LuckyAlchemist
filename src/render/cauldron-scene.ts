import {
  CircleGeometry,
  Group,
  Mesh,
  RingGeometry,
  Sprite,
  type MeshBasicMaterial,
  type Scene,
} from "three";
import { createAnimationTokenGuard } from "../lib/animation-token";
import { symbols } from "../data";
import { glyphFor } from "../data/glyphs";
import type { EventBus, GameEventMap } from "../store/events";
import { flatColorMaterial, flatSpriteMaterial } from "./flat-material";
import { getGlyphTexture } from "./glyph-texture";
import type { RenderTicker } from "./three-app";
import { scheduleTimedTriggers } from "./vfx/frame-triggers";

export interface CauldronSceneDeps {
  events: EventBus<GameEventMap>;
  ticker: RenderTicker;
  /** The DOM element `ui/lab-panel.ts` reserves for the scene (`.scene__rings`) — the
   * scene is drawn at this element's screen rect every frame, so DOM keeps owning layout
   * while Three.js owns the visuals (ARCHITECTURE.md §6). */
  anchor: HTMLElement;
}

// Design reference size the CSS scene uses (`min(300px, 74vw)`) — pixel-based values below
// (bubble travel distance, glow radius) scale relative to it so smaller viewports shrink
// proportionally, matching the CSS box.
const DESIGN_SIZE = 300;

const COLOR_GOLD = 0xc9a227;
const COLOR_INK_DIM = 0xa89a82;
const COLOR_EMERALD = 0x3fa372;
const COLOR_CAULDRON_EDGE = 0x14382a;

const RING_CONFIGS = [
  { insetFraction: 0, revolutionMs: 95_000, direction: 1, fontSize: 18 },
  { insetFraction: 0.15, revolutionMs: 70_000, direction: -1, fontSize: 18 },
  { insetFraction: 0.3, revolutionMs: 50_000, direction: 1, fontSize: 15 },
] as const;

const BUBBLES = [
  { xFraction: 0.3, radius: 3, delayMs: 0 },
  { xFraction: 0.55, radius: 2, delayMs: 1200 },
  { xFraction: 0.68, radius: 2.5, delayMs: 2300 },
] as const;

const BUBBLE_LOOP_MS = 3400;
const BURST_SPIN_MS = 1150;
const BURST_REVOLUTIONS = 2;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Ease matching CSS's `cubic-bezier(0.22, 0.8, 0.3, 1)` closely enough for a spin settle. */
function easeOutBurst(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface RingGlyph {
  readonly sprite: Sprite;
  readonly unit: { x: number; y: number };
}

interface Ring {
  readonly group: Group;
  readonly border: Mesh;
  readonly glyphs: RingGlyph[];
  readonly radiusFraction: number;
}

let orderCounter = 0;
function nextOrder(): number {
  orderCounter += 1;
  return orderCounter;
}

function buildRing(config: (typeof RING_CONFIGS)[number]): Ring {
  const group = new Group();
  const radiusFraction = 0.5 * (1 - config.insetFraction);

  const border = new Mesh(new RingGeometry(0.97, 1, 64), flatColorMaterial(COLOR_GOLD, 0.16));
  border.renderOrder = nextOrder();
  group.add(border);

  const glyphs: RingGlyph[] = symbols.map((symbol, i) => {
    const angleDeg = (360 / symbols.length) * i;
    const angle = (angleDeg * Math.PI) / 180;
    const glyphTexture = getGlyphTexture({
      text: glyphFor(symbol.id),
      fontSize: config.fontSize,
      color: COLOR_INK_DIM,
    });
    const sprite = new Sprite(flatSpriteMaterial(glyphTexture.texture));
    sprite.scale.set(glyphTexture.width, glyphTexture.height, 1);
    sprite.renderOrder = nextOrder();
    group.add(sprite);
    return { sprite, unit: { x: Math.cos(angle), y: Math.sin(angle) } };
  });

  return { group, border, glyphs, radiusFraction };
}

function layoutRing(ring: Ring, boxSize: number): void {
  const radius = ring.radiusFraction * boxSize;
  ring.border.scale.set(radius, radius, 1);
  for (const glyph of ring.glyphs) {
    glyph.sprite.position.set(glyph.unit.x * radius, glyph.unit.y * radius, 0);
  }
}

interface Cauldron {
  readonly group: Group;
  readonly glow: Mesh;
  readonly glowMaterial: MeshBasicMaterial;
  readonly bodyFill: Mesh;
  readonly bodyEdge: Mesh;
}

function buildCauldron(): Cauldron {
  const group = new Group();
  const glowMaterial = flatColorMaterial(COLOR_EMERALD, 0.35);
  const glow = new Mesh(new CircleGeometry(1, 48), glowMaterial);
  const bodyFill = new Mesh(new CircleGeometry(1, 48), flatColorMaterial(COLOR_CAULDRON_EDGE, 1));
  const bodyEdge = new Mesh(new RingGeometry(0.93, 1, 48), flatColorMaterial(COLOR_GOLD, 0.35));
  glow.renderOrder = nextOrder();
  bodyFill.renderOrder = nextOrder();
  bodyEdge.renderOrder = nextOrder();
  group.add(glow, bodyFill, bodyEdge);
  return { group, glow, glowMaterial, bodyFill, bodyEdge };
}

interface Bubble {
  readonly mesh: Mesh;
  readonly material: MeshBasicMaterial;
  readonly config: (typeof BUBBLES)[number];
}

function buildBubbles(cauldron: Cauldron): Bubble[] {
  return BUBBLES.map((config) => {
    const material = flatColorMaterial(0xf2e9d8, 0);
    const mesh = new Mesh(new CircleGeometry(1, 16), material);
    mesh.renderOrder = nextOrder();
    cauldron.group.add(mesh);
    return { mesh, material, config };
  });
}

interface Spark {
  readonly mesh: Mesh;
  readonly material: MeshBasicMaterial;
  readonly spawnedAt: number;
  readonly intensity: number;
}

/**
 * Draws the alchemist's cauldron and three symbol rings — the Three.js replacement for the
 * Pixi version, same reactive shape: reacts to `brew:success`/`brew:fail` (see
 * `store/actions.ts`) instead of `store.subscribe`, since the burst is a one-shot reaction to
 * an outcome, not a function of continuous state.
 */
export function mountCauldronScene(scene: Scene, deps: CauldronSceneDeps): () => void {
  const { events, ticker, anchor } = deps;

  const sceneRoot = new Group();
  const ringsGroup = new Group();
  const rings = RING_CONFIGS.map(buildRing);
  for (const ring of rings) ringsGroup.add(ring.group);
  const cauldron = buildCauldron();
  const bubbles = buildBubbles(cauldron);

  sceneRoot.add(ringsGroup, cauldron.group);
  scene.add(sceneRoot);

  const sparks: Spark[] = [];

  const tokenGuard = createAnimationTokenGuard();
  let burstCancel: (() => void) | null = null;
  let burstStartMs: number | null = null;
  let burstToken: number | null = null;

  const clearBurst = (): void => {
    burstCancel?.();
    burstCancel = null;
    burstStartMs = null;
    burstToken = null;
  };

  let lastBoxSize = DESIGN_SIZE;
  let lastFrameDeltaMs = 16;

  const spawnSpark = (intensity: number): void => {
    const material = flatColorMaterial(0xf2e9d8, 0.5 * intensity);
    const mesh = new Mesh(new CircleGeometry(1, 24), material);
    mesh.renderOrder = nextOrder();
    cauldron.group.add(mesh);
    sparks.push({ mesh, material, spawnedAt: performance.now(), intensity });
  };

  const startBurst = (): void => {
    clearBurst();
    burstToken = tokenGuard.next();
    burstStartMs = performance.now();
    burstCancel = scheduleTimedTriggers(BURST_SPIN_MS, [
      {
        at: 0.4,
        run: () => {
          spawnSpark(0.8);
        },
      },
      {
        at: 0.8,
        run: () => {
          spawnSpark(1);
        },
      },
    ]);
  };

  const unsubscribeBrewSuccess = events.on("brew:success", startBurst);
  const unsubscribeBrewFail = events.on("brew:fail", startBurst);

  const sparkDurationMs = 260;

  const onTick = (deltaMs: number): void => {
    lastFrameDeltaMs = deltaMs;
    const rect = anchor.getBoundingClientRect();
    const boxSize = Math.max(1, Math.min(rect.width, rect.height));
    lastBoxSize = boxSize;
    sceneRoot.position.set(rect.left + rect.width / 2, rect.top + rect.height / 2, 0);

    for (const ring of rings) layoutRing(ring, boxSize);

    const cauldronRadius = boxSize * 0.1;
    cauldron.glow.scale.set(cauldronRadius * 1.4, cauldronRadius * 1.4, 1);
    cauldron.bodyFill.scale.set(cauldronRadius, cauldronRadius, 1);
    cauldron.bodyEdge.scale.set(cauldronRadius, cauldronRadius, 1);

    const nowMs = performance.now();
    const pulse = 0.5 + 0.5 * Math.sin(nowMs / 2000);
    cauldron.glowMaterial.opacity = 0.2 + pulse * 0.35;

    for (const bubble of bubbles) {
      const phase = ((nowMs + bubble.config.delayMs) % BUBBLE_LOOP_MS) / BUBBLE_LOOP_MS;
      const travel = (boxSize / DESIGN_SIZE) * 48;
      const x = (bubble.config.xFraction - 0.5) * boxSize;
      const y = boxSize * 0.42 - phase * travel;
      const alpha =
        phase < 0.15 ? (phase / 0.15) * 0.9 : phase > 0.85 ? 0 : 0.9 * (1 - phase);
      bubble.mesh.position.set(x, y, 0);
      const radius = bubble.config.radius * (boxSize / DESIGN_SIZE);
      bubble.mesh.scale.set(radius, radius, 1);
      bubble.material.opacity = Math.max(0, alpha);
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const spark = sparks[i];
      if (!spark) continue;
      const elapsed = nowMs - spark.spawnedAt;
      const t = Math.min(1, elapsed / sparkDurationMs);
      const size = lastBoxSize * 0.28 * (0.4 + t * 0.6);
      spark.mesh.scale.set(size, size, 1);
      spark.material.opacity = (1 - t) * 0.6 * spark.intensity;
      if (t >= 1) {
        cauldron.group.remove(spark.mesh);
        spark.mesh.geometry.dispose();
        spark.material.dispose();
        sparks.splice(i, 1);
      }
    }

    if (!prefersReducedMotion()) {
      for (const [i, ring] of rings.entries()) {
        const config = RING_CONFIGS[i];
        if (!config) continue;
        const angularSpeed = ((2 * Math.PI) / config.revolutionMs) * config.direction;
        ring.group.rotation.z += angularSpeed * lastFrameDeltaMs;
      }
    }

    if (burstStartMs !== null && burstToken !== null && tokenGuard.isCurrent(burstToken)) {
      const elapsed = nowMs - burstStartMs;
      const t = Math.min(1, elapsed / BURST_SPIN_MS);
      ringsGroup.rotation.z = easeOutBurst(t) * BURST_REVOLUTIONS * 2 * Math.PI;
      if (t >= 1) clearBurst();
    }
  };

  ticker.add(onTick);

  return () => {
    ticker.remove(onTick);
    clearBurst();
    unsubscribeBrewSuccess();
    unsubscribeBrewFail();
    scene.remove(sceneRoot);
  };
}
