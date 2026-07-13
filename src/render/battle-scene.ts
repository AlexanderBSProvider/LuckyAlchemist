import {
  CircleGeometry,
  Group,
  Mesh,
  RingGeometry,
  Sprite,
  type MeshBasicMaterial,
  type Scene,
  type SpriteMaterial,
} from "three";
import { createAnimationTokenGuard } from "../lib/animation-token";
import { stages } from "../data";
import { foeGlyphFor } from "../data/glyphs";
import type { EventBus, GameEventMap } from "../store/events";
import type { GameState } from "../store/game-state";
import type { Store } from "../store/store";
import { flatColorMaterial, flatSpriteMaterial } from "./flat-material";
import { getGlyphTexture } from "./glyph-texture";
import type { RenderTicker } from "./three-app";

export interface BattleSceneDeps {
  events: EventBus<GameEventMap>;
  store: Store<GameState>;
  ticker: RenderTicker;
  /** The DOM element `ui/lab-panel.ts` reserves for the arena — the scene is drawn at
   * this element's screen rect every frame (same anchor pattern as cauldron-scene). */
  anchor: HTMLElement;
}

/* Grimoire palette (mirrors src/styles/grimoire.css tokens). */
const COLOR_GOLD = 0xc9a227;
const COLOR_EMERALD = 0x3fa372;
const COLOR_INK = 0xf2e9d8;
const COLOR_DANGER = 0xa3402f;
const COLOR_FLOOR = 0x1a1510;
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

let orderCounter = 0;
function nextOrder(): number {
  orderCounter += 1;
  return orderCounter;
}

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

function phaseT(t: number, from: number, to: number): number {
  return Math.max(0, Math.min(1, (t - from) / (to - from)));
}

interface EllipseLayer {
  readonly mesh: Mesh;
  readonly material: MeshBasicMaterial;
  readonly rx: number;
  readonly ry: number;
}

function buildEllipse(
  parent: Group,
  rx: number,
  ry: number,
  color: number,
  alpha: number,
  ring?: { innerFraction: number },
): EllipseLayer {
  const geometry = ring
    ? new RingGeometry(ring.innerFraction, 1, 64)
    : new CircleGeometry(1, 64);
  const material = flatColorMaterial(color, alpha);
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = nextOrder();
  parent.add(mesh);
  return { mesh, material, rx, ry };
}

interface Fighter {
  readonly sprite: Sprite;
  readonly material: SpriteMaterial;
  baseWidth: number;
  baseHeight: number;
}

function buildFighter(text: string): Fighter {
  const glyphTexture = getGlyphTexture({
    text,
    fontSize: FIGHTER_FONT_SIZE,
    color: COLOR_INK,
    dropShadow: { color: COLOR_SHADOW, alpha: 0.6, blur: 6, distance: 4 },
  });
  const material = flatSpriteMaterial(glyphTexture.texture);
  const sprite = new Sprite(material);
  sprite.center.set(0.5, 0.78);
  sprite.renderOrder = nextOrder();
  return { sprite, material, baseWidth: glyphTexture.width, baseHeight: glyphTexture.height };
}

function setFighterGlyph(fighter: Fighter, text: string): void {
  const glyphTexture = getGlyphTexture({
    text,
    fontSize: FIGHTER_FONT_SIZE,
    color: COLOR_INK,
    dropShadow: { color: COLOR_SHADOW, alpha: 0.6, blur: 6, distance: 4 },
  });
  fighter.material.map = glyphTexture.texture;
  fighter.material.needsUpdate = true;
  fighter.baseWidth = glyphTexture.width;
  fighter.baseHeight = glyphTexture.height;
}

interface Ember {
  readonly mesh: Mesh;
  readonly material: MeshBasicMaterial;
  readonly bornAt: number;
  readonly xFraction: number;
  readonly sway: number;
  readonly size: number;
}

/**
 * The autobattler arena — the game's persistent top scene, in the Grimoire visual
 * language: an engraved stone ring for a floor, gold rune-circles under the fighters,
 * ember motes drifting up, and glyph fighters. Fights resolve in the store on the
 * auto-battle timer (`main.ts`); this scene only replays `battle:won`/`battle:lost`
 * outcomes it hears on the event bus, never rolls anything itself.
 */
export function mountBattleScene(scene: Scene, deps: BattleSceneDeps): () => void {
  const { events, store, ticker, anchor } = deps;

  const sceneRoot = new Group();

  // --- Arena floor: layered ellipses read as an engraved summoning ground -------------
  const floor = new Group();
  const floorShadow = buildEllipse(floor, 1, 0.32, 0x000000, 0.5);
  const floorBase = buildEllipse(floor, 1, 0.3, COLOR_FLOOR, 1);
  const floorBaseEdge = buildEllipse(floor, 1, 0.3, COLOR_GOLD, 0.4, { innerFraction: 0.97 });
  const floorMist = buildEllipse(floor, 0.72, 0.2, COLOR_EMERALD, 0.08);

  // --- Rune circles under each fighter --------------------------------------------------
  const heroCircleGroup = new Group();
  const heroCircleOuter = buildEllipse(heroCircleGroup, 1, 0.3, COLOR_EMERALD, 0.5, {
    innerFraction: 0.9,
  });
  const heroCircleInner = buildEllipse(heroCircleGroup, 0.72, 0.216, COLOR_EMERALD, 0.3, {
    innerFraction: 0.94,
  });
  const foeCircleGroup = new Group();
  const foeCircleOuter = buildEllipse(foeCircleGroup, 1, 0.3, COLOR_DANGER, 0.5, {
    innerFraction: 0.9,
  });
  const foeCircleInner = buildEllipse(foeCircleGroup, 0.72, 0.216, COLOR_DANGER, 0.3, {
    innerFraction: 0.94,
  });

  // --- Fighters -------------------------------------------------------------------------
  const hero = buildFighter(ALCHEMIST_GLYPH);
  const foe = buildFighter(foeGlyphFor(store.getState().currentStageId));

  // Impact flash, hidden until a clash.
  const clashFlashMaterial = flatColorMaterial(COLOR_INK, 0.85);
  const clashFlash = new Mesh(new CircleGeometry(1, 32), clashFlashMaterial);
  clashFlash.renderOrder = nextOrder();
  clashFlash.visible = false;

  sceneRoot.add(floor, heroCircleGroup, foeCircleGroup, clashFlash, hero.sprite, foe.sprite);
  scene.add(sceneRoot);

  // --- Ambient embers --------------------------------------------------------------------
  const emberLayer = new Group();
  sceneRoot.add(emberLayer);
  const embers: Ember[] = [];
  let lastEmberAt = 0;

  const spawnEmber = (now: number): void => {
    if (embers.length >= EMBER_MAX_COUNT) return;
    const material = flatColorMaterial(COLOR_GOLD, 0.55);
    const mesh = new Mesh(new CircleGeometry(1, 12), material);
    mesh.renderOrder = nextOrder();
    emberLayer.add(mesh);
    embers.push({
      mesh,
      material,
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

  const startFight = (won: boolean): void => {
    fightToken = tokenGuard.next();
    fightStartMs = performance.now();
    fightWon = won;
    clashFlash.visible = false;
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
    hero.material.color.setHex(COLOR_WHITE);
    foe.material.color.setHex(COLOR_WHITE);
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

    // Floor spans most of the anchor width.
    floor.position.set(centerX, groundY + h * 0.06, 0);
    const floorScale = w * 0.44;
    for (const layer of [floorShadow, floorBase, floorBaseEdge, floorMist]) {
      layer.mesh.scale.set(layer.rx * floorScale, layer.ry * floorScale, 1);
    }
    const mistPulse = 0.5 + 0.5 * Math.sin(now / 1700);
    floorMist.material.opacity = 0.05 + mistPulse * 0.09;

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
        clashFlash.position.set(centerX, groundY - h * 0.16, 0);
        clashFlash.scale.set(h * 0.05 + c * h * 0.1, h * 0.05 + c * h * 0.1, 1);
        clashFlashMaterial.opacity = (1 - c) * 0.85;
        shakeX = (Math.random() - 0.5) * 6 * (1 - c);
        shakeY = (Math.random() - 0.5) * 4 * (1 - c);
        if (!fightWon && c > 0.5) hero.material.color.setHex(COLOR_DANGER);
        if (fightWon && c > 0.5) foe.material.color.setHex(COLOR_DANGER);
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
          hero.material.color.setHex(aft < 0.5 ? COLOR_DANGER : COLOR_WHITE);
          const pulse = 1 + Math.sin(aft * Math.PI) * 0.12;
          foe.sprite.scale.set(foe.baseWidth * fighterScale * pulse, foe.baseHeight * fighterScale * pulse, 1);
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
    foe.material.opacity = foeAlpha;

    // Idle bob (subtle, opposite phases so it reads as two living creatures).
    const bobHero = Math.sin(now / 520) * h * 0.008;
    const bobFoe = Math.sin(now / 480 + Math.PI) * h * 0.008;

    hero.sprite.position.set(heroX + shakeX, groundY + bobHero + shakeY, 0);
    foe.sprite.position.set(
      foeX + shakeX * 0.6,
      (fightStartMs !== null && fightWon ? groundY + foeYOffset : groundY + bobFoe) + shakeY * 0.6,
      0,
    );
    if (fightStartMs === null || fightWon) {
      hero.sprite.scale.set(hero.baseWidth * fighterScale, hero.baseHeight * fighterScale, 1);
    }
    if (fightStartMs === null) {
      foe.sprite.scale.set(foe.baseWidth * fighterScale, foe.baseHeight * fighterScale, 1);
    }

    heroCircleGroup.position.set(heroX, groundY + h * 0.035, 0);
    const heroCircleScale = h * 0.14;
    heroCircleOuter.mesh.scale.set(
      heroCircleOuter.rx * heroCircleScale,
      heroCircleOuter.ry * heroCircleScale,
      1,
    );
    heroCircleInner.mesh.scale.set(
      heroCircleInner.rx * heroCircleScale,
      heroCircleInner.ry * heroCircleScale,
      1,
    );
    foeCircleGroup.position.set(foeX, groundY + h * 0.035, 0);
    const foeCircleScale = h * 0.14;
    foeCircleOuter.mesh.scale.set(
      foeCircleOuter.rx * foeCircleScale,
      foeCircleOuter.ry * foeCircleScale,
      1,
    );
    foeCircleInner.mesh.scale.set(
      foeCircleInner.rx * foeCircleScale,
      foeCircleInner.ry * foeCircleScale,
      1,
    );

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
        emberLayer.remove(ember.mesh);
        ember.mesh.geometry.dispose();
        ember.material.dispose();
        embers.splice(i, 1);
        continue;
      }
      const x = rect.left + ember.xFraction * w + Math.sin(now / 700 + ember.xFraction * 20) * ember.sway;
      const y = groundY + h * 0.08 - life * h * 0.5;
      ember.mesh.position.set(x, y, 0);
      ember.mesh.scale.set(ember.size, ember.size, 1);
      ember.material.opacity =
        life < 0.15 ? (life / 0.15) * 0.55 : 0.55 * (1 - phaseT(life, 0.15, 1));
    }
  };

  const tickWithDelta = (deltaMs: number): void => {
    lastFrameDeltaMs = deltaMs;
    onTick();
  };

  ticker.add(tickWithDelta);

  return () => {
    ticker.remove(tickWithDelta);
    unsubscribeWon();
    unsubscribeLost();
    unsubscribeStage();
    scene.remove(sceneRoot);
  };
}
