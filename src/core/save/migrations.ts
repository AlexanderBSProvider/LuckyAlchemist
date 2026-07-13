import { CURRENT_SAVE_VERSION } from "./schema";

/**
 * A migration takes whatever a save looked like at `fromVersion` and returns the raw
 * shape for `fromVersion + 1`. It does not validate the result — `deserializeSave`
 * (see `serialize.ts`) runs the Zod schema once the chain reaches the current version.
 */
type Migration = (old: unknown, now: number) => unknown;

/**
 * Legacy pre-versioning save shape ("schema v0": no `schemaVersion` field at all).
 * This project has no real history predating versioned saves, but the migration is kept
 * here as a template — every future schema change follows exactly this pattern:
 * add a migration function, register it below, bump `CURRENT_SAVE_VERSION`.
 */
interface LegacySaveV0 {
  gold: number;
}

function isLegacySaveV0(value: unknown): value is LegacySaveV0 {
  return (
    typeof value === "object" &&
    value !== null &&
    !("schemaVersion" in value) &&
    "gold" in value &&
    typeof (value as LegacySaveV0).gold === "number"
  );
}

function migrateV0ToV1(old: unknown, now: number): unknown {
  if (!isLegacySaveV0(old)) {
    throw new Error("migrateV0ToV1: input does not look like a v0 save");
  }
  return {
    schemaVersion: 1,
    seed: `legacy-${String(now)}`,
    createdAt: now,
    lastSavedAt: now,
    resources: { gold: old.gold },
  };
}

/** Adds ash/ingredient inventory, upgrade levels, and battle progress (Stage 1). */
function migrateV1ToV2(old: unknown, _now: number): unknown {
  const save = old as {
    schemaVersion: 1;
    seed: string;
    createdAt: number;
    lastSavedAt: number;
    resources: { gold: number };
  };
  return {
    schemaVersion: 2,
    seed: save.seed,
    createdAt: save.createdAt,
    lastSavedAt: save.lastSavedAt,
    resources: { gold: save.resources.gold, ash: 0, ingredients: {} },
    upgradeLevels: {},
    currentStageId: 1,
  };
}

/** Adds the potion inventory and equip slots (Stage 1 paper-doll, minimal version). */
function migrateV2ToV3(old: unknown, _now: number): unknown {
  const save = old as {
    schemaVersion: 2;
    seed: string;
    createdAt: number;
    lastSavedAt: number;
    resources: { gold: number; ash: number; ingredients: Record<string, number> };
    upgradeLevels: Record<string, number>;
    currentStageId: number;
  };
  return {
    ...save,
    schemaVersion: 3,
    potions: [],
    nextPotionId: 1,
  };
}

/** Registry of migrations, keyed by the version they migrate *from*. */
const migrations: Record<number, Migration> = {
  0: migrateV0ToV1,
  1: migrateV1ToV2,
  2: migrateV2ToV3,
};

function detectVersion(raw: unknown): number {
  if (typeof raw === "object" && raw !== null && "schemaVersion" in raw) {
    const version = raw.schemaVersion;
    if (typeof version === "number") return version;
  }
  return 0;
}

/**
 * Walks a raw save forward through the migration chain until it reaches
 * {@link CURRENT_SAVE_VERSION}. Throws if a version in the chain has no registered
 * migration — that is a programmer error (a migration was forgotten), not a corrupt save.
 */
export function migrateToCurrent(raw: unknown, now: number): unknown {
  let version = detectVersion(raw);
  let data = raw;
  while (version < CURRENT_SAVE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new Error(`No migration registered from save schema version ${String(version)}`);
    }
    data = migrate(data, now);
    version += 1;
  }
  return data;
}
