import { describe, expect, it } from "vitest";
import {
  createInitialSave,
  serializeSave,
  deserializeSave,
  migrateToCurrent,
  CURRENT_SAVE_VERSION,
} from "../../../src/core/save";

const NOW = 1_752_000_000_000; // fixed instant, injected — no Date.now() in tests either

describe("createInitialSave", () => {
  it("produces a save at the current schema version with zeroed resources", () => {
    const save = createInitialSave("seed-1", NOW);

    expect(save.schemaVersion).toBe(CURRENT_SAVE_VERSION);
    expect(save.seed).toBe("seed-1");
    expect(save.createdAt).toBe(NOW);
    expect(save.lastSavedAt).toBe(NOW);
    expect(save.resources.gold).toBe(0);
  });
});

describe("serializeSave / deserializeSave round trip", () => {
  it("recovers an identical save after a JSON round trip", () => {
    const original = createInitialSave("round-trip-seed", NOW);
    const raw = serializeSave(original);
    const result = deserializeSave(raw, NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(original);
    }
  });

  it("preserves mutated resource values through the round trip", () => {
    const original = { ...createInitialSave("gold-seed", NOW), lastSavedAt: NOW + 1000 };
    original.resources.gold = 42;

    const result = deserializeSave(serializeSave(original), NOW + 1000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.resources.gold).toBe(42);
    }
  });
});

describe("deserializeSave error handling", () => {
  it("returns invalid-json for unparsable input", () => {
    const result = deserializeSave("{not json", NOW);
    expect(result).toMatchObject({ ok: false, reason: "invalid-json" });
  });

  it("returns invalid-shape for well-formed JSON that isn't a valid save", () => {
    const result = deserializeSave(JSON.stringify({ hello: "world" }), NOW);
    expect(result).toMatchObject({ ok: false, reason: "invalid-shape" });
  });

  it("returns invalid-shape for a save with a negative gold value", () => {
    const broken = { ...createInitialSave("broken", NOW), resources: { gold: -5 } };
    const result = deserializeSave(JSON.stringify(broken), NOW);
    expect(result).toMatchObject({ ok: false, reason: "invalid-shape" });
  });

  it("never throws, even on garbage input", () => {
    expect(() => deserializeSave("", NOW)).not.toThrow();
    expect(() => deserializeSave("null", NOW)).not.toThrow();
    expect(() => deserializeSave("[1,2,3]", NOW)).not.toThrow();
  });
});

describe("migrateToCurrent", () => {
  it("migrates a legacy v0 save (no schemaVersion) up to the current schema", () => {
    const legacy = { gold: 15 };
    const migrated = migrateToCurrent(legacy, NOW);

    expect(migrated).toMatchObject({
      schemaVersion: CURRENT_SAVE_VERSION,
      resources: { gold: 15 },
    });
  });

  it("is transparently invoked by deserializeSave for legacy saves", () => {
    const legacyRaw = JSON.stringify({ gold: 7 });
    const result = deserializeSave(legacyRaw, NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.resources.gold).toBe(7);
      expect(result.data.schemaVersion).toBe(CURRENT_SAVE_VERSION);
    }
  });

  it("leaves an already-current save untouched", () => {
    const current = createInitialSave("no-op-migration", NOW);
    const migrated = migrateToCurrent(current, NOW);
    expect(migrated).toEqual(current);
  });
});
