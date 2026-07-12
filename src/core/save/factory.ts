import type { SaveDataV1 } from "./schema";
import { CURRENT_SAVE_VERSION } from "./schema";

/** Fresh save for a brand-new game. `now` is injected — core never calls `Date.now()`. */
export function createInitialSave(seed: string, now: number): SaveDataV1 {
  return {
    schemaVersion: CURRENT_SAVE_VERSION,
    seed,
    createdAt: now,
    lastSavedAt: now,
    resources: { gold: 0 },
  };
}
