import "./styles/grimoire.css";
import { createInitialSave } from "./core/save";
import { createRng } from "./core/rng";
import { createLocalAdapter } from "./platform/local";
import { createEventBus } from "./store/events";
import type { GameEventMap } from "./store/events";
import { loadGame } from "./store/persistence";
import { createStore } from "./store/store";
import { mountAppShell } from "./ui/app-shell";
import { mountLabPanel } from "./ui/lab-panel";

/**
 * Composition root: the one place allowed to import from every layer (core, store,
 * platform, ui) and wire them together. Nothing below here should ever import `main.ts`.
 */
async function bootstrap(): Promise<void> {
  const now = (): number => Date.now();

  const platform = createLocalAdapter();
  await platform.initSDK();

  const store = createStore(createInitialSave(crypto.randomUUID(), now()));
  const events = createEventBus<GameEventMap>();

  await loadGame(store, platform, events, now());

  const container = document.querySelector<HTMLDivElement>("#app");
  if (!container) {
    throw new Error("main.ts: #app root element not found");
  }

  mountAppShell(container, { store, events, io: platform, now });

  // Forked *after* loadGame so a restored save's seed drives these streams, not a
  // throwaway seed from the pre-load initial state.
  const rootRng = createRng(store.getState().seed);
  mountLabPanel(container, {
    store,
    battleRng: rootRng.fork("battle"),
    siftRng: rootRng.fork("sift"),
    brewRng: rootRng.fork("brew"),
    distillRng: rootRng.fork("distill"),
  });

  platform.gameplayStart();
}

void bootstrap();
