import type { SaveData } from "../core/save";
import type { Rng } from "../core/rng";
import { siftAsh, upgradeCost } from "../core/economy";
import { simulateStage } from "../core/battle";
import { brew } from "../core/brewing";
import type { BrewRecipe } from "../core/brewing";
import { distillCycle } from "../core/distill";
import { createPotion } from "../core/mutations";
import type {
  AshSiftConfig,
  BrewSymbol,
  DistillationStage,
  Ingredient,
  RingWeights,
  Stage,
  Upgrade,
} from "../data/schemas";
import { GRADE_ORDER } from "../data/schemas";
import type { Command } from "./store";
import type { GameState } from "./game-state";

/** Replaces the whole state with freshly loaded save data. */
export function hydrate(save: SaveData): Command<GameState> {
  return () => save;
}

/** Stamps the current save time. Does not perform I/O — see `persistence.ts` for that. */
export function markSaved(now: number): Command<GameState> {
  return (state) => ({ ...state, lastSavedAt: now });
}

/**
 * Stage 0 placeholder resource action, used to prove state changes persist across a
 * save/load cycle. Stage 1 replaces this with real brewing/economy commands.
 */
export function incrementGoldStub(amount: number): Command<GameState> {
  return (state) => ({
    ...state,
    resources: { ...state.resources, gold: state.resources.gold + amount },
  });
}

/** No-op (insufficient gold) rather than throwing — spending is a routine player choice. */
export function buyUpgrade(upgrade: Upgrade): Command<GameState> {
  return (state) => {
    const level = state.upgradeLevels[upgrade.id] ?? 0;
    const cost = upgradeCost(upgrade, level);
    if (state.resources.gold < cost) return state;
    return {
      ...state,
      resources: { ...state.resources, gold: state.resources.gold - cost },
      upgradeLevels: { ...state.upgradeLevels, [upgrade.id]: level + 1 },
    };
  };
}

/** No-op if there isn't enough ash on hand — see `core/economy.ts` for the yield formula. */
export function siftAshCommand(
  rng: Rng,
  config: AshSiftConfig,
  amount: number,
): Command<GameState> {
  return (state) => {
    if (state.resources.ash < amount) return state;
    const result = siftAsh(rng, amount, config);
    const heldAmount = state.resources.ingredients[result.ingredientId] ?? 0;
    return {
      ...state,
      resources: {
        ...state.resources,
        ash: state.resources.ash - amount,
        ingredients: {
          ...state.resources.ingredients,
          [result.ingredientId]: heldAmount + result.amount,
        },
      },
    };
  };
}

/**
 * Resolves one autobattler stage. Loss leaves state untouched — there is no penalty for
 * losing beyond not getting the reward (GAME-DESIGN.md §5: the floor keeps runs unstuck).
 */
export function fightStage(rng: Rng, stage: Stage, playerPower: number): Command<GameState> {
  return (state) => {
    const outcome = simulateStage(rng, stage, playerPower);
    if (outcome.kind === "loss") return state;

    const { reward } = outcome;
    const heldAmount = state.resources.ingredients[reward.ingredientId] ?? 0;
    return {
      ...state,
      resources: {
        ...state.resources,
        gold: state.resources.gold + reward.gold,
        ingredients: {
          ...state.resources.ingredients,
          [reward.ingredientId]: heldAmount + reward.ingredientAmount,
        },
      },
      currentStageId: Math.max(state.currentStageId, stage.id + 1),
    };
  };
}

export interface BrewData {
  readonly rings: RingWeights;
  readonly symbols: readonly BrewSymbol[];
  readonly ingredients: readonly Ingredient[];
}

/**
 * Consumes one of each ingredient listed in the recipe as the brewing stake (GAME-DESIGN.md
 * §1: "провал = інгредієнти в попіл"). No-op if the recipe is empty or the player doesn't
 * hold enough of any listed ingredient — spending is validated here so `core/brewing`'s
 * `brew` never has to know about inventory.
 */
export function brewCommand(rng: Rng, data: BrewData, recipe: BrewRecipe): Command<GameState> {
  return (state) => {
    if (recipe.ingredientIds.length === 0) return state;
    for (const id of recipe.ingredientIds) {
      if ((state.resources.ingredients[id] ?? 0) < 1) return state;
    }

    const spentIngredients = { ...state.resources.ingredients };
    for (const id of recipe.ingredientIds) {
      spentIngredients[id] = (spentIngredients[id] ?? 0) - 1;
    }

    const result = brew(rng, data, recipe);
    if (result.outcome.kind === "fail") {
      return {
        ...state,
        resources: {
          ...state.resources,
          ash: state.resources.ash + 1,
          ingredients: spentIngredients,
        },
      };
    }

    const potion = createPotion(
      String(state.nextPotionId),
      result.outcome.symbolId,
      result.outcome.rarity,
      "tincture",
    );
    return {
      ...state,
      resources: { ...state.resources, ingredients: spentIngredients },
      potions: [...state.potions, potion],
      nextPotionId: state.nextPotionId + 1,
    };
  };
}

/**
 * Pushes one distillation cycle for a specific potion. No-op for an unknown id or a
 * potion already at the top grade; a burst removes the potion from the inventory entirely.
 */
export function distillPotion(
  rng: Rng,
  stages: readonly DistillationStage[],
  potionId: string,
): Command<GameState> {
  return (state) => {
    const potion = state.potions.find((candidate) => candidate.id === potionId);
    const isTopGrade = potion && GRADE_ORDER.indexOf(potion.grade) === GRADE_ORDER.length - 1;
    if (!potion || isTopGrade) return state;

    const outcome = distillCycle(rng, stages, potion.grade);
    if (outcome.kind === "burst") {
      return { ...state, potions: state.potions.filter((candidate) => candidate.id !== potionId) };
    }
    return {
      ...state,
      potions: state.potions.map((candidate) =>
        candidate.id === potionId ? { ...candidate, grade: outcome.grade } : candidate,
      ),
    };
  };
}

/** No-op once `maxEquippedSlots` potions are already equipped. */
export function equipPotion(potionId: string, maxEquippedSlots: number): Command<GameState> {
  return (state) => {
    const equippedCount = state.potions.filter((potion) => potion.equipped).length;
    if (equippedCount >= maxEquippedSlots) return state;
    return {
      ...state,
      potions: state.potions.map((potion) =>
        potion.id === potionId ? { ...potion, equipped: true } : potion,
      ),
    };
  };
}

export function unequipPotion(potionId: string): Command<GameState> {
  return (state) => ({
    ...state,
    potions: state.potions.map((potion) =>
      potion.id === potionId ? { ...potion, equipped: false } : potion,
    ),
  });
}
