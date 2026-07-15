import { elementIconName } from "../data/glyphs";
import type { IconName } from "../data/icon-paths";
import type { GradeId, RarityTier } from "../data/schemas";
import { iconEl } from "./icons";

/**
 * Combinatorial potion sigil (GAME-DESIGN.md §8: "silhouette × rarity color × stamp"). A
 * flask silhouette chosen by grade, tinted the potion's rarity color, with the element
 * symbol stamped over its belly. Pure inline-SVG composition — no art files, no data/*.json
 * touched; rarity colors come from the `--rar` custom property (lab-panel.css rar-* classes).
 */
const GRADE_FLASK: Record<GradeId, IconName> = {
  tincture: "flask-tincture",
  elixir: "flask-elixir",
  "grand-elixir": "flask-grand",
  quintessence: "flask-quintessence",
};

export interface PotionIconOptions {
  readonly grade: GradeId;
  readonly rarity: RarityTier;
  readonly symbolId: string;
  /** Extra class(es) on the wrapper (e.g. the host tile/slot sizing class). */
  readonly className?: string;
}

/** Builds the layered flask + element-stamp element. Sizes to fill its host box. */
export function potionIconEl(options: PotionIconOptions): HTMLSpanElement {
  const wrap = document.createElement("span");
  wrap.className = `potion-icon rar-${options.rarity}`;
  if (options.className) wrap.classList.add(...options.className.split(" "));
  wrap.append(
    iconEl(GRADE_FLASK[options.grade], "potion-icon__flask"),
    iconEl(elementIconName(options.symbolId), "potion-icon__stamp"),
  );
  return wrap;
}
