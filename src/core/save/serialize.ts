import type { SaveData } from "./schema";
import { saveDataV3Schema } from "./schema";
import { migrateToCurrent } from "./migrations";

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data);
}

export type DeserializeResult =
  | { ok: true; data: SaveData }
  | { ok: false; reason: "invalid-json" | "invalid-shape"; message: string };

/**
 * Parses, migrates, and validates a raw save string.
 *
 * Returns a `{ ok: false }` result instead of throwing: a corrupt or outdated save is an
 * *expected* condition (a browser crashed mid-write, a portal's cloud save got mangled),
 * not a programmer error — callers are expected to handle both branches, not wrap this in
 * try/catch. `now` is injected so this stays a pure function of its inputs.
 */
export function deserializeSave(raw: string, now: number): DeserializeResult {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      reason: "invalid-json",
      message: error instanceof Error ? error.message : "Unknown JSON parse error",
    };
  }

  let migrated: unknown;
  try {
    migrated = migrateToCurrent(parsedJson, now);
  } catch (error) {
    return {
      ok: false,
      reason: "invalid-shape",
      message: error instanceof Error ? error.message : "Unknown migration error",
    };
  }

  const result = saveDataV3Schema.safeParse(migrated);
  if (!result.success) {
    return { ok: false, reason: "invalid-shape", message: result.error.message };
  }
  return { ok: true, data: result.data };
}
