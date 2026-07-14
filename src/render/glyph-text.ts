import { Text, type TextStyleOptions } from "pixi.js";

export interface GlyphDropShadow {
  readonly color: number;
  readonly alpha: number;
  readonly blur: number;
  readonly distance: number;
}

export interface GlyphOptions {
  readonly text: string;
  readonly fontSize: number;
  readonly color: number;
  readonly dropShadow?: GlyphDropShadow;
}

const FONT_FAMILY = ["Segoe UI Emoji", "Noto Color Emoji", "sans-serif"];

function styleFor(options: GlyphOptions): TextStyleOptions {
  return {
    fontFamily: FONT_FAMILY,
    fontSize: options.fontSize,
    fill: options.color,
    dropShadow: options.dropShadow
      ? {
          color: options.dropShadow.color,
          alpha: options.dropShadow.alpha,
          blur: options.dropShadow.blur,
          distance: options.dropShadow.distance,
          // Matches the old canvas-baked shadow, whose offsetX/offsetY were equal
          // (distance * 0.7 each) — a 45-degree direction.
          angle: Math.PI / 4,
        }
      : false,
  };
}

/**
 * Glyphs (unicode symbols/emoji, GAME-DESIGN.md §8 — no art assets) rendered with Pixi's
 * native `Text`, replacing the `CanvasTexture`-baking workaround `glyph-texture.ts` needed
 * under Three.js. No cache here: Pixi's text system already caches the rasterized glyph
 * texture internally per style/content. Callers must set `.anchor` themselves — Pixi `Text`
 * defaults to `(0,0)`, unlike Three `Sprite`'s `(0.5,0.5)`.
 */
export function createGlyphText(options: GlyphOptions): Text {
  return new Text({ text: options.text, style: styleFor(options) });
}

export function updateGlyphText(text: Text, options: GlyphOptions): void {
  text.text = options.text;
  text.style = styleFor(options);
}
