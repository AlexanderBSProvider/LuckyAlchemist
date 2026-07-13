import { z } from "zod";

/**
 * Validation boundary for everything in `src/data/*.json` — see ARCHITECTURE.md §3.
 * Code never hardcodes a tuning number; it imports JSON and parses it through one of
 * these schemas once (at module load), then works with the inferred TypeScript type.
 */

export const rarityTierSchema = z.enum([
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "quintessence",
]);
export type RarityTier = z.infer<typeof rarityTierSchema>;

/** Ladder order, lowest first — used to bump a tier up/down by one step. */
export const RARITY_ORDER: readonly RarityTier[] = rarityTierSchema.options;

export const symbolIdSchema = z.string().min(1);
export type SymbolId = z.infer<typeof symbolIdSchema>;

export const symbolSchema = z.object({
  id: symbolIdSchema,
  label: z.string().min(1),
  /** Rarity a brew produces when this symbol lands on all three rings. */
  rarity: rarityTierSchema,
});
export type BrewSymbol = z.infer<typeof symbolSchema>;
export const symbolsSchema = z.array(symbolSchema).min(1);

export const ringWeightEntrySchema = z.object({
  symbolId: symbolIdSchema,
  weight: z.number().positive(),
});
/** Base symbol weights shared by all three rings before additive modifiers apply. */
export const ringWeightsSchema = z.array(ringWeightEntrySchema).min(1);
export type RingWeights = z.infer<typeof ringWeightsSchema>;

export const gradeIdSchema = z.enum(["tincture", "elixir", "grand-elixir", "quintessence"]);
export type GradeId = z.infer<typeof gradeIdSchema>;

/** Ladder order, lowest first — the "push" in push-your-luck steps up this list. */
export const GRADE_ORDER: readonly GradeId[] = gradeIdSchema.options;

export const distillationStageSchema = z.object({
  grade: gradeIdSchema,
  /** Chance (0..1) that pushing from this grade advances instead of bursting the flask. */
  advanceChance: z.number().min(0).max(1),
});
export type DistillationStage = z.infer<typeof distillationStageSchema>;
/** One entry per grade except the top one — there is nothing to push *into* past it. */
export const distillationStagesSchema = z.array(distillationStageSchema).min(1);

export const ingredientSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["base", "additive"]),
  /** Additive-only: added to a symbol's ring weight for this brew (see core/brewing). */
  weightModifiers: z.record(symbolIdSchema, z.number()).optional(),
});
export type Ingredient = z.infer<typeof ingredientSchema>;
export const ingredientsSchema = z.array(ingredientSchema).min(1);

export const stageSchema = z.object({
  id: z.number().int().positive(),
  /** Opponent strength; win chance = playerPower / (playerPower + difficulty). */
  difficulty: z.number().positive(),
  rewardGold: z.number().int().nonnegative(),
  rewardIngredientId: z.string().min(1),
  rewardIngredientAmount: z.number().int().nonnegative(),
});
export type Stage = z.infer<typeof stageSchema>;
export const stagesSchema = z.array(stageSchema).min(1);

export const upgradeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  baseCost: z.number().int().positive(),
  /** Cost at level N = baseCost * growthRate^N. */
  growthRate: z.number().min(1),
});
export type Upgrade = z.infer<typeof upgradeSchema>;
export const upgradesSchema = z.array(upgradeSchema).min(1);

export const mutationConfigSchema = z.object({
  /** Paper-doll slot count (GAME-DESIGN.md §4) — caps how many potions can be equipped. */
  maxEquippedSlots: z.number().int().positive(),
  /**
   * ponytail: flat power per distillation grade, until tags/set-effects (GAME-DESIGN.md §4)
   * replace this with a real mutation-effect system. Grade id -> power.
   */
  gradePower: z.record(z.string(), z.number().nonnegative()),
});
export type MutationConfig = z.infer<typeof mutationConfigSchema>;

export const battleConfigSchema = z.object({
  /** Seconds between automatic fight attempts against the current stage (autobattler). */
  autoIntervalSeconds: z.number().positive(),
});
export type BattleConfig = z.infer<typeof battleConfigSchema>;

export const ashSiftConfigSchema = z.object({
  ingredientId: z.string().min(1),
  /** Guaranteed base ingredients per unit of ash — the economy's hard floor. */
  minYieldPerAsh: z.number().nonnegative(),
  bonusChance: z.number().min(0).max(1),
  bonusYieldPerAsh: z.number().nonnegative(),
});
export type AshSiftConfig = z.infer<typeof ashSiftConfigSchema>;
