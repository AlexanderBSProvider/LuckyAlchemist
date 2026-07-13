import { describe, expect, it } from "vitest";
import { createRng } from "../../../src/core/rng";
import type { Rng, WeightedEntry } from "../../../src/core/rng";
import { brew } from "../../../src/core/brewing";
import type { BrewSymbol, Ingredient, RingWeights, SymbolId } from "../../../src/data/schemas";

const symbols: BrewSymbol[] = [
  { id: "a", label: "A", rarity: "common" },
  { id: "b", label: "B", rarity: "rare" },
  { id: "c", label: "C", rarity: "common" },
  { id: "z", label: "Z", rarity: "quintessence" },
];

const singleSymbolRing: RingWeights = [{ symbolId: "a", weight: 1 }];
const singleTopTierRing: RingWeights = [{ symbolId: "z", weight: 1 }];
const twoSymbolRing: RingWeights = [
  { symbolId: "a", weight: 1 },
  { symbolId: "b", weight: 1 },
];

const noIngredients: Ingredient[] = [];

/**
 * Stub `Rng` whose `pick` returns queued values in order and records the weighted pool
 * it was called with — lets tests assert exact match/fail outcomes and exact ingredient
 * weight math without depending on real PRNG output.
 */
function queueRng(values: readonly SymbolId[]) {
  const queue = [...values];
  const calls: WeightedEntry<SymbolId>[][] = [];
  const fail = (): never => {
    throw new Error("queueRng: method not stubbed");
  };
  const rng: Rng = {
    next: fail,
    int: fail,
    chance: fail,
    pick: <T,>(entries: readonly WeightedEntry<T>[]): T => {
      calls.push(entries as unknown as WeightedEntry<SymbolId>[]);
      const value = queue.shift();
      if (value === undefined) throw new Error("queueRng: ran out of queued values");
      return value as unknown as T;
    },
    fork: fail,
  };
  return { rng, calls };
}

describe("brew", () => {
  it("bumps rarity one tier when all three rings match", () => {
    const result = brew(
      createRng("seed"),
      { rings: singleSymbolRing, symbols, ingredients: noIngredients },
      { ingredientIds: [] },
    );
    expect(result.rolls).toEqual(["a", "a", "a"]);
    expect(result.outcome).toEqual({ kind: "success", rarity: "uncommon", symbolId: "a" });
  });

  it("caps the bump at the top of the rarity ladder", () => {
    const result = brew(
      createRng("seed"),
      { rings: singleTopTierRing, symbols, ingredients: noIngredients },
      { ingredientIds: [] },
    );
    expect(result.outcome).toEqual({ kind: "success", rarity: "quintessence", symbolId: "z" });
  });

  it("keeps the symbol's own rarity when exactly two rings match", () => {
    const { rng } = queueRng(["a", "a", "b"]);
    const result = brew(rng, { rings: twoSymbolRing, symbols, ingredients: noIngredients }, { ingredientIds: [] });
    expect(result.outcome).toEqual({ kind: "success", rarity: "common", symbolId: "a" });
  });

  it("burns to ash when no two rings match", () => {
    const { rng } = queueRng(["a", "b", "c"]);
    const threeSymbolRing: RingWeights = [
      { symbolId: "a", weight: 1 },
      { symbolId: "b", weight: 1 },
      { symbolId: "c", weight: 1 },
    ];
    const result = brew(rng, { rings: threeSymbolRing, symbols, ingredients: noIngredients }, { ingredientIds: [] });
    expect(result.outcome).toEqual({ kind: "fail" });
  });

  it("adds additive ingredient weight to the shared pool before drawing", () => {
    const ingredients: Ingredient[] = [
      { id: "boost", label: "Boost", kind: "additive", weightModifiers: { b: 5 } },
    ];
    const { rng, calls } = queueRng(["a", "a", "a"]);
    brew(rng, { rings: twoSymbolRing, symbols, ingredients }, { ingredientIds: ["boost"] });

    expect(calls[0]).toEqual([
      { value: "a", weight: 1 },
      { value: "b", weight: 6 },
    ]);
    expect(calls).toHaveLength(3);
  });

  it("throws for an unknown ingredient id in the recipe", () => {
    expect(() =>
      brew(
        createRng("x"),
        { rings: singleSymbolRing, symbols, ingredients: noIngredients },
        { ingredientIds: ["does-not-exist"] },
      ),
    ).toThrow(/unknown ingredient id/);
  });

  it("is deterministic for a given seed", () => {
    const data = { rings: twoSymbolRing, symbols, ingredients: noIngredients };
    const recipe = { ingredientIds: [] };
    const first = brew(createRng("determinism"), data, recipe);
    const second = brew(createRng("determinism"), data, recipe);
    expect(second).toEqual(first);
  });
});
