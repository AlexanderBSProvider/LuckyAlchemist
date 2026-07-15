import { AnimatedSprite, Container, Graphics, type Text } from "pixi.js";
import { createAnimationTokenGuard } from "../lib/animation-token";
import { stages } from "../data";
import { foeGlyphFor } from "../data/glyphs";
import type { EventBus, GameEventMap } from "../store/events";
import type { GameState } from "../store/game-state";
import type { Store } from "../store/store";
import { loadSlashFrames } from "./fx-textures";
import { createGlyphText, updateGlyphText } from "./glyph-text";
import type { RenderTicker } from "./pixi-app";

export interface BattleSceneDeps {
  events: EventBus<GameEventMap>;
  store: Store<GameState>;
  ticker: RenderTicker;
  /** The DOM element `ui/lab-panel.ts` reserves for the arena — the scene is drawn at
   * this element's screen rect every frame (same anchor pattern as cauldron-scene). */
  anchor: HTMLElement;
}

/* Dark "Grimoire" palette (mirrors src/styles/grimoire.css tokens): a candle-lit ritual
 * floor with a warm battle lane, gold ember motes, and emerald/carmine combatant runes. */
const COLOR_SPARK = 0xe8b54a; // drifting embers / candle motes (--color-gold)
const COLOR_GROUND = 0x241a12; // ritual floor (--color-field)
const COLOR_GROUND_NEAR = 0x16100b; // darker foreground strip (--color-field-dark)
const COLOR_INK = 0xede4cf; // fighter glyph label + clash flash (--color-ink)
const COLOR_DANGER = 0xc94433; // foe rune + clash tint (--color-danger)
const COLOR_HERO = 0x3fa372; // hero rune (--color-success emerald)
const COLOR_GOLD = 0xc9a227; // engraved gold accents (--color-primary)
const COLOR_LANE = 0x2e2117; // trodden battle lane
const COLOR_LANE_LIGHT = 0x3a2c1c; // trodden-patch mist under the fighters
const COLOR_WHITE = 0xffffff;
const COLOR_SHADOW = 0x000000;

const ALCHEMIST_GLYPH = "🧙";
const TROPHY_GLYPH = "🏆";
const FIGHTER_FONT_SIZE = 64;

/* Fight replay timings (presentation only, not balance). Total must stay comfortably
 * under data/battle.json's autoIntervalSeconds so replays never overlap. */
const FIGHT_TOTAL_MS = 1500;
const PHASE_APPROACH_END = 0.3; // fighters close in
const PHASE_CLASH_END = 0.5; // impact flash + shake
const PHASE_RETREAT_END = 0.75; // back to posts
// 0.75..1: aftermath — foe dissolves on a win / triumph pulse on a loss

const EMBER_SPAWN_INTERVAL_MS = 480;
const EMBER_MAX_COUNT = 14;
const EMBER_LIFE_MS = 2600;

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

function phaseT(t: number, from: number, to: number): number {
  return Math.max(0, Math.min(1, (t - from) / (to - from)));
}

function flatRect(color: number, alpha = 1): Graphics {
  const graphic = new Graphics().rect(-0.5, -0.5, 1, 1).fill({ color });
  graphic.alpha = alpha;
  return graphic;
}

function flatCircle(color: number, alpha = 1): Graphics {
  const graphic = new Graphics().circle(0, 0, 1).fill({ color });
  graphic.alpha = alpha;
  return graphic;
}

interface EllipseLayer {
  readonly graphic: Graphics;
  readonly rx: number;
  readonly ry: number;
}

function buildEllipse(
  parent: Container,
  rx: number,
  ry: number,
  color: number,
  alpha: number,
  ring?: { innerFraction: number },
): EllipseLayer {
  const graphic = new Graphics();
  if (ring) {
    graphic.circle(0, 0, 1).stroke({ width: 1 - ring.innerFraction, color, alignment: 1 });
  } else {
    graphic.circle(0, 0, 1).fill({ color });
  }
  graphic.alpha = alpha;
  parent.addChild(graphic);
  return { graphic, rx, ry };
}

interface Fighter {
  readonly text: Text;
}

function buildFighter(text: string): Fighter {
  const glyphText = createGlyphText({
    text,
    fontSize: FIGHTER_FONT_SIZE,
    color: COLOR_INK,
    dropShadow: { color: COLOR_SHADOW, alpha: 0.6, blur: 6, distance: 4 },
  });
  glyphText.anchor.set(0.5, 0.78);
  return { text: glyphText };
}

function setFighterGlyph(fighter: Fighter, text: string): void {
  updateGlyphText(fighter.text, {
    text,
    fontSize: FIGHTER_FONT_SIZE,
    color: COLOR_INK,
    dropShadow: { color: COLOR_SHADOW, alpha: 0.6, blur: 6, distance: 4 },
  });
}

interface Ember {
  readonly graphic: Graphics;
  readonly bornAt: number;
  readonly xFraction: number;
  readonly sway: number;
  readonly size: number;
}

/**
 * The autobattler arena — the game's persistent top scene, in the dark "Grimoire" visual
 * language: a candle-lit ritual floor with a trodden battle lane, rune circles under the
 * fighters, gold ember motes drifting up, and glyph fighters. Fights resolve in the store
 * on the auto-battle timer (`main.ts`); this scene only replays `battle:won`/`battle:lost`
 * outcomes it hears on the event bus, never rolls anything itself.
 */
export function mountBattleScene(stage: Container, deps: BattleSceneDeps): () => void {
  const { events, store, ticker, anchor } = deps;

  const sceneRoot = new Container();

  // --- Background scenery: a candle-lit ritual floor with a battle lane -----------------
  // The dark tome look in our flat-shape language: a near-black warm floor plane, an even
  // darker foreground strip for depth, a trodden lane the fighters stand on (edged with
  // faint engraved gold), and small candle props framing it. Built first so they paint
  // behind the floor/fighters (Pixi containers paint in child-insertion order).
  const backdrop = new Container();
  const groundField = flatRect(COLOR_GROUND);
  backdrop.addChild(groundField);

  // Darker strip along the very bottom = a hint of foreground depth.
  const groundNear = flatRect(COLOR_GROUND_NEAR);
  backdrop.addChild(groundNear);

  // Trodden battle lane across the middle — where the two fighters meet — with faint gold
  // hairlines along both edges (the "engraved" accent of the style).
  const lane = flatRect(COLOR_LANE);
  const laneEdgeTop = flatRect(COLOR_GOLD, 0.28);
  const laneEdgeBottom = flatRect(COLOR_GOLD, 0.18);
  backdrop.addChild(lane, laneEdgeTop, laneEdgeBottom);

  // Candle prop: a wax stub + halo + flame spark. Sized ~a tenth of the scene height —
  // discreet framing, unlike the old blob-scale tree/rock props.
  interface CandleProp {
    readonly container: Container;
    readonly halo: Graphics;
    readonly flame: Graphics;
    readonly xFraction: number;
    readonly scale: number;
    readonly flickerPhase: number;
  }
  const buildCandleProp = (xFraction: number, scale: number, flickerPhase: number): CandleProp => {
    const group = new Container();
    const halo = flatCircle(COLOR_SPARK, 0.12);
    halo.scale.set(0.9);
    halo.position.set(0, -0.72);
    const wax = flatRect(0x8a7a5e, 0.9);
    wax.scale.set(0.22, 0.55);
    wax.position.set(0, -0.28); // up from the base (y-down world, so negative = up)
    const flame = flatCircle(COLOR_SPARK, 0.95);
    flame.scale.set(0.09, 0.14);
    flame.position.set(0, -0.62);
    group.addChild(halo, wax, flame);
    return { container: group, halo, flame, xFraction, scale, flickerPhase };
  };

  const candleProps: CandleProp[] = [
    buildCandleProp(0.07, 1, 0),
    buildCandleProp(0.93, 1.1, 2.1),
  ];
  for (const prop of candleProps) backdrop.addChild(prop.container);
  sceneRoot.addChild(backdrop);

  // --- Arena floor: a soft candle-lit patch under the fighters --------------------------
  const floor = new Container();
  const floorShadow = buildEllipse(floor, 1, 0.3, COLOR_SHADOW, 0.3);
  const floorBase = buildEllipse(floor, 0.9, 0.26, COLOR_LANE_LIGHT, 0.5);
  const floorBaseEdge = buildEllipse(floor, 0.9, 0.26, COLOR_GOLD, 0.22, { innerFraction: 0.95 });
  const floorMist = buildEllipse(floor, 0.6, 0.16, COLOR_SPARK, 0.12);

  // --- Rune circles under each fighter ---------------------------------------------------
  // On the dark floor these are the scene's main color accent — alphas run high.
  const heroCircleGroup = new Container();
  const heroCircleOuter = buildEllipse(heroCircleGroup, 1, 0.3, COLOR_HERO, 0.85, {
    innerFraction: 0.9,
  });
  const heroCircleInner = buildEllipse(heroCircleGroup, 0.72, 0.216, COLOR_HERO, 0.45, {
    innerFraction: 0.94,
  });
  const foeCircleGroup = new Container();
  const foeCircleOuter = buildEllipse(foeCircleGroup, 1, 0.3, COLOR_DANGER, 0.8, {
    innerFraction: 0.9,
  });
  const foeCircleInner = buildEllipse(foeCircleGroup, 0.72, 0.216, COLOR_DANGER, 0.42, {
    innerFraction: 0.94,
  });

  // --- Fighters -------------------------------------------------------------------------
  const hero = buildFighter(ALCHEMIST_GLYPH);
  const foe = buildFighter(foeGlyphFor(store.getState().currentStageId));

  // Impact flash, hidden until a clash.
  const clashFlash = flatCircle(COLOR_INK);
  clashFlash.visible = false;

  sceneRoot.addChild(floor, heroCircleGroup, foeCircleGroup, clashFlash, hero.text, foe.text);
  stage.addChild(sceneRoot);

  // --- Slash FX sprites (craftpix pack, loaded lazily via fx-textures.ts) ----------------
  // Kicked off at mount, resolved whenever the PNGs arrive; until then the clash phase
  // falls back to the plain flash circle alone. Added after the fighters so the slash
  // draws over them.
  const slashSprites: Record<"win" | "lose", AnimatedSprite | null> = { win: null, lose: null };
  let disposed = false;
  for (const kind of ["win", "lose"] as const) {
    loadSlashFrames(kind)
      .then((frames) => {
        if (disposed) return;
        const sprite = new AnimatedSprite(frames);
        sprite.anchor.set(0.5);
        sprite.loop = false;
        sprite.visible = false;
        sprite.animationSpeed = 0.45; // ~10 frames over ~370ms at 60fps — spans the clash
        sprite.onComplete = () => {
          sprite.visible = false;
        };
        sceneRoot.addChild(sprite);
        slashSprites[kind] = sprite;
      })
      .catch((error: unknown) => {
        console.error("battle-scene: slash FX failed to load", error);
      });
  }

  // --- Ambient embers --------------------------------------------------------------------
  const emberLayer = new Container();
  sceneRoot.addChild(emberLayer);
  const embers: Ember[] = [];
  let lastEmberAt = 0;

  const spawnEmber = (now: number): void => {
    if (embers.length >= EMBER_MAX_COUNT) return;
    const graphic = flatCircle(COLOR_SPARK);
    emberLayer.addChild(graphic);
    embers.push({
      graphic,
      bornAt: now,
      xFraction: 0.08 + Math.random() * 0.84,
      sway: 4 + Math.random() * 10,
      size: 1 + Math.random() * 1.6,
    });
  };

  // --- Fight replay state -----------------------------------------------------------------
  const tokenGuard = createAnimationTokenGuard();
  let fightToken: number | null = null;
  let fightStartMs: number | null = null;
  let fightWon = false;
  let pendingFoeGlyph: string | null = null;
  let shownStageId = store.getState().currentStageId;
  let foeYOffset = 0;
  let foeAlpha = 1;

  const glyphForStage = (stageId: number): string =>
    stages.some((stage) => stage.id === stageId) ? foeGlyphFor(stageId) : TROPHY_GLYPH;

  let slashTriggered = false;

  const startFight = (won: boolean): void => {
    fightToken = tokenGuard.next();
    fightStartMs = performance.now();
    fightWon = won;
    clashFlash.visible = false;
    slashTriggered = false;
  };

  const unsubscribeWon = events.on("battle:won", () => {
    startFight(true);
  });
  const unsubscribeLost = events.on("battle:lost", () => {
    startFight(false);
  });
  // Stage changes outside a fight replay (save load, hydrate) swap the foe immediately;
  // during a win replay the swap happens at the dissolve step instead.
  const unsubscribeStage = store.subscribe(
    (state) => state.currentStageId,
    (stageId) => {
      const glyph = glyphForStage(stageId);
      shownStageId = stageId;
      if (fightStartMs !== null) {
        pendingFoeGlyph = glyph;
      } else {
        setFighterGlyph(foe, glyph);
      }
    },
  );

  const clearFight = (): void => {
    fightToken = null;
    fightStartMs = null;
    clashFlash.visible = false;
    hero.text.tint = COLOR_WHITE;
    foe.text.tint = COLOR_WHITE;
    foeAlpha = 1;
    if (pendingFoeGlyph !== null) {
      setFighterGlyph(foe, pendingFoeGlyph);
      pendingFoeGlyph = null;
    }
  };

  // --- Per-frame layout + animation --------------------------------------------------------
  let lastFrameDeltaMs = 16;
  const onTick = (): void => {
    const rect = anchor.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      sceneRoot.visible = false;
      return;
    }
    sceneRoot.visible = true;

    const now = performance.now();
    const w = rect.width;
    const h = rect.height;
    const centerX = rect.left + w / 2;
    const groundY = rect.top + h * 0.68;
    const fighterScale = Math.min(h * 0.0042, 1.35);

    // Ritual floor: a full dark plane, a darker foreground strip, and the trodden lane the
    // fighters stand on (gold hairlines along its edges); then candle props framing it.
    groundField.position.set(centerX, rect.top + h * 0.5);
    groundField.scale.set(w, h);
    groundNear.position.set(centerX, rect.top + h * 0.92);
    groundNear.scale.set(w, h * 0.18);
    const laneH = h * 0.22;
    lane.position.set(centerX, groundY);
    lane.scale.set(w, laneH);
    laneEdgeTop.position.set(centerX, groundY - laneH / 2);
    laneEdgeTop.scale.set(w, 1.5);
    laneEdgeBottom.position.set(centerX, groundY + laneH / 2);
    laneEdgeBottom.scale.set(w, 1.5);
    for (const prop of candleProps) {
      const propScale = h * 0.12 * prop.scale;
      prop.container.position.set(rect.left + prop.xFraction * w, groundY + h * 0.02);
      prop.container.scale.set(propScale);
      // Candle flicker: small independent oscillations on flame size + halo strength.
      const flicker = Math.sin(now / 130 + prop.flickerPhase) * 0.5 + Math.sin(now / 47 + prop.flickerPhase * 3) * 0.5;
      prop.flame.scale.set(0.09 + flicker * 0.012, 0.14 + flicker * 0.02);
      prop.halo.alpha = 0.1 + (flicker + 1) * 0.03;
    }

    // Floor spans most of the anchor width.
    floor.position.set(centerX, groundY + h * 0.06);
    const floorScale = w * 0.44;
    for (const layer of [floorShadow, floorBase, floorBaseEdge, floorMist]) {
      layer.graphic.scale.set(layer.rx * floorScale, layer.ry * floorScale);
    }
    const mistPulse = 0.5 + 0.5 * Math.sin(now / 1700);
    floorMist.graphic.alpha = 0.06 + mistPulse * 0.1;

    // Fighter posts; approach animation moves them toward the center.
    const heroPostX = rect.left + w * 0.27;
    const foePostX = rect.left + w * 0.73;
    let heroX = heroPostX;
    let foeX = foePostX;
    let shakeX = 0;
    let shakeY = 0;
    foeYOffset = 0;

    if (fightStartMs !== null && fightToken !== null && tokenGuard.isCurrent(fightToken)) {
      const t = Math.min(1, (now - fightStartMs) / FIGHT_TOTAL_MS);
      const meetHeroX = rect.left + w * 0.44;
      const meetFoeX = rect.left + w * 0.56;

      if (t < PHASE_APPROACH_END) {
        const a = easeInOut(phaseT(t, 0, PHASE_APPROACH_END));
        heroX = heroPostX + (meetHeroX - heroPostX) * a;
        foeX = foePostX + (meetFoeX - foePostX) * a;
      } else if (t < PHASE_CLASH_END) {
        heroX = meetHeroX;
        foeX = meetFoeX;
        const c = phaseT(t, PHASE_APPROACH_END, PHASE_CLASH_END);
        clashFlash.visible = c < 0.6;
        clashFlash.position.set(centerX, groundY - h * 0.16);
        clashFlash.scale.set(h * 0.05 + c * h * 0.1);
        clashFlash.alpha = (1 - c) * 0.85;
        // One slash replay per fight, fired at the moment of impact (if loaded yet).
        const slash = slashSprites[fightWon ? "win" : "lose"];
        if (!slashTriggered && slash) {
          slashTriggered = true;
          slash.visible = true;
          slash.gotoAndPlay(0);
        }
        shakeX = (Math.random() - 0.5) * 6 * (1 - c);
        shakeY = (Math.random() - 0.5) * 4 * (1 - c);
        if (!fightWon && c > 0.5) hero.text.tint = COLOR_DANGER;
        if (fightWon && c > 0.5) foe.text.tint = COLOR_DANGER;
      } else if (t < PHASE_RETREAT_END) {
        clashFlash.visible = false;
        const r = easeInOut(phaseT(t, PHASE_CLASH_END, PHASE_RETREAT_END));
        heroX = meetHeroX + (heroPostX - meetHeroX) * r;
        foeX = meetFoeX + (foePostX - meetFoeX) * r;
      } else {
        const aft = phaseT(t, PHASE_RETREAT_END, 1);
        if (fightWon) {
          // Foe dissolves upward into motes; the next stage's foe fades in at the end.
          foeAlpha = 1 - aft;
          foeX = foePostX;
          foeYOffset = -aft * h * 0.1;
        } else {
          hero.text.tint = aft < 0.5 ? COLOR_DANGER : COLOR_WHITE;
          const pulse = 1 + Math.sin(aft * Math.PI) * 0.12;
          foe.text.scale.set(fighterScale * pulse);
        }
      }

      if (t >= 1) {
        const wasWin = fightWon;
        clearFight();
        if (wasWin) {
          setFighterGlyph(foe, glyphForStage(shownStageId));
          foeAlpha = 0; // fades back in below
        }
      }
    }

    // New foe fades back in after a dissolve.
    if (fightStartMs === null && foeAlpha < 1) {
      foeAlpha = Math.min(1, foeAlpha + lastFrameDeltaMs / 400);
    }
    foe.text.alpha = foeAlpha;

    // Idle bob (subtle, opposite phases so it reads as two living creatures).
    const bobHero = Math.sin(now / 520) * h * 0.008;
    const bobFoe = Math.sin(now / 480 + Math.PI) * h * 0.008;

    hero.text.position.set(heroX + shakeX, groundY + bobHero + shakeY);
    foe.text.position.set(
      foeX + shakeX * 0.6,
      (fightStartMs !== null && fightWon ? groundY + foeYOffset : groundY + bobFoe) + shakeY * 0.6,
    );
    if (fightStartMs === null || fightWon) {
      hero.text.scale.set(fighterScale);
    }
    if (fightStartMs === null) {
      foe.text.scale.set(fighterScale);
    }

    heroCircleGroup.position.set(heroX, groundY + h * 0.035);
    const heroCircleScale = h * 0.14;
    heroCircleOuter.graphic.scale.set(
      heroCircleOuter.rx * heroCircleScale,
      heroCircleOuter.ry * heroCircleScale,
    );
    heroCircleInner.graphic.scale.set(
      heroCircleInner.rx * heroCircleScale,
      heroCircleInner.ry * heroCircleScale,
    );
    foeCircleGroup.position.set(foeX, groundY + h * 0.035);
    const foeCircleScale = h * 0.14;
    foeCircleOuter.graphic.scale.set(
      foeCircleOuter.rx * foeCircleScale,
      foeCircleOuter.ry * foeCircleScale,
    );
    foeCircleInner.graphic.scale.set(
      foeCircleInner.rx * foeCircleScale,
      foeCircleInner.ry * foeCircleScale,
    );

    // A playing slash follows the clash point (and its shake) until it finishes.
    for (const kind of ["win", "lose"] as const) {
      const slash = slashSprites[kind];
      if (slash?.visible) {
        slash.position.set(centerX + shakeX, groundY - h * 0.16 + shakeY);
        slash.scale.set((h * 0.55) / 500); // frames are 500×500 art
      }
    }

    // Embers drift up across the arena.
    if (now - lastEmberAt > EMBER_SPAWN_INTERVAL_MS) {
      lastEmberAt = now;
      spawnEmber(now);
    }
    for (let i = embers.length - 1; i >= 0; i--) {
      const ember = embers[i];
      if (!ember) continue;
      const life = (now - ember.bornAt) / EMBER_LIFE_MS;
      if (life >= 1) {
        emberLayer.removeChild(ember.graphic);
        ember.graphic.destroy();
        embers.splice(i, 1);
        continue;
      }
      const x = rect.left + ember.xFraction * w + Math.sin(now / 700 + ember.xFraction * 20) * ember.sway;
      const y = groundY + h * 0.08 - life * h * 0.5;
      ember.graphic.position.set(x, y);
      ember.graphic.scale.set(ember.size);
      ember.graphic.alpha =
        life < 0.15 ? (life / 0.15) * 0.55 : 0.55 * (1 - phaseT(life, 0.15, 1));
    }
  };

  const tickWithDelta = (deltaMs: number): void => {
    lastFrameDeltaMs = deltaMs;
    onTick();
  };

  ticker.add(tickWithDelta);

  return () => {
    disposed = true;
    ticker.remove(tickWithDelta);
    unsubscribeWon();
    unsubscribeLost();
    unsubscribeStage();
    stage.removeChild(sceneRoot);
    sceneRoot.destroy({ children: true });
  };
}
