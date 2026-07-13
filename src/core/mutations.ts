import type { GradeId, MutationConfig, RarityTier, SymbolId } from "../data/schemas";
import type { PotionSave } from "./save";

/**
 * Minimal paper-doll inventory (GAME-DESIGN.md §4): a brewed-and-distilled potion becomes
 * an equippable item. Tags and set-effects are deliberately not modeled yet — equipping is
 * just "counts toward `maxEquippedSlots` and contributes flat power by grade" until that
 * design lands (see `mutations.json`'s `gradePower` for the stand-in).
 *
 * `Potion` is the same shape as the save schema's `PotionSave` (see `core/save/schema.ts`)
 * — one definition, reused, so the persisted shape and the logic shape can't drift apart.
 */
export type Potion = PotionSave;

export function createPotion(
  id: string,
  symbolId: SymbolId,
  rarity: RarityTier,
  grade: GradeId,
): Potion {
  return { id, symbolId, rarity, grade, equipped: false };
}

export function potionPower(potion: Potion, config: MutationConfig): number {
  return config.gradePower[potion.grade] ?? 0;
}

export function equippedPower(potions: readonly Potion[], config: MutationConfig): number {
  return potions
    .filter((potion) => potion.equipped)
    .reduce((sum, potion) => sum + potionPower(potion, config), 0);
}
