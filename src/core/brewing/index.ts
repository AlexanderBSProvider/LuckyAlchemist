import type { Rng, WeightedEntry } from "../rng";
import type {
  BrewSymbol,
  Ingredient,
  RarityTier,
  RingWeights,
  SymbolId,
} from "../../data/schemas";
import { RARITY_ORDER } from "../../data/schemas";

/**
 * Brewing: three concentric rings roll one symbol each from a shared, weighted pool.
 * All three matching = the symbol's rarity bumped up one tier; exactly two matching =
 * the symbol's own rarity; no match = the batch burns to ash. See GAME-DESIGN.md §1.
 *
 * Additive ingredients (see `data/ingredients.json`) add flat weight to specific symbols
 * before the draw — that is the whole "deck" mechanic: gathering additives shapes the
 * odds instead of grinding a fixed table.
 */

export interface BrewRecipe {
  /** Ids of ingredients committed to this brew (base fuel + any additives). */
  readonly ingredientIds: readonly string[];
}

export type BrewOutcome =
  | { readonly kind: "fail" }
  | { readonly kind: "success"; readonly rarity: RarityTier; readonly symbolId: SymbolId };

export interface BrewResult {
  readonly rolls: readonly [SymbolId, SymbolId, SymbolId];
  readonly outcome: BrewOutcome;
}

export interface BrewData {
  readonly rings: RingWeights;
  readonly symbols: readonly BrewSymbol[];
  readonly ingredients: readonly Ingredient[];
}

function findSymbol(symbols: readonly BrewSymbol[], id: SymbolId): BrewSymbol {
  const symbol = symbols.find((candidate) => candidate.id === id);
  if (!symbol) throw new Error(`brew: unknown symbol id "${id}"`);
  return symbol;
}

function findIngredient(ingredients: readonly Ingredient[], id: string): Ingredient {
  const ingredient = ingredients.find((candidate) => candidate.id === id);
  if (!ingredient) throw new Error(`brew: unknown ingredient id "${id}"`);
  return ingredient;
}

function bumpRarity(rarity: RarityTier): RarityTier {
  const next = RARITY_ORDER[RARITY_ORDER.indexOf(rarity) + 1];
  return next ?? rarity;
}

/** Base ring weights plus flat additive bonuses from the recipe's ingredients. */
function weightedSymbolPool(
  baseWeights: RingWeights,
  ingredients: readonly Ingredient[],
  recipe: BrewRecipe,
): readonly WeightedEntry<SymbolId>[] {
  const totals = new Map<SymbolId, number>(
    baseWeights.map((entry) => [entry.symbolId, entry.weight]),
  );

  for (const ingredientId of recipe.ingredientIds) {
    const ingredient = findIngredient(ingredients, ingredientId);
    if (!ingredient.weightModifiers) continue;
    for (const [symbolId, bonus] of Object.entries(ingredient.weightModifiers)) {
      totals.set(symbolId, (totals.get(symbolId) ?? 0) + bonus);
    }
  }

  return [...totals.entries()]
    .filter(([, weight]) => weight > 0)
    .map(([symbolId, weight]) => ({ value: symbolId, weight }));
}

interface Match {
  readonly symbolId: SymbolId;
  readonly count: number;
}

/** Which symbol (if any) landed on at least two of the three rings, and how many times. */
function findMatch(rolls: readonly [SymbolId, SymbolId, SymbolId]): Match | null {
  const counts = new Map<SymbolId, number>();
  for (const symbolId of rolls) counts.set(symbolId, (counts.get(symbolId) ?? 0) + 1);

  let best: Match | null = null;
  for (const [symbolId, count] of counts) {
    if (count >= 2 && (!best || count > best.count)) best = { symbolId, count };
  }
  return best;
}

export function brew(rng: Rng, data: BrewData, recipe: BrewRecipe): BrewResult {
  const pool = weightedSymbolPool(data.rings, data.ingredients, recipe);
  const rolls: [SymbolId, SymbolId, SymbolId] = [rng.pick(pool), rng.pick(pool), rng.pick(pool)];

  const match = findMatch(rolls);
  if (!match) return { rolls, outcome: { kind: "fail" } };

  const symbol = findSymbol(data.symbols, match.symbolId);
  const rarity = match.count === 3 ? bumpRarity(symbol.rarity) : symbol.rarity;
  return { rolls, outcome: { kind: "success", rarity, symbolId: match.symbolId } };
}
