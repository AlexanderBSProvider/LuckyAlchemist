import { Container, Graphics } from "pixi.js";
import { createGlyphText, updateGlyphText } from "../glyph-text";

/**
 * A fighter the arena can choreograph without caring what it's made of — an emoji glyph
 * (`GlyphRig`, the legacy look), the code-drawn alchemist (`hero-rig.ts`), or a beast
 * (`foe-rig.ts`). The fight replay in `battle-scene.ts` only ever touches four things on a
 * fighter — position, scale, alpha, and a hurt tint — so that is the whole contract.
 *
 * Rigs are authored feet-at-origin (local `y = 0` is the ground, up is negative) and about
 * `FIGHTER_FONT_SIZE` units tall, so the scene can size them with the same `fighterScale`
 * it used on the old glyph `Text`. `root` is the handle the scene positions/scales/fades.
 */
export interface FighterRig {
  readonly root: Container;
  /** Internal life the scene doesn't drive: limb sway, blink, overlay pulses. Per frame. */
  update(nowMs: number, deltaMs: number): void;
  /** Hurt tint on the body parts (replaces the old `text.tint = danger`). */
  setHurt(active: boolean): void;
  destroy(): void;
}

// Shared "engraved Grimoire" fighter palette (mirrors src/styles/grimoire.css tokens),
// used by every rig so hero, foe, and glyph read as one illustration set.
export const FIGHTER_FONT_SIZE = 64;
export const RIG_INK = 0xede4cf; // parchment ink line / glyph fill (--color-ink)
export const RIG_HURT = 0xc94433; // clash / hurt tint (--color-danger)
export const RIG_WHITE = 0xffffff; // untinted
export const RIG_SHADOW = 0x000000;
export const RIG_GOLD = 0xc9a227; // engraved gold accents (--color-primary)
/** Hairline stroke width in rig-local units (rig is ~64 units tall). */
export const RIG_HAIRLINE = 1.4;

const GLYPH_SHADOW = { color: RIG_SHADOW, alpha: 0.6, blur: 6, distance: 4 };

/**
 * Draws a filled shape and re-strokes its outline with a thin gold hairline — the engraved
 * look every rig part shares (2–3 flat value fills + a gold outline, the cauldron recipe).
 * The `draw` callback receives a fresh `Graphics` and should lay down the path once; this
 * fills it, then strokes the same path.
 */
export function engraved(
  parent: Container,
  fill: number,
  draw: (g: Graphics) => void,
  opts: { hairline?: number; hairlineAlpha?: number; fillAlpha?: number } = {},
): Graphics {
  const g = new Graphics();
  draw(g);
  g.fill({ color: fill, alpha: opts.fillAlpha ?? 1 });
  draw(g);
  g.stroke({
    width: opts.hairline ?? RIG_HAIRLINE,
    color: RIG_GOLD,
    alpha: opts.hairlineAlpha ?? 0.5,
    alignment: 0.5,
  });
  parent.addChild(g);
  return g;
}

/** A soft additive-looking glow disc (used for auras, eye glow, sigil backing). */
export function glowDisc(color: number, radius: number, alpha: number): Graphics {
  const g = new Graphics().circle(0, 0, radius).fill({ color, alpha });
  return g;
}

export interface GlyphRig extends FighterRig {
  setGlyph(text: string): void;
}

/**
 * The legacy emoji fighter, wrapped in the `FighterRig` contract. Pixel-identical to the
 * old `buildFighter`/`setFighterGlyph` path: a `Text` at `fontSize` `FIGHTER_FONT_SIZE`,
 * anchored near the feet `(0.5, 0.78)`, at the rig's local origin — so the scene setting
 * `root.position`/`root.scale`/`root.alpha` reproduces exactly what it did on `.text`.
 */
export function createGlyphRig(text: string): GlyphRig {
  const root = new Container();
  const glyph = createGlyphText({
    text,
    fontSize: FIGHTER_FONT_SIZE,
    color: RIG_INK,
    dropShadow: GLYPH_SHADOW,
  });
  glyph.anchor.set(0.5, 0.78);
  root.addChild(glyph);

  return {
    root,
    update() {
      // Emoji glyphs have no internal animation; the scene owns their bob.
    },
    setHurt(active) {
      glyph.tint = active ? RIG_HURT : RIG_WHITE;
    },
    setGlyph(next) {
      updateGlyphText(glyph, {
        text: next,
        fontSize: FIGHTER_FONT_SIZE,
        color: RIG_INK,
        dropShadow: GLYPH_SHADOW,
      });
    },
    destroy() {
      root.destroy({ children: true });
    },
  };
}
