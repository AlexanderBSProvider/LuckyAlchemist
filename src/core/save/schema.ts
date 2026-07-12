import { z } from "zod";

/**
 * Current save shape (schema version 1).
 *
 * Deliberately minimal for Stage 0: just enough state to prove the save/load round trip
 * works end to end. Stage 1 will extend `resources`, add inventory/mutations/progression,
 * etc. — each such change gets a new `schemaVersion` and a migration (see `migrations.ts`).
 */
export const saveDataV1Schema = z.object({
  schemaVersion: z.literal(1),
  /** Seed for this save's deterministic RNG stream — see `core/rng.ts`. */
  seed: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  lastSavedAt: z.number().int().nonnegative(),
  resources: z.object({
    gold: z.number().int().nonnegative(),
  }),
});

export type SaveDataV1 = z.infer<typeof saveDataV1Schema>;

/** Alias for "whatever the current schema is" — update this when a new version lands. */
export type SaveData = SaveDataV1;

export const CURRENT_SAVE_VERSION = 1 as const;
