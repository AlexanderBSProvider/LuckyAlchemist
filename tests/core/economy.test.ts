import { describe, expect, it } from "vitest";
import type { Rng } from "../../src/core/rng";
import { siftAsh, upgradeCost } from "../../src/core/economy";
import type { AshSiftConfig, Upgrade } from "../../src/data/schemas";

function fixedChanceRng(result: boolean): Rng {
  const fail = (): never => {
    throw new Error("fixedChanceRng: method not stubbed");
  };
  return { next: fail, int: fail, chance: () => result, pick: fail, fork: fail };
}

describe("upgradeCost", () => {
  const upgrade: Upgrade = { id: "bellows", label: "Bellows", baseCost: 40, growthRate: 1.15 };

  it("returns baseCost at level 0", () => {
    expect(upgradeCost(upgrade, 0)).toBe(40);
  });

  it("compounds growthRate per level", () => {
    expect(upgradeCost(upgrade, 1)).toBe(Math.ceil(40 * 1.15));
    expect(upgradeCost(upgrade, 5)).toBe(Math.ceil(40 * Math.pow(1.15, 5)));
  });
});

describe("siftAsh", () => {
  const config: AshSiftConfig = {
    ingredientId: "clay-shard",
    minYieldPerAsh: 0.5,
    bonusChance: 0.3,
    bonusYieldPerAsh: 0.5,
  };

  it("always yields at least the guaranteed floor, even without the bonus", () => {
    const result = siftAsh(fixedChanceRng(false), 10, config);
    expect(result).toEqual({ ingredientId: "clay-shard", amount: 5 });
  });

  it("adds the bonus yield when the bonus roll succeeds", () => {
    const result = siftAsh(fixedChanceRng(true), 10, config);
    expect(result).toEqual({ ingredientId: "clay-shard", amount: 10 });
  });

  it("never yields a negative amount for zero ash", () => {
    const result = siftAsh(fixedChanceRng(false), 0, config);
    expect(result.amount).toBe(0);
  });
});
