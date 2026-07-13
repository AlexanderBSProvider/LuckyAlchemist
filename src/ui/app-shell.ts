import "./app-shell.css";
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
 * The grimoire header bar: game title, manual save, and save-status line. Follows the
 * plain-function DOM component pattern used throughout `ui/`: a function takes a container
 * and dependencies, builds DOM nodes, subscribes to the event bus, and returns a cleanup
 * function that undoes every subscription. Stage 0's "+1 gold" stub button is gone —
 * resources now come from the real loop rendered by lab-panel.
 */
export function mountAppShell(container: HTMLElement, deps: AppShellDeps): () => void {
  const { store, events, io, now } = deps;

  const root = document.createElement("header");
  root.className = "app-shell";

  const title = document.createElement("h1");
  title.className = "app-shell__title";
  title.textContent = "Lucky Alchemist";

  const side = document.createElement("div");
  side.className = "app-shell__side";

  const statusLine = document.createElement("p");
  statusLine.className = "app-shell__status";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Зберегти";
  saveButton.addEventListener("click", () => {
    void saveGame(store, io, events, now());
  });

  side.append(statusLine, saveButton);
  root.append(title, side);
  container.append(root);

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
    unsubscribeSaved();
    unsubscribeLoaded();
    unsubscribeLoadFailed();
    root.remove();
  };
}
