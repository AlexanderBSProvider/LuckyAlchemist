import { deserializeSave, serializeSave } from "../core/save";
import type { GameState } from "./game-state";
import type { Store } from "./store";
import { hydrate, markSaved } from "./commands";
import type { EventBus, GameEventMap } from "./events";

/**
 * The slice of persistence I/O this module actually needs. Defined locally rather than
 * imported from `platform/types.ts` — `store/` must not depend on `platform/` (see
 * ARCHITECTURE.md §1). `platform/local.ts`'s `LocalAdapter` (and later Poki/CrazyGames
 * adapters) satisfy this shape structurally; no import required in either direction. This
 * is dependency inversion: the consumer declares the contract it needs, the provider just
 * happens to match it.
 */
export interface SaveIO {
  save: (raw: string) => Promise<void>;
  load: () => Promise<string | null>;
}

export async function saveGame(
  store: Store<GameState>,
  io: SaveIO,
  events: EventBus<GameEventMap>,
  now: number,
): Promise<void> {
  store.dispatch(markSaved(now));
  const raw = serializeSave(store.getState());
  await io.save(raw);
  events.emit("save:written", { at: now });
}

export async function loadGame(
  store: Store<GameState>,
  io: SaveIO,
  events: EventBus<GameEventMap>,
  now: number,
): Promise<void> {
  const raw = await io.load();
  if (raw === null) {
    events.emit("save:load-failed", { reason: "no-save-found" });
    return;
  }

  const result = deserializeSave(raw, now);
  if (!result.ok) {
    events.emit("save:load-failed", { reason: result.reason });
    return;
  }

  store.dispatch(hydrate(result.data));
  events.emit("save:loaded", { at: now });
}
