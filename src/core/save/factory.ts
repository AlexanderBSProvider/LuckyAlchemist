import type { SaveData } from "./schema";
import { CURRENT_SAVE_VERSION } from "./schema";

/** Fresh save for a brand-new game. `now` is injected — core never calls `Date.now()`. */
export function createInitialSave(seed: string, now: number): SaveData {
  return {
    schemaVersion: CURRENT_SAVE_VERSION,
    seed,
    createdAt: now,
    lastSavedAt: now,
    resources: { gold: 0, ash: 0, ingredients: {} },
    upgradeLevels: {},
    currentStageId: 1,
    potions: [],
    nextPotionId: 1,
  };
}
