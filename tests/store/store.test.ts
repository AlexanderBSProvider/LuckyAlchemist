import { describe, expect, it, vi } from "vitest";
import { createStore } from "../../src/store/store";

interface TestState {
  count: number;
  label: string;
}

describe("createStore", () => {
  it("returns the initial state from getState", () => {
    const store = createStore<TestState>({ count: 0, label: "start" });
    expect(store.getState()).toEqual({ count: 0, label: "start" });
  });

  it("dispatch applies the command and updates state", () => {
    const store = createStore<TestState>({ count: 0, label: "start" });
    store.dispatch((state) => ({ ...state, count: state.count + 1 }));
    expect(store.getState().count).toBe(1);
  });

  it("dispatch never mutates the previous state object", () => {
    const store = createStore<TestState>({ count: 0, label: "start" });
    const before = store.getState();
    store.dispatch((state) => ({ ...state, count: state.count + 1 }));
    expect(before).toEqual({ count: 0, label: "start" });
    expect(store.getState()).not.toBe(before);
  });

  it("subscribe fires immediately-relevant listener only when the selected slice changes", () => {
    const store = createStore<TestState>({ count: 0, label: "start" });
    const listener = vi.fn();
    store.subscribe((state) => state.count, listener);

    store.dispatch((state) => ({ ...state, label: "changed" })); // count untouched
    expect(listener).not.toHaveBeenCalled();

    store.dispatch((state) => ({ ...state, count: 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(1);
  });

  it("supports multiple independent subscriptions", () => {
    const store = createStore<TestState>({ count: 0, label: "start" });
    const countListener = vi.fn();
    const labelListener = vi.fn();
    store.subscribe((state) => state.count, countListener);
    store.subscribe((state) => state.label, labelListener);

    store.dispatch((state) => ({ ...state, count: 5 }));

    expect(countListener).toHaveBeenCalledTimes(1);
    expect(labelListener).not.toHaveBeenCalled();
  });

  it("unsubscribe stops further notifications", () => {
    const store = createStore<TestState>({ count: 0, label: "start" });
    const listener = vi.fn();
    const unsubscribe = store.subscribe((state) => state.count, listener);

    store.dispatch((state) => ({ ...state, count: 1 }));
    unsubscribe();
    store.dispatch((state) => ({ ...state, count: 2 }));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify when a derived object selector is shallow-equal", () => {
    const store = createStore<{ nested: { x: number } }>({ nested: { x: 1 } });
    const listener = vi.fn();
    store.subscribe((state) => ({ x: state.nested.x }), listener);

    // Replaces `nested` with a new object holding the same `x` — selector output is
    // shallow-equal to the previous one, so the listener must not fire.
    store.dispatch((state) => ({ nested: { x: state.nested.x } }));

    expect(listener).not.toHaveBeenCalled();
  });
});
