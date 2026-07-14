import { Application, type Container } from "pixi.js";

export interface RenderTicker {
  /** Registers a per-frame callback; call order matches registration order. */
  add: (fn: (deltaMs: number) => void) => void;
  remove: (fn: (deltaMs: number) => void) => void;
}

export interface PixiAppHandle {
  readonly app: Application;
  readonly stage: Container;
  readonly ticker: RenderTicker;
  destroy: () => void;
}

/**
 * Full-viewport Pixi canvas mounted as a fixed background layer, behind all DOM content
 * (ARCHITECTURE.md §6). The canvas and the DOM UI (`ui/app-shell.ts`, `ui/lab-panel.ts`) are
 * independent siblings under `#app`, coordinated only through CSS z-index, never through a
 * direct import.
 *
 * Pixi's default coordinate system is already top-left, y-down, world units = screen pixels
 * — the same convention the DOM-anchor scenes (`cauldron-scene.ts`, `battle-scene.ts`) use via
 * `getBoundingClientRect()`. No camera/projection setup needed, unlike the Three.js version.
 */
export async function createPixiApp(): Promise<PixiAppHandle> {
  const app = new Application();
  await app.init({
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
    resizeTo: window,
  });

  app.canvas.style.position = "fixed";
  app.canvas.style.inset = "0";
  // z-index 0 (not -1): a fixed element at a *negative* z-index paints *below* the root
  // element's background box, so the opaque `html` background in grimoire.css would cover
  // the canvas entirely (Chromium paints the propagated root background over negative-z
  // descendants). Instead the canvas sits at z-index 0 and `#app` is lifted to z-index 1
  // (styles/grimoire.css) so the DOM UI paints *over* the canvas while its transparent
  // regions (the battle `.scene`) still reveal it.
  app.canvas.style.zIndex = "0";
  app.canvas.style.pointerEvents = "none";
  document.body.prepend(app.canvas);

  const callbacks = new Set<(deltaMs: number) => void>();
  const ticker: RenderTicker = {
    add: (fn) => {
      callbacks.add(fn);
    },
    remove: (fn) => {
      callbacks.delete(fn);
    },
  };

  // A throw in one scene's per-frame callback must not kill the shared ticker: without
  // isolation, one bad tick would stop propagating to every other registered scene.
  app.ticker.add((tickerTick) => {
    for (const fn of callbacks) {
      try {
        fn(tickerTick.deltaMS);
      } catch (error) {
        console.error("pixi-app: scene tick threw", error);
      }
    }
  });

  const destroy = (): void => {
    callbacks.clear();
    app.destroy(true, { children: true, texture: true });
  };

  return { app, stage: app.stage, ticker, destroy };
}
