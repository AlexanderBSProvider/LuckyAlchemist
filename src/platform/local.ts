import type { PlatformAdapter } from "./types";

const DEFAULT_SAVE_KEY = "lucky-alchemist:save";

export interface LocalAdapterOptions {
  /** Injectable storage, defaults to `window.localStorage`. Lets tests use a fake. */
  storage?: Storage;
  key?: string;
}

/**
 * The adapter used outside any portal: itch.io, local dev, and as the Stage 0 baseline
 * before `PokiAdapter`/`CrazyGamesAdapter` exist (Stage 4). Persists to `localStorage`;
 * there is no ad network to show a rewarded ad through, so that call always resolves `false`.
 */
export function createLocalAdapter(options: LocalAdapterOptions = {}): PlatformAdapter {
  const storage = options.storage ?? window.localStorage;
  const key = options.key ?? DEFAULT_SAVE_KEY;

  return {
    initSDK: () => Promise.resolve(),
    gameplayStart: () => undefined,
    gameplayStop: () => undefined,
    showRewardedAd: () => Promise.resolve(false),
    save: (raw) => {
      storage.setItem(key, raw);
      return Promise.resolve();
    },
    load: () => Promise.resolve(storage.getItem(key)),
  };
}
