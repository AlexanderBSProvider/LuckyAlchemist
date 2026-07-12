import "./app-shell.css";
import { incrementGoldStub } from "../store/commands";
import type { GameEventMap } from "../store/events";
import type { EventBus } from "../store/events";
import type { GameState } from "../store/game-state";
import { saveGame } from "../store/persistence";
import type { SaveIO } from "../store/persistence";
import type { Store } from "../store/store";

export interface AppShellDeps {
  store: Store<GameState>;
  events: EventBus<GameEventMap>;
  io: SaveIO;
  now: () => number;
}

/**
 * Stage 0's only screen: an "empty laboratory" that proves the store, event bus, and
 * platform adapter are wired together correctly. Follows the plain-function DOM component
 * pattern used throughout `ui/` (see docs/course, module 3, once Stage 1 grows this out):
 * a function takes a container and dependencies, builds DOM nodes, subscribes to the
 * store/event bus, and returns a cleanup function that undoes every subscription.
 */
export function mountAppShell(container: HTMLElement, deps: AppShellDeps): () => void {
  const { store, events, io, now } = deps;

  const root = document.createElement("main");
  root.className = "app-shell";

  const title = document.createElement("h1");
  title.textContent = "Lucky Alchemist";

  const subtitle = document.createElement("p");
  subtitle.textContent = "Порожня лабораторія — Етап 0";

  const goldDisplay = document.createElement("p");

  const actions = document.createElement("div");
  actions.className = "app-shell__actions";

  const incrementButton = document.createElement("button");
  incrementButton.type = "button";
  incrementButton.textContent = "+1 золото (заглушка)";
  incrementButton.addEventListener("click", () => {
    store.dispatch(incrementGoldStub(1));
  });

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Зберегти";
  saveButton.addEventListener("click", () => {
    void saveGame(store, io, events, now());
  });

  const statusLine = document.createElement("p");
  statusLine.className = "app-shell__status";

  actions.append(incrementButton, saveButton);
  root.append(title, subtitle, goldDisplay, actions, statusLine);
  container.append(root);

  const renderGold = (gold: number): void => {
    goldDisplay.textContent = `Золото: ${gold}`;
  };
  renderGold(store.getState().resources.gold);

  const unsubscribeGold = store.subscribe((state) => state.resources.gold, renderGold);

  const unsubscribeSaved = events.on("save:written", ({ at }) => {
    statusLine.textContent = `Збережено о ${new Date(at).toLocaleTimeString("uk-UA")}`;
  });
  const unsubscribeLoaded = events.on("save:loaded", ({ at }) => {
    statusLine.textContent = `Сейв відновлено (${new Date(at).toLocaleTimeString("uk-UA")})`;
  });
  const unsubscribeLoadFailed = events.on("save:load-failed", ({ reason }) => {
    statusLine.textContent = `Новий сейв (${reason})`;
  });

  return () => {
    unsubscribeGold();
    unsubscribeSaved();
    unsubscribeLoaded();
    unsubscribeLoadFailed();
    root.remove();
  };
}
