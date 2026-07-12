import { describe, expect, it, vi } from "vitest";
import { createInitialSave, serializeSave } from "../../src/core/save";
import { createStore } from "../../src/store/store";
import { createEventBus } from "../../src/store/events";
import type { GameEventMap } from "../../src/store/events";
import { incrementGoldStub } from "../../src/store/commands";
import { loadGame, saveGame } from "../../src/store/persistence";
import type { SaveIO } from "../../src/store/persistence";

const NOW = 1_752_000_000_000;

function createMemoryIO(initial: string | null = null): SaveIO & { written: string[] } {
  let content = initial;
  const written: string[] = [];
  return {
    written,
    save: (raw) => {
      content = raw;
      written.push(raw);
      return Promise.resolve();
    },
    load: () => Promise.resolve(content),
  };
}

describe("saveGame", () => {
  it("stamps lastSavedAt, writes serialized state to io, and emits save:written", async () => {
    const store = createStore(createInitialSave("seed", NOW));
    const events = createEventBus<GameEventMap>();
    const io = createMemoryIO();

    await saveGame(store, io, events, NOW + 1000);

    expect(store.getState().lastSavedAt).toBe(NOW + 1000);
    expect(io.written).toHaveLength(1);
    expect(io.written[0]).toBe(serializeSave(store.getState()));
  });

  it("emits save:written with the given timestamp", async () => {
    const store = createStore(createInitialSave("seed", NOW));
    const events = createEventBus<GameEventMap>();
    const handler = vi.fn();
    events.on("save:written", handler);
    const io = createMemoryIO();

    await saveGame(store, io, events, NOW + 42);

    expect(handler).toHaveBeenCalledWith({ at: NOW + 42 });
  });
});

describe("loadGame", () => {
  it("hydrates the store from a valid saved raw string and emits save:loaded", async () => {
    const saved = incrementGoldStub(99)(createInitialSave("loaded-seed", NOW));
    const io = createMemoryIO(serializeSave(saved));
    const store = createStore(createInitialSave("fresh", NOW));
    const events = createEventBus<GameEventMap>();
    const handler = vi.fn();
    events.on("save:loaded", handler);

    await loadGame(store, io, events, NOW + 10);

    expect(store.getState().resources.gold).toBe(99);
    expect(store.getState().seed).toBe("loaded-seed");
    expect(handler).toHaveBeenCalledWith({ at: NOW + 10 });
  });

  it("emits save:load-failed with no-save-found and leaves state untouched when io has nothing", async () => {
    const io = createMemoryIO(null);
    const initial = createInitialSave("fresh", NOW);
    const store = createStore(initial);
    const events = createEventBus<GameEventMap>();
    const handler = vi.fn();
    events.on("save:load-failed", handler);

    await loadGame(store, io, events, NOW);

    expect(store.getState()).toEqual(initial);
    expect(handler).toHaveBeenCalledWith({ reason: "no-save-found" });
  });

  it("emits save:load-failed for corrupt data and leaves state untouched", async () => {
    const io = createMemoryIO("{not valid json");
    const initial = createInitialSave("fresh", NOW);
    const store = createStore(initial);
    const events = createEventBus<GameEventMap>();
    const handler = vi.fn();
    events.on("save:load-failed", handler);

    await loadGame(store, io, events, NOW);

    expect(store.getState()).toEqual(initial);
    expect(handler).toHaveBeenCalledWith({ reason: "invalid-json" });
  });
});
