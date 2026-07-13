import { CanvasTexture } from "three";

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

export interface GlyphTexture {
  readonly texture: CanvasTexture;
  /** Texture pixel size — use as the base for a `Sprite`'s `scale`. */
  readonly width: number;
  readonly height: number;
}

function rgba(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const cache = new Map<string, GlyphTexture>();
let measureCtx: CanvasRenderingContext2D | null = null;

/**
 * Bakes a glyph (unicode symbol/emoji, GAME-DESIGN.md §8 — no art assets) into a
 * `CanvasTexture`, the Three.js stand-in for Pixi's built-in `Text`. Results are cached by
 * their full option set since the same handful of glyphs (ring symbols, bestiary, alchemist)
 * repeat across frames and scene remounts.
 */
export function getGlyphTexture(options: GlyphOptions): GlyphTexture {
  const key = JSON.stringify(options);
  const cached = cache.get(key);
  if (cached) return cached;

  const { text, fontSize, color, dropShadow } = options;
  const font = `${fontSize}px "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) throw new Error("glyph-texture: 2D canvas context unavailable");
  measureCtx.font = font;
  const textWidth = measureCtx.measureText(text).width;

  const shadowPad = dropShadow ? dropShadow.blur + dropShadow.distance : 0;
  const pad = fontSize * 0.5 + shadowPad;
  const width = Math.ceil(textWidth + pad * 2);
  const height = Math.ceil(fontSize * 1.4 + pad * 2);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("glyph-texture: 2D canvas context unavailable");

  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (dropShadow) {
    ctx.shadowColor = rgba(dropShadow.color, dropShadow.alpha);
    ctx.shadowBlur = dropShadow.blur;
    ctx.shadowOffsetX = dropShadow.distance * 0.7;
    ctx.shadowOffsetY = dropShadow.distance * 0.7;
  }
  ctx.fillStyle = rgba(color, 1);
  ctx.fillText(text, width / 2, height / 2);

  const texture = new CanvasTexture(canvas);
  const result: GlyphTexture = { texture, width, height };
  cache.set(key, result);
  return result;
}
