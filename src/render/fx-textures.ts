import { Assets, type Texture } from "pixi.js";

/**
 * Lazy loader for the craftpix slash-FX frame sets (src/assets/craftpix-net-501088…,
 * see docs/CREDITS.md). Only the frame *URLs* are bundled eagerly (a few strings via
 * Vite's glob import); the PNG textures themselves are fetched on first use, so the
 * initial bundle stays small (ROADMAP budget).
 *
 * Set 3 is the gold slash (win clash), set 5 the crimson one (loss clash) — both sit
 * naturally on the dark Grimoire arena.
 */
export type SlashKind = "win" | "lose";

/** Sorts a glob result by numeric frame filename ("1.png" … "10.png"). */
function frameUrls(glob: Record<string, unknown>): string[] {
  return Object.entries(glob)
    .map(([path, url]) => ({
      frame: Number.parseInt(path.split("/").pop() ?? "0", 10),
      url: url as string,
    }))
    .sort((a, b) => a.frame - b.frame)
    .map((entry) => entry.url);
}

const SLASH_URLS: Record<SlashKind, string[]> = {
  win: frameUrls(
    import.meta.glob(
      "../assets/craftpix-net-501088-free-slash-sprite-cartoon-effects/PNG/3/*.png",
      { eager: true, query: "?url", import: "default" },
    ),
  ),
  lose: frameUrls(
    import.meta.glob(
      "../assets/craftpix-net-501088-free-slash-sprite-cartoon-effects/PNG/5/*.png",
      { eager: true, query: "?url", import: "default" },
    ),
  ),
};

const cache = new Map<SlashKind, Promise<Texture[]>>();

/** Loads (once) and returns the ordered textures for one slash animation. */
export function loadSlashFrames(kind: SlashKind): Promise<Texture[]> {
  let pending = cache.get(kind);
  if (!pending) {
    pending = Promise.all(SLASH_URLS[kind].map((url) => Assets.load<Texture>(url)));
    cache.set(kind, pending);
  }
  return pending;
}
