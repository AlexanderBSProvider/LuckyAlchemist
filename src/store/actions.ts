import type { BrewRecipe } from "../core/brewing";
import type { Rng } from "../core/rng";
import type { AshSiftConfig, DistillationStage, Stage } from "../data/schemas";
import type { BrewData } from "./commands";
import {
  brewCommand,
  distillPotion,
  equipPotion,
  fightStage,
  siftAshCommand,
  unequipPotion,
} from "./commands";
import type { EventBus, GameEventMap } from "./events";
import type { GameState } from "./game-state";
import type { Store } from "./store";

/**
 * Impure orchestration layer between UI clicks and the pure `commands.ts` functions:
 * dispatch, diff before/after state, emit the matching domain event. `Command<State>` is
 * intentionally just `(state) => state` with no event-bus access (see `store.ts`), so
 * "what actually happened" has to be figured out here — same pattern as `persistence.ts`'s
 * `saveGame`/`loadGame`. UI (and later render/audio) react to the emitted event instead of
 * re-deriving this diff themselves.
 */

export function performBrew(
  store: Store<GameState>,
  events: EventBus<GameEventMap>,
  rng: Rng,
  data: BrewData,
  recipe: BrewRecipe,
): void {
  const before = store.getState();
  store.dispatch(brewCommand(rng, data, recipe));
  const after = store.getState();

  if (after.potions.length > before.potions.length) {
    const potion = after.potions[after.potions.length - 1];
    if (!potion) return;
    // A rarity above the symbol's base tier can only come from the triple-match bump.
    const baseRarity = data.symbols.find((symbol) => symbol.id === potion.symbolId)?.rarity;
    const triple = baseRarity !== undefined && baseRarity !== potion.rarity;
    events.emit("brew:success", {
      potionId: potion.id,
      symbolId: potion.symbolId,
      rarity: potion.rarity,
      triple,
    });
    return;
  }

  if (after.resources.ash > before.resources.ash) {
    events.emit("brew:fail", undefined);
  }
}

export function performDistill(
  store: Store<GameState>,
  events: EventBus<GameEventMap>,
  rng: Rng,
  stages: readonly DistillationStage[],
  potionId: string,
): void {
  const before = store.getState();
  store.dispatch(distillPotion(rng, stages, potionId));
  const after = store.getState();

  const wasPresent = before.potions.some((potion) => potion.id === potionId);
  const stillPresent = after.potions.some((potion) => potion.id === potionId);
  if (wasPresent && !stillPresent) {
    events.emit("distill:burst", { potionId });
    return;
  }

  const beforeGrade = before.potions.find((potion) => potion.id === potionId)?.grade;
  const afterPotion = after.potions.find((potion) => potion.id === potionId);
  if (afterPotion && afterPotion.grade !== beforeGrade) {
    events.emit("distill:advance", { potionId, grade: afterPotion.grade });
  }
}

export function performFight(
  store: Store<GameState>,
  events: EventBus<GameEventMap>,
  rng: Rng,
  stage: Stage,
  playerPower: number,
): void {
  const before = store.getState();
  store.dispatch(fightStage(rng, stage, playerPower));
  const after = store.getState();

  if (after.currentStageId > before.currentStageId) {
    events.emit("battle:won", {
      stageId: stage.id,
      rewardGold: stage.rewardGold,
      rewardIngredientId: stage.rewardIngredientId,
      rewardIngredientAmount: stage.rewardIngredientAmount,
    });
    return;
  }

  events.emit("battle:lost", { stageId: stage.id });
}

/**
 * Equips a potion (the brewed mutation) and, only if it actually flipped from unequipped
 * to equipped, emits `mutation:equipped` so render can play the "drink + transform"
 * ceremony. A no-op equip (slots already full) emits nothing — same convention as
 * `performFight`'s loss path.
 */
export function performEquip(
  store: Store<GameState>,
  events: EventBus<GameEventMap>,
  potionId: string,
  maxEquippedSlots: number,
): void {
  const before = store.getState();
  const wasEquipped = before.potions.find((potion) => potion.id === potionId)?.equipped ?? false;
  if (wasEquipped) return;

  store.dispatch(equipPotion(potionId, maxEquippedSlots));
  const after = store.getState();

  const potion = after.potions.find((candidate) => candidate.id === potionId);
  if (potion?.equipped) {
    events.emit("mutation:equipped", {
      potionId: potion.id,
      symbolId: potion.symbolId,
      rarity: potion.rarity,
      grade: potion.grade,
    });
  }
}

export function performUnequip(
  store: Store<GameState>,
  events: EventBus<GameEventMap>,
  potionId: string,
): void {
  const before = store.getState();
  const wasEquipped = before.potions.find((potion) => potion.id === potionId)?.equipped ?? false;
  if (!wasEquipped) return;

  store.dispatch(unequipPotion(potionId));
  events.emit("mutation:unequipped", { potionId });
}

export function performSift(
  store: Store<GameState>,
  events: EventBus<GameEventMap>,
  rng: Rng,
  config: AshSiftConfig,
  amount: number,
): void {
  const before = store.getState();
  store.dispatch(siftAshCommand(rng, config, amount));
  const after = store.getState();

  const gained =
    (after.resources.ingredients[config.ingredientId] ?? 0) -
    (before.resources.ingredients[config.ingredientId] ?? 0);
  if (gained > 0) {
    events.emit("ash:sifted", { ingredientId: config.ingredientId, amount: gained });
  }
}
