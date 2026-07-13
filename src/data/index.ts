import symbolsJson from "./symbols.json";
import ringsJson from "./rings.json";
import ingredientsJson from "./ingredients.json";
import distillationJson from "./distillation.json";
import stagesJson from "./stages.json";
import upgradesJson from "./upgrades.json";
import ashSiftJson from "./ash-sift.json";
import mutationsJson from "./mutations.json";
import {
  symbolsSchema,
  ringWeightsSchema,
  ingredientsSchema,
  distillationStagesSchema,
  stagesSchema,
  upgradesSchema,
  ashSiftConfigSchema,
  mutationConfigSchema,
  gradeIdSchema,
} from "./schemas";

/**
 * Single load-and-validate point for `src/data/*.json` (ARCHITECTURE.md §3). Every JSON
 * file is parsed through its Zod schema exactly once here; the rest of the codebase
 * imports the typed constants below instead of touching a `.json` file directly.
 */

export const symbols = symbolsSchema.parse(symbolsJson);
export const rings = ringWeightsSchema.parse(ringsJson);
export const ingredients = ingredientsSchema.parse(ingredientsJson);
export const distillationStages = distillationStagesSchema.parse(distillationJson);
export const stages = stagesSchema.parse(stagesJson);
export const upgrades = upgradesSchema.parse(upgradesJson);
export const ashSiftConfig = ashSiftConfigSchema.parse(ashSiftJson);
export const mutationConfig = mutationConfigSchema.parse(mutationsJson);

// Zod validates each file's own shape; these checks catch the one thing it can't see —
// an id in one file that no longer exists in another (e.g. a renamed symbol or ingredient).
function assertKnownSymbol(id: string, context: string): void {
  if (!symbols.some((symbol) => symbol.id === id)) {
    throw new Error(`data: ${context} references unknown symbol id "${id}"`);
  }
}

function assertKnownIngredient(id: string, context: string): void {
  if (!ingredients.some((ingredient) => ingredient.id === id)) {
    throw new Error(`data: ${context} references unknown ingredient id "${id}"`);
  }
}

for (const entry of rings) assertKnownSymbol(entry.symbolId, "rings.json");

for (const ingredient of ingredients) {
  for (const symbolId of Object.keys(ingredient.weightModifiers ?? {})) {
    assertKnownSymbol(symbolId, `ingredients.json (${ingredient.id})`);
  }
}

for (const stage of stages) {
  assertKnownIngredient(stage.rewardIngredientId, `stages.json (stage ${String(stage.id)})`);
}

assertKnownIngredient(ashSiftConfig.ingredientId, "ash-sift.json");

for (const grade of gradeIdSchema.options) {
  if (!(grade in mutationConfig.gradePower)) {
    throw new Error(`data: mutations.json is missing gradePower for grade "${grade}"`);
  }
}
