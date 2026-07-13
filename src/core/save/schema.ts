import { z } from "zod";
import { gradeIdSchema, rarityTierSchema } from "../../data/schemas";

/**
 * Save shape, schema version 1 (Stage 0, superseded by v2 below).
 *
 * Deliberately minimal: just enough state to prove the save/load round trip works end to
 * end. Kept around only as the source shape for `migrateV1ToV2` — see `migrations.ts`.
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

/**
 * Save shape, schema version 2 (Stage 1, superseded by v3 below). Widened `resources` with
 * ash and a base-ingredient inventory, added lab upgrade levels and autobattler progress.
 * Kept around only as the source shape for `migrateV2ToV3` — see `migrations.ts`.
 */
export const saveDataV2Schema = z.object({
  schemaVersion: z.literal(2),
  seed: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  lastSavedAt: z.number().int().nonnegative(),
  resources: z.object({
    gold: z.number().int().nonnegative(),
    ash: z.number().int().nonnegative(),
    /** Base-ingredient id -> count on hand. */
    ingredients: z.record(z.string(), z.number().int().nonnegative()),
  }),
  /** Upgrade id -> level. Absent id means level 0. */
  upgradeLevels: z.record(z.string(), z.number().int().nonnegative()),
  /** Farthest stage the player is currently up against. */
  currentStageId: z.number().int().positive(),
});

export type SaveDataV2 = z.infer<typeof saveDataV2Schema>;

export const potionSchema = z.object({
  id: z.string().min(1),
  symbolId: z.string().min(1),
  rarity: rarityTierSchema,
  grade: gradeIdSchema,
  equipped: z.boolean(),
});
export type PotionSave = z.infer<typeof potionSchema>;

/** Schema v3 (Stage 1): adds the minimal paper-doll potion inventory (GAME-DESIGN.md §4). */
export const saveDataV3Schema = z.object({
  schemaVersion: z.literal(3),
  seed: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  lastSavedAt: z.number().int().nonnegative(),
  resources: z.object({
    gold: z.number().int().nonnegative(),
    ash: z.number().int().nonnegative(),
    ingredients: z.record(z.string(), z.number().int().nonnegative()),
  }),
  upgradeLevels: z.record(z.string(), z.number().int().nonnegative()),
  currentStageId: z.number().int().positive(),
  potions: z.array(potionSchema),
  /** Monotonic counter — the source of each new potion's `id`. */
  nextPotionId: z.number().int().nonnegative(),
});

export type SaveDataV3 = z.infer<typeof saveDataV3Schema>;

/** Alias for "whatever the current schema is" — update this when a new version lands. */
export type SaveData = SaveDataV3;

export const CURRENT_SAVE_VERSION = 3 as const;
