import type { SaveDataV1 } from "../core/save";

/**
 * The store's state shape *is* the save shape. That is deliberate, not a shortcut: it is
 * the concrete meaning of "saves are a snapshot of state" from ARCHITECTURE.md §7. Stage 1
 * will widen `SaveDataV1` (inventory, mutations, progression) and `GameState` widens with
 * it automatically since it is just an alias.
 */
export type GameState = SaveDataV1;
