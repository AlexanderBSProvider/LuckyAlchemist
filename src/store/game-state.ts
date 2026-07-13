import type { SaveData } from "../core/save";

/**
 * The store's state shape *is* the save shape. That is deliberate, not a shortcut: it is
 * the concrete meaning of "saves are a snapshot of state" from ARCHITECTURE.md §7.
 * `SaveData` always points at the current schema version, so `GameState` widens with it
 * automatically whenever a migration lands — no change needed here.
 */
export type GameState = SaveData;
