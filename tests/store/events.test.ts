import { describe, expect, it, vi } from "vitest";
import { createEventBus } from "../../src/store/events";

// `type`, not `interface` — see the same note on `GameEventMap` in src/store/events.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type TestEventMap = {
  ping: { count: number };
  silence: undefined;
};

describe("createEventBus", () => {
  it("calls a subscribed handler with the emitted payload", () => {
    const bus = createEventBus<TestEventMap>();
    const handler = vi.fn();
    bus.on("ping", handler);

    bus.emit("ping", { count: 1 });

    expect(handler).toHaveBeenCalledWith({ count: 1 });
  });

  it("calls every handler subscribed to the same event", () => {
    const bus = createEventBus<TestEventMap>();
    const first = vi.fn();
    const second = vi.fn();
    bus.on("ping", first);
    bus.on("ping", second);

    bus.emit("ping", { count: 1 });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does not call handlers subscribed to a different event", () => {
    const bus = createEventBus<TestEventMap>();
    const pingHandler = vi.fn();
    bus.on("ping", pingHandler);

    bus.emit("silence", undefined);

    expect(pingHandler).not.toHaveBeenCalled();
  });

  it("unsubscribe stops further calls to that handler", () => {
    const bus = createEventBus<TestEventMap>();
    const handler = vi.fn();
    const unsubscribe = bus.on("ping", handler);

    bus.emit("ping", { count: 1 });
    unsubscribe();
    bus.emit("ping", { count: 2 });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("emitting an event with no subscribers does not throw", () => {
    const bus = createEventBus<TestEventMap>();
    expect(() => {
      bus.emit("ping", { count: 1 });
    }).not.toThrow();
  });
});
