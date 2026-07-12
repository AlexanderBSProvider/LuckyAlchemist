import { describe, expect, it } from "vitest";
import { createLocalAdapter } from "../../src/platform/local";

/** Minimal in-memory `Storage` fake — avoids depending on jsdom's localStorage in a unit test. */
function createFakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    key: (index) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("createLocalAdapter", () => {
  it("load() returns null when nothing has been saved yet", async () => {
    const adapter = createLocalAdapter({ storage: createFakeStorage() });
    await expect(adapter.load()).resolves.toBeNull();
  });

  it("save() then load() round-trips the raw string", async () => {
    const adapter = createLocalAdapter({ storage: createFakeStorage() });
    await adapter.save('{"gold":5}');
    await expect(adapter.load()).resolves.toBe('{"gold":5}');
  });

  it("uses the given storage key, isolating saves under different keys", async () => {
    const storage = createFakeStorage();
    const adapterA = createLocalAdapter({ storage, key: "slot-a" });
    const adapterB = createLocalAdapter({ storage, key: "slot-b" });

    await adapterA.save("save-a");
    await adapterB.save("save-b");

    await expect(adapterA.load()).resolves.toBe("save-a");
    await expect(adapterB.load()).resolves.toBe("save-b");
  });

  it("showRewardedAd resolves false — there is no ad network locally", async () => {
    const adapter = createLocalAdapter({ storage: createFakeStorage() });
    await expect(adapter.showRewardedAd()).resolves.toBe(false);
  });

  it("initSDK resolves without throwing", async () => {
    const adapter = createLocalAdapter({ storage: createFakeStorage() });
    await expect(adapter.initSDK()).resolves.toBeUndefined();
  });

  it("gameplayStart/gameplayStop do not throw", () => {
    const adapter = createLocalAdapter({ storage: createFakeStorage() });
    expect(() => {
      adapter.gameplayStart();
      adapter.gameplayStop();
    }).not.toThrow();
  });
});
