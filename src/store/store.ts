import { shallowEqual } from "./shallow-equal";

/** A command is the only way state changes: `(oldState) => newState`, never a mutation. */
export type Command<State> = (state: State) => State;

export interface Store<State> {
  getState: () => State;
  dispatch: (command: Command<State>) => void;
  /**
   * Subscribes to a *derived slice* of state, not the whole state. `listener` fires only
   * when `selector(state)` changes (shallow-compared) after a dispatch — not on every
   * dispatch. This is what lets a UI component watch just `state.resources.gold` without
   * re-rendering when, say, `state.lastSavedAt` changes.
   */
  subscribe: <Selected>(
    selector: (state: State) => Selected,
    listener: (selected: Selected) => void,
  ) => () => void;
}

interface Subscription<State> {
  selector: (state: State) => unknown;
  listener: (selected: unknown) => void;
  lastValue: unknown;
}

export function createStore<State>(initialState: State): Store<State> {
  let state = initialState;
  const subscriptions = new Set<Subscription<State>>();

  const getState = (): State => state;

  const dispatch: Store<State>["dispatch"] = (command) => {
    state = command(state);
    for (const subscription of subscriptions) {
      const nextValue = subscription.selector(state);
      if (!shallowEqual(nextValue, subscription.lastValue)) {
        subscription.lastValue = nextValue;
        subscription.listener(nextValue);
      }
    }
  };

  const subscribe: Store<State>["subscribe"] = (selector, listener) => {
    const subscription: Subscription<State> = {
      selector,
      listener: listener as (selected: unknown) => void,
      lastValue: selector(state),
    };
    subscriptions.add(subscription);
    return () => {
      subscriptions.delete(subscription);
    };
  };

  return { getState, dispatch, subscribe };
}
