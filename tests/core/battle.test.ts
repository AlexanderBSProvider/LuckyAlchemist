import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/rng";
import type { Rng } from "../../src/core/rng";
import { simulateStage } from "../../src/core/battle";
import type { Stage } from "../../src/data/schemas";

const stage: Stage = {
  id: 1,
  difficulty: 10,
  rewardGold: 10,
  rewardIngredientId: "dry-tinder",
  rewardIngredientAmount: 2,
};

/** Stub Rng whose `chance` always returns a fixed result, for exact win/loss control. */
function fixedChanceRng(result: boolean): Rng {
  const fail = (): never => {
    throw new Error("fixedChanceRng: method not stubbed");
  };
  return { next: fail, int: fail, chance: () => result, pick: fail, fork: fail };
}

describe("simulateStage", () => {
  it("wins and returns the stage reward when the roll succeeds", () => {
    const result = simulateStage(fixedChanceRng(true), stage, 10);
    expect(result).toEqual({
      kind: "win",
      reward: { gold: 10, ingredientId: "dry-tinder", ingredientAmount: 2 },
    });
  });

  it("loses when the roll fails", () => {
    const result = simulateStage(fixedChanceRng(false), stage, 10);
    expect(result).toEqual({ kind: "loss" });
  });

  it("is deterministic for a given seed and power", () => {
    const first = simulateStage(createRng("battle"), stage, 10);
    const second = simulateStage(createRng("battle"), stage, 10);
    expect(second).toEqual(first);
  });

  it("throws for non-positive player power", () => {
    expect(() => simulateStage(createRng("seed"), stage, 0)).toThrow(/must be positive/);
  });
});
