/**
 * Presentation-only mapping: ingredient id → engraved game-icons reagent (src/ui/icons.ts,
 * src/data/icon-paths.ts). Lives in ui/, not data/ — icon choices are cosmetics, and
 * data/*.json stays balance-only (CLAUDE.md rule 2).
 *
 * Replaces the old craftpix vegetable PNGs: those read as produce, not reagents, and clashed
 * with the dark engraved "Grimoire" look. Every reagent now has an icon in the one gravure
 * style; the SVGs are `currentColor`, so each inherits the surrounding text color.
 */
import type { IconName } from "../data/icon-paths";
import { iconEl } from "./icons";

const ICON_NAMES: Readonly<Record<string, IconName>> = {
  "dry-tinder": "ing-dry-tinder", // bundle of dead branches — kindling
  "clay-shard": "ing-clay-shard", // broken earthen pottery
  "firebrand-root": "ing-firebrand-root", // gnarled fiery root
  quicksilver: "ing-quicksilver", // bead of chemical/metal liquid
  "spring-water": "ing-spring-water", // paired water droplets
};

/** Returns the icon name for an ingredient, or undefined when it has none. */
export function ingredientIconName(id: string): IconName | undefined {
  return ICON_NAMES[id];
}

/** Builds the small inline `<svg>` used inside chips and captions. */
export function ingredientIconEl(id: string, className: string): SVGSVGElement | undefined {
  const name = ingredientIconName(id);
  if (name === undefined) return undefined;
  return iconEl(name, className);
}
