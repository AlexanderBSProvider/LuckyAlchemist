import type { SaveDataV1 } from "../core/save";
import type { Command } from "./store";
import type { GameState } from "./game-state";

/** Replaces the whole state with freshly loaded save data. */
export function hydrate(save: SaveDataV1): Command<GameState> {
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
