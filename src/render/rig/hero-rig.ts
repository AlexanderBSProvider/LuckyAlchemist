import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { loadIconTexture } from "../icon-textures";
import {
  engraved,
  glowDisc,
  type FighterRig,
  RIG_GOLD,
  RIG_HAIRLINE,
  RIG_HURT,
  RIG_WHITE,
} from "./fighter-rig";
import type { BodyPart, MutationVisual } from "./mutation-visuals";

/**
 * The alchemist, drawn from code as a paper-doll (no art assets — same decision as the
 * cauldron, cauldron-scene.ts). A base silhouette of stacked part containers plus six
 * overlay channels that equipped mutations light up (see mutation-visuals.ts). Authored
 * feet-at-origin in the shared rig unit space (see fighter-rig.ts): `y = 0` is the ground,
 * up is negative, the figure is ~64 units tall so the arena sizes it like the old glyph.
 */

// --- Base palette (dark Grimoire robe tones) --------------------------------------------
const ROBE = 0x2c2338;
const ROBE_DARK = 0x1e1728;
const CLOAK = 0x241a30;
const CLOAK_DARK = 0x1a1222;
const SKIN = 0xd7c6a4;
const SKIN_SHADE = 0xb69f79;
const BEARD = 0x9c9384;
const BOOT = 0x181109;
const STAFF_WOOD = 0x4a3720;
const EYE = 0x14100a;

// --- Drink-and-transform ceremony timings (presentation only) ---------------------------
const MOMENT_MS = 1100;
const DRINK_PEAK = 0.32; // arm fully raised / head tipped back
const OVERLAY_POP_AT = 0.4; // the new mutation overlay starts bouncing in here
const BURST_COUNT_BASE = 4;

export interface HeroRig extends FighterRig {
  /** Rebuild overlays to match the loadout. Idempotent — safe to call every state change. */
  applyMutations(loadout: readonly MutationVisual[]): void;
  /** Drink pose + overlay pop-in for one freshly-equipped mutation. Returns a cancel fn. */
  playMutationMoment(visual: MutationVisual): () => void;
}

interface BurstMote {
  readonly graphic: Graphics;
  readonly angle: number;
  readonly speed: number;
  readonly bornAt: number;
}

/** Per-part animated overlay state the tick reads (glow pulse, orbit, wisp drift). */
interface PartOverlay {
  readonly container: Container;
  readonly visual: MutationVisual;
  readonly motes: Graphics[]; // glands wisps / core orbit motes (part-specific meaning)
  glowNodes: Graphics[]; // discs whose alpha pulses with the element
}

export function createHeroRig(): HeroRig {
  const root = new Container();

  // Overlay layers: fxUnder paints behind the body (auras), fxOver in front (sigils, motes).
  const fxUnder = new Container();
  const cloakBack = new Container();
  const legs = new Container();
  const armBack = new Container();
  const torso = new Container();
  const head = new Container();
  const armFront = new Container();
  const fxOver = new Container();
  root.addChild(fxUnder, cloakBack, legs, armBack, torso, head, armFront, fxOver);

  // --- Cloak (behind everything), sways in update() -------------------------------------
  engraved(
    cloakBack,
    CLOAK,
    (g) =>
      g
        .moveTo(-9, -44)
        .lineTo(9, -44)
        .lineTo(15, -6)
        .quadraticCurveTo(0, 2, -15, -6)
        .closePath(),
    { hairlineAlpha: 0.3 },
  );
  engraved(cloakBack, CLOAK_DARK, (g) =>
    g.moveTo(0, -44).lineTo(6, -8).quadraticCurveTo(0, -4, -6, -8).closePath(),
  );

  // --- Legs + robe hem ------------------------------------------------------------------
  engraved(legs, ROBE_DARK, (g) =>
    g.moveTo(-9, -26).lineTo(9, -26).lineTo(12, -3).quadraticCurveTo(0, 1, -12, -3).closePath(),
  );
  for (const bx of [-5, 5]) {
    engraved(legs, BOOT, (g) => g.roundRect(bx - 3.4, -5, 6.8, 5, 1.6));
  }

  // --- Staff (back arm), drawn before torso so the body overlaps the grip -----------------
  const staff = new Graphics()
    .moveTo(-13, -50)
    .lineTo(-15, -2)
    .stroke({ width: 2, color: STAFF_WOOD });
  const staffOrbBase = new Graphics().circle(-13, -52, 3.2).fill({ color: RIG_GOLD, alpha: 0.85 });
  const staffOrbTint = glowDisc(RIG_WHITE, 3.6, 0); // element recolor, off until arms mutation
  staffOrbTint.position.set(-13, -52);
  armBack.addChild(staff, staffOrbBase, staffOrbTint);

  // --- Torso (robe) + belt + tiny flask -------------------------------------------------
  engraved(torso, ROBE, (g) =>
    g.moveTo(-10, -46).lineTo(10, -46).lineTo(9, -25).lineTo(-9, -25).closePath(),
  );
  engraved(torso, ROBE_DARK, (g) => g.moveTo(0, -46).lineTo(4, -26).lineTo(-4, -26).closePath(), {
    hairlineAlpha: 0.25,
  });
  const beltBase = new Graphics()
    .roundRect(-9.5, -28, 19, 3.4, 1)
    .fill({ color: ROBE_DARK })
    .roundRect(-9.5, -28, 19, 3.4, 1)
    .stroke({ width: RIG_HAIRLINE, color: RIG_GOLD, alpha: 0.6 });
  const flask = new Graphics()
    .roundRect(4, -27.5, 3, 4.4, 1)
    .fill({ color: 0x3fa372, alpha: 0.85 });
  torso.addChild(beltBase, flask);

  // --- Front arm (free hand) — the one that raises to drink -----------------------------
  const armFrontShape = new Container();
  engraved(armFrontShape, ROBE, (g) =>
    g.moveTo(8, -45).quadraticCurveTo(15, -38, 13, -30).lineTo(9, -31).lineTo(6, -43).closePath(),
  );
  const hand = new Graphics().circle(13, -30, 2.6).fill({ color: SKIN });
  armFrontShape.addChild(hand);
  armFront.addChild(armFrontShape);

  // --- Head: face + beard + eyes + wide-brim pointed hat --------------------------------
  engraved(head, SKIN, (g) => g.ellipse(0, -50, 6.2, 6.8));
  engraved(head, SKIN_SHADE, (g) => g.ellipse(1.6, -49, 4.4, 5.6), { hairlineAlpha: 0 });
  // Beard wedge under the face.
  engraved(head, BEARD, (g) =>
    g.moveTo(-5, -49).quadraticCurveTo(0, -40, 5, -49).quadraticCurveTo(0, -46, -5, -49).closePath(),
  );
  const eyeL = new Graphics().circle(-2, -51, 0.9).fill({ color: EYE });
  const eyeR = new Graphics().circle(2.4, -51, 0.9).fill({ color: EYE });
  head.addChild(eyeL, eyeR);
  // Wide-brim pointed hat — the silhouette maker.
  engraved(head, CLOAK, (g) => g.ellipse(0, -55, 11, 2.8));
  engraved(head, ROBE, (g) =>
    g.moveTo(-6.5, -55).quadraticCurveTo(-2, -74, 3, -72).quadraticCurveTo(5, -62, 6.5, -55).closePath(),
  );

  // --- Mutation overlays ----------------------------------------------------------------
  const overlays = new Map<BodyPart, PartOverlay>();

  const clearOverlays = (): void => {
    for (const overlay of overlays.values()) {
      overlay.container.destroy({ children: true });
    }
    overlays.clear();
    staffOrbTint.alpha = 0;
    staffOrbTint.tint = RIG_WHITE;
  };

  /** Loads the engraved element icon into a chest-sigil sprite (guards stale async). */
  const loadSigil = (sprite: Sprite, visual: MutationVisual, requestKey: symbol): void => {
    void loadIconTexture(visual.iconName, visual.element.secondary, 64).then((texture) => {
      if (sigilRequests.get(sprite) === requestKey) sprite.texture = texture;
    });
  };
  const sigilRequests = new WeakMap<Sprite, symbol>();

  const buildOverlay = (visual: MutationVisual): PartOverlay => {
    const container = new Container();
    const motes: Graphics[] = [];
    const glowNodes: Graphics[] = [];
    const { primary, secondary } = visual.element;
    const alpha = 0.35 + visual.intensity * 0.45;

    switch (visual.part) {
      case "arms": {
        // Recolor the forearm + staff orb; grade ≥ 2 adds claw spikes at the hand.
        const glow = glowDisc(primary, 3, alpha * 0.7);
        glow.position.set(13, -30);
        glowNodes.push(glow);
        container.addChild(glow);
        staffOrbTint.tint = primary;
        staffOrbTint.alpha = alpha;
        if (visual.tier >= 2) {
          for (const dx of [-2.4, 0, 2.4]) {
            container.addChild(
              new Graphics()
                .moveTo(13 + dx, -30)
                .lineTo(13 + dx * 1.4, -24)
                .lineTo(13 + dx + 1, -29)
                .closePath()
                .fill({ color: secondary, alpha }),
            );
          }
        }
        fxOver.addChild(container);
        break;
      }
      case "skin": {
        // Element-tinted rune strokes over the robe trim + belt.
        const runes = new Graphics()
          .moveTo(-9, -44)
          .lineTo(9, -44)
          .moveTo(-9, -25)
          .lineTo(9, -25)
          .roundRect(-9.5, -28, 19, 3.4, 1)
          .stroke({ width: RIG_HAIRLINE, color: primary, alpha });
        container.addChild(runes);
        fxOver.addChild(container);
        break;
      }
      case "eyes": {
        // Glowing eye discs + soft halo; grade ≥ 2 adds twin light streaks.
        for (const ex of [-2, 2.4]) {
          const halo = glowDisc(primary, 2.4, alpha * 0.5);
          halo.position.set(ex, -51);
          const core = glowDisc(secondary, 1, Math.min(1, alpha + 0.3));
          core.position.set(ex, -51);
          glowNodes.push(halo, core);
          container.addChild(halo, core);
        }
        if (visual.tier >= 2) {
          container.addChild(
            new Graphics()
              .moveTo(-3, -52)
              .lineTo(-7, -53)
              .moveTo(3.4, -52)
              .lineTo(7.4, -53)
              .stroke({ width: 1, color: secondary, alpha }),
          );
        }
        fxOver.addChild(container);
        break;
      }
      case "heart": {
        // Pulsing chest sigil: a glow disc backing an engraved element icon.
        const glow = glowDisc(primary, 4.2, alpha * 0.8);
        glow.position.set(0, -38);
        glowNodes.push(glow);
        const sigil = new Sprite(Texture.EMPTY);
        sigil.anchor.set(0.5);
        sigil.width = 7;
        sigil.height = 7;
        sigil.position.set(0, -38);
        const key = Symbol("sigil");
        sigilRequests.set(sigil, key);
        loadSigil(sigil, visual, key);
        container.addChild(glow, sigil);
        fxOver.addChild(container);
        break;
      }
      case "glands": {
        // Drifting speed-wisps at the feet; count + rate scale with intensity.
        const count = 2 + Math.round(visual.intensity * 3);
        for (let i = 0; i < count; i += 1) {
          const wisp = glowDisc(primary, 1.4, alpha);
          motes.push(wisp);
          container.addChild(wisp);
        }
        fxUnder.addChild(container);
        break;
      }
      case "core": {
        // Motes orbiting the hat tip; count grows with grade.
        const count = visual.tier + 1;
        for (let i = 0; i < count; i += 1) {
          const mote = glowDisc(secondary, 1.3, Math.min(1, alpha + 0.2));
          motes.push(mote);
          container.addChild(mote);
        }
        const halo = new Graphics()
          .ellipse(1, -68, 7, 3)
          .stroke({ width: 1, color: primary, alpha: alpha * 0.5 });
        container.addChild(halo);
        fxOver.addChild(container);
        break;
      }
    }
    return { container, visual, motes, glowNodes };
  };

  const applyMutations = (loadout: readonly MutationVisual[]): void => {
    clearOverlays();
    for (const visual of loadout) {
      overlays.set(visual.part, buildOverlay(visual));
    }
  };

  // --- Drink-and-transform ceremony ------------------------------------------------------
  let momentStartMs: number | null = null;
  let momentPart: BodyPart | null = null;
  let momentIntensity = 0;
  let burstColor = RIG_GOLD;
  let burstDone = false;
  const burstMotes: BurstMote[] = [];

  const spawnBurst = (now: number, count: number): void => {
    for (let i = 0; i < count; i += 1) {
      const graphic = glowDisc(burstColor, 1.6, 0.9);
      fxOver.addChild(graphic);
      burstMotes.push({
        graphic,
        angle: (i / count) * Math.PI * 2 + Math.random() * 0.6,
        speed: 14 + Math.random() * 12,
        bornAt: now,
      });
    }
  };

  const playMutationMoment = (visual: MutationVisual): (() => void) => {
    momentStartMs = performance.now();
    momentPart = visual.part;
    momentIntensity = visual.intensity;
    burstColor = visual.element.secondary;
    burstDone = false;
    return () => {
      momentStartMs = null;
      momentPart = null;
    };
  };

  // --- Per-frame internal life -----------------------------------------------------------
  let blinkPhase = Math.random() * 4000;

  const update = (now: number, deltaMs: number): void => {
    // Cloak + staff sway, gentle so it reads alive without wobbling.
    const sway = Math.sin(now / 900) * 0.03;
    cloakBack.rotation = sway;
    armBack.rotation = Math.sin(now / 1100) * 0.015;

    // Blink: squash the eye discs every ~4s.
    blinkPhase += deltaMs;
    const blink = blinkPhase % 4000 < 120 ? 0.15 : 1;
    eyeL.scale.y = blink;
    eyeR.scale.y = blink;

    // Animated overlays.
    for (const overlay of overlays.values()) {
      const { visual, motes, glowNodes } = overlay;
      const pulse = 0.7 + 0.3 * Math.sin(now / 420 + visual.tier);
      const glowAlpha = pulse * (0.4 + visual.intensity * 0.5);
      for (const node of glowNodes) node.alpha = glowAlpha;

      if (visual.part === "glands") {
        motes.forEach((mote, i) => {
          const t = ((now / 700 + i / motes.length) % 1);
          mote.position.set(-8 + i * 4 + Math.sin(now / 300 + i) * 1.5, -2 - t * 10);
          mote.alpha = (1 - t) * (0.4 + visual.intensity * 0.5);
        });
      } else if (visual.part === "core") {
        motes.forEach((mote, i) => {
          const a = now / 700 + (i / motes.length) * Math.PI * 2;
          mote.position.set(1 + Math.cos(a) * 8, -68 + Math.sin(a) * 3);
        });
      }
    }

    // Drink-and-transform pose.
    let armLift = 0;
    let headTip = 0;
    if (momentStartMs !== null) {
      const t = Math.min(1, (now - momentStartMs) / MOMENT_MS);
      const rise = t < DRINK_PEAK ? t / DRINK_PEAK : Math.max(0, 1 - (t - DRINK_PEAK) / (1 - DRINK_PEAK));
      armLift = rise;
      headTip = rise * 0.18;
      if (!burstDone && t >= OVERLAY_POP_AT) {
        burstDone = true;
        spawnBurst(now, BURST_COUNT_BASE + Math.round(momentIntensity * 6));
      }
      // Pop the freshly-equipped overlay in with a bounce.
      if (momentPart) {
        const overlay = overlays.get(momentPart);
        if (overlay) {
          const p = t < OVERLAY_POP_AT ? 0 : Math.min(1, (t - OVERLAY_POP_AT) / (1 - OVERLAY_POP_AT));
          const bounce = p < 1 ? 1.25 * Math.sin(p * Math.PI * 0.5) : 1;
          overlay.container.scale.set(p === 0 ? 0 : bounce);
        }
      }
      if (t >= 1) {
        momentStartMs = null;
        momentPart = null;
      }
    }
    armFront.rotation = -armLift * 0.5;
    armFront.position.set(-armLift * 3, -armLift * 2);
    head.rotation = -headTip;

    // Advance / retire burst motes.
    for (let i = burstMotes.length - 1; i >= 0; i -= 1) {
      const mote = burstMotes[i];
      if (!mote) continue;
      const life = (now - mote.bornAt) / 700;
      if (life >= 1) {
        mote.graphic.destroy();
        burstMotes.splice(i, 1);
        continue;
      }
      const dist = mote.speed * life;
      mote.graphic.position.set(
        Math.cos(mote.angle) * dist,
        -38 + Math.sin(mote.angle) * dist - life * 6,
      );
      mote.graphic.alpha = (1 - life) * 0.9;
    }
  };

  const setHurt = (active: boolean): void => {
    const tint = active ? RIG_HURT : RIG_WHITE;
    for (const part of [legs, torso, head, armFront, armBack, cloakBack]) part.tint = tint;
  };

  const destroy = (): void => {
    root.destroy({ children: true });
  };

  return { root, update, setHurt, destroy, applyMutations, playMutationMoment };
}
