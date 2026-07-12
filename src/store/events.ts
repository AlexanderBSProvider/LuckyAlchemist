/**
 * Domain events — "something just happened" (`save:written`), as opposed to store state
 * which is "what the situation is right now" (`resources.gold`). UI, render, and audio
 * subscribe to events for one-shot reactions (play a sound, flash the screen) instead of
 * diffing state every frame. See ARCHITECTURE.md §4.
 *
 * `GameEventMap` grows as features land — Stage 1 adds `brew:success`, `distill:burst`,
 * etc. Stage 0 only has the persistence lifecycle events, wired up by `persistence.ts`.
 */
// A `type` alias, not an `interface`: only object type literals (and type aliases to
// them) get an implicit index signature when checked against a `Record<string, unknown>`
// generic constraint below — interfaces never do, due to declaration merging. See
// docs/course/03-architecture-store-saves.md for the full explanation.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- must stay a `type`
export type GameEventMap = {
  "save:written": { at: number };
  "save:loaded": { at: number };
  "save:load-failed": { reason: string };
};

export interface EventBus<EventMap extends Record<string, unknown>> {
  emit: <Name extends keyof EventMap>(event: Name, payload: EventMap[Name]) => void;
  /** Returns an unsubscribe function. */
  on: <Name extends keyof EventMap>(
    event: Name,
    handler: (payload: EventMap[Name]) => void,
  ) => () => void;
}

export function createEventBus<EventMap extends Record<string, unknown>>(): EventBus<EventMap> {
  const handlersByEvent = new Map<keyof EventMap, Set<(payload: unknown) => void>>();

  const emit: EventBus<EventMap>["emit"] = (event, payload) => {
    const handlers = handlersByEvent.get(event);
    if (!handlers) return;
    for (const handler of handlers) handler(payload);
  };

  const on: EventBus<EventMap>["on"] = (event, handler) => {
    let handlers = handlersByEvent.get(event);
    if (!handlers) {
      handlers = new Set();
      handlersByEvent.set(event, handlers);
    }
    const boxedHandler = handler as (payload: unknown) => void;
    handlers.add(boxedHandler);
    return () => {
      handlers.delete(boxedHandler);
    };
  };

  return { emit, on };
}
