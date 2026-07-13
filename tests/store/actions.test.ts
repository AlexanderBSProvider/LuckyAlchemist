import { describe, expect, it, vi } from "vitest";
import { createPotion } from "../../src/core/mutations";
import type { Rng, WeightedEntry } from "../../src/core/rng";
import { createInitialSave } from "../../src/core/save";
import type {
  BrewSymbol,
  DistillationStage,
  Ingredient,
  RingWeights,
  Stage,
  SymbolId,
} from "../../src/data/schemas";
import { performBrew, performDistill, performFight } from "../../src/store/actions";
import type { BrewData } from "../../src/store/commands";
import { createEventBus } from "../../src/store/events";
import type { GameEventMap } from "../../src/store/events";
import type { GameState } from "../../src/store/game-state";
import { createStore } from "../../src/store/store";

const NOW = 1_752_000_000_000;

const symbols: BrewSymbol[] = [
  { id: "a", label: "A", rarity: "common" },
  { id: "b", label: "B", rarity: "common" },
  { id: "c", label: "C", rarity: "common" },
];
const rings: RingWeights = [
  { symbolId: "a", weight: 1 },
  { symbolId: "b", weight: 1 },
  { symbolId: "c", weight: 1 },
];
const ingredients: Ingredient[] = [{ id: "tinder", label: "Tinder", kind: "base" }];
const brewData: BrewData = { rings, symbols, ingredients };

/** Stub Rng whose `pick` returns queued values in order — see tests/core/brewing/brewing.test.ts. */
function queueRng(values: readonly SymbolId[]): Rng {
  const queue = [...values];
  const fail = (): never => {
    throw new Error("queueRng: method not stubbed");
  };
  return {
    next: fail,
    int: fail,
    chance: fail,
    pick: <T,>(_entries: readonly WeightedEntry<T>[]): T => {
      const value = queue.shift();
      if (value === undefined) throw new Error("queueRng: ran out of queued values");
      return value as unknown as T;
    },
    fork: fail,
  };
}

/** Stub Rng whose `chance` always returns a fixed result — see tests/core/battle.test.ts. */
function fixedChanceRng(result: boolean): Rng {
  const fail = (): never => {
    throw new Error("fixedChanceRng: method not stubbed");
  };
  return { next: fail, int: fail, chance: () => result, pick: fail, fork: fail };
}

function stateWithIngredients(ingredients: Record<string, number>): GameState {
  const base = createInitialSave("seed", NOW);
  return { ...base, resources: { ...base.resources, ingredients } };
}

function stateWithPotion(grade: GameState["potions"][number]["grade"] = "tincture"): GameState {
  const base = createInitialSave("seed", NOW);
  return { ...base, potions: [createPotion("p1", "a", "common", grade)] };
}

describe("performBrew", () => {
  it("emits brew:success and adds a potion on a two-symbol match", () => {
    const store = createStore(stateWithIngredients({ tinder: 1 }));
    const events = createEventBus<GameEventMap>();
    const handler = vi.fn();
    events.on("brew:success", handler);

    performBrew(store, events, queueRng(["a", "a", "b"]), brewData, { ingredientIds: ["tinder"] });

    expect(store.getState().potions).toHaveLength(1);
    const potion = store.getState().potions[0];
    expect(handler).toHaveBeenCalledWith({
      potionId: potion?.id,
      symbolId: "a",
      rarity: "common",
      triple: false,
    });
  });

  it("emits triple: true and a bumped rarity when all three rings match", () => {
    const store = createStore(stateWithIngredients({ tinder: 1 }));
    const events = createEventBus<GameEventMap>();
    const handler = vi.fn();
    events.on("brew:success", handler);

    performBrew(store, events, queueRng(["a", "a", "a"]), brewData, { ingredientIds: ["tinder"] });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ rarity: "uncommon", triple: true }),
    );
  });

  it("emits brew:fail and adds ash when no two rings match", () => {
    const store = createStore(stateWithIngredients({ tinder: 1 }));
    const events = createEventBus<GameEventMap>();
    const handler = vi.fn();
    events.on("brew:fail", handler);

    performBrew(store, events, queueRng(["a", "b", "c"]), brewData, { ingredientIds: ["tinder"] });

    expect(store.getState().resources.ash).toBe(1);
    expect(store.getState().potions).toHaveLength(0);
    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it("does not emit any event for a no-op recipe (missing ingredient)", () => {
    const store = createStore(stateWithIngredients({}));
    const events = createEventBus<GameEventMap>();
    const successHandler = vi.fn();
    const failHandler = vi.fn();
    events.on("brew:success", successHandler);
    events.on("brew:fail", failHandler);

    performBrew(store, events, queueRng(["a", "a", "a"]), brewData, { ingredientIds: ["tinder"] });

    expect(successHandler).not.toHaveBeenCalled();
    expect(failHandler).not.toHaveBeenCalled();
  });
});

const distillationStages: DistillationStage[] = [
  { grade: "tincture", advanceChance: 1 },
  { grade: "elixir", advanceChance: 1 },
  { grade: "grand-elixir", advanceChance: 1 },
];

describe("performDistill", () => {
  it("emits distill:advance when the cycle advances", () => {
    const store = createStore(stateWithPotion("tincture"));
    const events = createEventBus<GameEventMap>();
    const handler = vi.fn();
    events.on("distill:advance", handler);

    performDistill(store, events, fixedChanceRng(true), distillationStages, "p1");

    expect(handler).toHaveBeenCalledWith({ potionId: "p1", grade: "elixir" });
  });

  it("emits distill:burst and removes the potion when the cycle bursts", () => {
    const store = createStore(stateWithPotion("tincture"));
    const events = createEventBus<GameEventMap>();
    const handler = vi.fn();
    events.on("distill:burst", handler);

    performDistill(store, events, fixedChanceRng(false), distillationStages, "p1");

    expect(store.getState().potions).toHaveLength(0);
    expect(handler).toHaveBeenCalledWith({ potionId: "p1" });
  });

  it("does not emit any event for an unknown potion id", () => {
    const store = createStore(stateWithPotion("tincture"));
    const events = createEventBus<GameEventMap>();
    const advanceHandler = vi.fn();
    const burstHandler = vi.fn();
    events.on("distill:advance", advanceHandler);
    events.on("distill:burst", burstHandler);

    performDistill(store, events, fixedChanceRng(true), distillationStages, "unknown");

    expect(advanceHandler).not.toHaveBeenCalled();
    expect(burstHandler).not.toHaveBeenCalled();
  });
});

const stage: Stage = {
  id: 1,
  difficulty: 10,
  rewardGold: 10,
  rewardIngredientId: "dry-tinder",
  rewardIngredientAmount: 2,
};

describe("performFight", () => {
  it("emits battle:won with the stage reward on a win", () => {
    const store = createStore(createInitialSave("seed", NOW));
    const events = createEventBus<GameEventMap>();
    const handler = vi.fn();
    events.on("battle:won", handler);

    performFight(store, events, fixedChanceRng(true), stage, 10);

    expect(store.getState().currentStageId).toBe(2);
    expect(handler).toHaveBeenCalledWith({
      stageId: 1,
      rewardGold: 10,
      rewardIngredientId: "dry-tinder",
      rewardIngredientAmount: 2,
    });
  });

  it("emits battle:lost on a loss and leaves the stage unchanged", () => {
    const store = createStore(createInitialSave("seed", NOW));
    const events = createEventBus<GameEventMap>();
    const handler = vi.fn();
    events.on("battle:lost", handler);

    performFight(store, events, fixedChanceRng(false), stage, 10);

    expect(store.getState().currentStageId).toBe(1);
    expect(handler).toHaveBeenCalledWith({ stageId: 1 });
  });
});
