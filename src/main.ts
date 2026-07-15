// Self-hosted OFL fonts (design doc §8) — must load before the token sheet references them.
import "@fontsource/im-fell-english-sc";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/600.css";
import "@fontsource/eb-garamond/700.css";
import "./styles/grimoire.css";
import { createInitialSave } from "./core/save";
import { createRng } from "./core/rng";
import { battleConfig, stages } from "./data";
import { RARITY_TINTS, rarityCssColor } from "./data/rarity-visuals";
import type { RarityTier } from "./data/schemas";
import { createLocalAdapter } from "./platform/local";
import { createPixiApp } from "./render/pixi-app";
import { mountBattleScene } from "./render/battle-scene";
import { mountCauldronScene } from "./render/cauldron-scene";
import { performFight } from "./store/actions";
import { createEventBus } from "./store/events";
import type { GameEventMap } from "./store/events";
import { loadGame } from "./store/persistence";
import { playerPower } from "./store/selectors";
import { createStore } from "./store/store";
import { mountAppShell } from "./ui/app-shell";
import { mountLabPanel } from "./ui/lab-panel";

/**
 * Composition root: the one place allowed to import from every layer (core, store,
 * platform, render, ui) and wire them together. Nothing below here should ever import
 * `main.ts`. `render/` (Pixi, the scene) and `ui/` (DOM, the interface on top of it) are
 * independent siblings — this is the one place that hands `render/` a DOM anchor owned by
 * `ui/`, since the two leaf layers must not import each other (ARCHITECTURE.md §1/§6).
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

  // Rarity colors live in data/rarity-visuals.ts (shared with the Pixi renderer, which
  // can't read CSS variables); the DOM side receives them as --rarity-* custom properties.
  for (const tier of Object.keys(RARITY_TINTS) as RarityTier[]) {
    document.documentElement.style.setProperty(`--rarity-${tier}`, rarityCssColor(tier));
  }

  const pixi = await createPixiApp();

  mountAppShell(container, { store, events, io: platform, now });

  // Forked *after* loadGame so a restored save's seed drives these streams, not a
  // throwaway seed from the pre-load initial state.
  const rootRng = createRng(store.getState().seed);
  const battleRng = rootRng.fork("battle");
  const lab = mountLabPanel(container, {
    store,
    events,
    siftRng: rootRng.fork("sift"),
    brewRng: rootRng.fork("brew"),
    distillRng: rootRng.fork("distill"),
  });
  mountBattleScene(pixi.stage, { events, store, ticker: pixi.ticker, anchor: lab.battleAnchor });
  mountCauldronScene(pixi.stage, { events, ticker: pixi.ticker, anchor: lab.cauldronAnchor });

  // Auto-battle driver: the alchemist fights the current stage on a fixed cadence
  // (data/battle.json), no button. The timer lives here in the composition root — core
  // stays free of setTimeout/setInterval (CLAUDE.md rule 1); each tick resolves through
  // the same performFight → events pipeline the scene and UI already listen to.
  window.setInterval(() => {
    const state = store.getState();
    const stage = stages.find((candidate) => candidate.id === state.currentStageId);
    if (!stage) return;
    performFight(store, events, battleRng, stage, playerPower(state));
  }, battleConfig.autoIntervalSeconds * 1000);

  platform.gameplayStart();

  // Fade the app in once the self-hosted fonts are ready (see #app in grimoire.css) — avoids
  // the flash of unstyled, fallback-font content on first paint.
  void document.fonts.ready.then(() => {
    document.documentElement.classList.add("app-ready");
  });
}

void bootstrap();
