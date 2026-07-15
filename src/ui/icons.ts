import { ICON_PATHS, ICON_VIEWBOX, type IconName } from "../data/icon-paths";

/**
 * DOM icon factory for the engraved game-icons set (src/data/icon-paths.ts). Builds an
 * inline `<svg>` whose paths use `fill="currentColor"`, so the icon's color is whatever CSS
 * `color` the element inherits — gold on a HUD chip, rarity tint on a potion tile, parchment
 * ink on a tab. The `render/` side bakes the same paths into Pixi textures
 * (icon-textures.ts); this is the DOM half of that one shared dictionary.
 */
const SVG_NS = "http://www.w3.org/2000/svg";

export function iconEl(name: IconName, className = ""): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${String(ICON_VIEWBOX)} ${String(ICON_VIEWBOX)}`);
  svg.setAttribute("aria-hidden", "true"); // decorative — adjacent text carries the meaning
  svg.setAttribute("focusable", "false");
  if (className) svg.setAttribute("class", className);
  // ICON_PATHS values are static, bundled asset strings (no user input) — safe to inline.
  svg.innerHTML = ICON_PATHS[name];
  return svg;
}
