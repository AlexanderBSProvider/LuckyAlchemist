/**
 * Presentation-only mapping: ingredient id → icon from the craftpix vegetables pack
 * (src/assets/craftpix-net-717437…, docs/CREDITS.md). Lives in ui/, not data/ — icon
 * files are cosmetics, and data/*.json stays balance-only (CLAUDE.md rule 2).
 *
 * The mapping is curated and deliberately partial: an ingredient only gets an icon when
 * some pack image genuinely reads as that reagent on the dark deck; the rest keep their
 * text-only chips. Icon PNGs are ~250×250 with a thick dark outline, shown at ~20px.
 */
import clayShardUrl from "../assets/craftpix-net-717437-free-vegetables-vector-icon-pack-for-rpg/PNG/without_shadow/31.png";
import dryTinderUrl from "../assets/craftpix-net-717437-free-vegetables-vector-icon-pack-for-rpg/PNG/without_shadow/23.png";
import firebrandRootUrl from "../assets/craftpix-net-717437-free-vegetables-vector-icon-pack-for-rpg/PNG/without_shadow/45.png";
import quicksilverUrl from "../assets/craftpix-net-717437-free-vegetables-vector-icon-pack-for-rpg/PNG/without_shadow/39.png";

const ICON_URLS: Readonly<Record<string, string>> = {
  "dry-tinder": dryTinderUrl, // dried herb bundle — kindling
  "clay-shard": clayShardUrl, // rough earthen root — clay lump
  "firebrand-root": firebrandRootUrl, // fiery orange root
  quicksilver: quicksilverUrl, // pale round orb — quicksilver bead
  // "spring-water" has no convincing match in the pack — text-only chip.
};

/** Returns the icon URL for an ingredient, or undefined when it has none. */
export function ingredientIconUrl(id: string): string | undefined {
  return ICON_URLS[id];
}

/** Builds the small inline `<img>` used inside chips and captions. */
export function ingredientIconEl(id: string, className: string): HTMLImageElement | undefined {
  const url = ingredientIconUrl(id);
  if (url === undefined) return undefined;
  const img = document.createElement("img");
  img.src = url;
  img.alt = ""; // decorative — the adjacent text names the ingredient
  img.className = className;
  return img;
}
