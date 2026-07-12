import { describe, expect, it } from "vitest";
import { createInitialSave } from "../../src/core/save";
import { hydrate, incrementGoldStub, markSaved } from "../../src/store/commands";

const NOW = 1_752_000_000_000;

describe("hydrate", () => {
  it("replaces the entire state with the given save", () => {
    const oldState = createInitialSave("old", NOW);
    const newSave = createInitialSave("new", NOW + 1000);

    expect(hydrate(newSave)(oldState)).toEqual(newSave);
  });
});

describe("markSaved", () => {
  it("updates only lastSavedAt", () => {
    const state = createInitialSave("seed", NOW);
    const next = markSaved(NOW + 5000)(state);

    expect(next.lastSavedAt).toBe(NOW + 5000);
    expect(next.createdAt).toBe(state.createdAt);
    expect(next.seed).toBe(state.seed);
    expect(next.resources).toEqual(state.resources);
  });

  it("does not mutate the input state", () => {
    const state = createInitialSave("seed", NOW);
    markSaved(NOW + 5000)(state);
    expect(state.lastSavedAt).toBe(NOW);
  });
});

describe("incrementGoldStub", () => {
  it("adds the given amount to resources.gold", () => {
    const state = createInitialSave("seed", NOW);
    const next = incrementGoldStub(10)(state);
    expect(next.resources.gold).toBe(10);
  });

  it("is cumulative across repeated dispatches", () => {
    const state = createInitialSave("seed", NOW);
    const afterFirst = incrementGoldStub(10)(state);
    const afterSecond = incrementGoldStub(5)(afterFirst);
    expect(afterSecond.resources.gold).toBe(15);
  });

  it("does not mutate the input state or its nested resources object", () => {
    const state = createInitialSave("seed", NOW);
    incrementGoldStub(10)(state);
    expect(state.resources.gold).toBe(0);
  });
});
