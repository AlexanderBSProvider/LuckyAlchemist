import { describe, expect, it } from "vitest";
import * as data from "../../src/data";

describe("data module", () => {
  it("parses every Stage 1 JSON table through its schema", () => {
    expect(data.symbols.length).toBeGreaterThan(0);
    expect(data.rings.length).toBeGreaterThan(0);
    expect(data.ingredients.length).toBeGreaterThan(0);
    expect(data.distillationStages.length).toBeGreaterThan(0);
    expect(data.stages).toHaveLength(10);
    expect(data.upgrades).toHaveLength(5);
    expect(data.ashSiftConfig.ingredientId).toBe("clay-shard");
  });

  it("cross-references every symbolId/ingredientId used across the tables", () => {
    const symbolIds = new Set(data.symbols.map((symbol) => symbol.id));
    const ingredientIds = new Set(data.ingredients.map((ingredient) => ingredient.id));

    for (const entry of data.rings) expect(symbolIds.has(entry.symbolId)).toBe(true);
    for (const stage of data.stages) expect(ingredientIds.has(stage.rewardIngredientId)).toBe(true);
    expect(ingredientIds.has(data.ashSiftConfig.ingredientId)).toBe(true);
  });
});
