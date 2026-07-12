/**
 * Everything the game needs from "the outside world": a portal SDK (Poki, CrazyGames) or,
 * for local development and itch.io, just the browser. The rest of the codebase only ever
 * talks to this interface — swapping portals means writing a new adapter, not touching
 * `store/`, `ui/`, or `core/`. See ARCHITECTURE.md §5.
 */
export interface PlatformAdapter {
  /** Bootstraps the portal SDK. Must resolve before ads or portal saves are used. */
  initSDK: () => Promise<void>;
  /** Tells the portal a gameplay session has started (affects ad scheduling on some SDKs). */
  gameplayStart: () => void;
  gameplayStop: () => void;
  /** Shows a rewarded ad; resolves `true` if the player watched it to completion. */
  showRewardedAd: () => Promise<boolean>;
  save: (raw: string) => Promise<void>;
  load: () => Promise<string | null>;
}
