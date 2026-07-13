import type { Rng } from "./rng";
import type { Stage } from "../data/schemas";

/**
 * Autobattler stage resolution (GAME-DESIGN.md §4): a numeric simulation, no per-hit
 * combat log. Win chance is power against the stage's difficulty — both are positive by
 * schema, so the ratio is always strictly between 0 and 1 without needing an arbitrary
 * clamp constant.
 */

export interface BattleReward {
  readonly gold: number;
  readonly ingredientId: string;
  readonly ingredientAmount: number;
}

export type BattleOutcome =
  | { readonly kind: "win"; readonly reward: BattleReward }
  | { readonly kind: "loss" };

export function simulateStage(rng: Rng, stage: Stage, playerPower: number): BattleOutcome {
  if (playerPower <= 0) throw new Error("simulateStage: playerPower must be positive");

  const winChance = playerPower / (playerPower + stage.difficulty);
  if (!rng.chance(winChance)) return { kind: "loss" };

  return {
    kind: "win",
    reward: {
      gold: stage.rewardGold,
      ingredientId: stage.rewardIngredientId,
      ingredientAmount: stage.rewardIngredientAmount,
    },
  };
}
