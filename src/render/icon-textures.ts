import { Texture } from "pixi.js";
import { ICON_PATHS, ICON_VIEWBOX, type IconName } from "../data/icon-paths";

/**
 * Pixi half of the shared game-icons dictionary (src/data/icon-paths.ts, DOM half in
 * ui/icons.ts). A canvas can't read a CSS `currentColor`, so here the color is baked into
 * the SVG string before it's rasterized: `<path fill="currentColor">` → the concrete hex,
 * drawn once to an offscreen canvas at the requested pixel size, wrapped as a `Texture`.
 * Cached by (name, color, size) so repeat requests are free — same lazy-cache shape as
 * fx-textures.ts.
 */
function toHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function svgDataUri(name: IconName, color: number): string {
  const body = ICON_PATHS[name].replaceAll("currentColor", toHex(color));
  // Explicit width/height (not just viewBox) — some engines give an SVG without them a zero
  // intrinsic size, which then draws nothing onto the canvas.
  const v = String(ICON_VIEWBOX);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${v}" height="${v}" viewBox="0 0 ${v} ${v}">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function rasterize(uri: string, size: number): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("icon-textures: no 2d context"));
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      resolve(Texture.from(canvas));
    };
    img.onerror = (): void => {
      reject(new Error(`icon-textures: SVG failed to rasterize`));
    };
    img.src = uri;
  });
}

const cache = new Map<string, Promise<Texture>>();

/** Loads (once) a colored, size-`size` texture of an engraved icon. */
export function loadIconTexture(name: IconName, color: number, size = 128): Promise<Texture> {
  const key = `${name}|${String(color)}|${String(size)}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = rasterize(svgDataUri(name, color), size);
    cache.set(key, pending);
  }
  return pending;
}
