import { OrthographicCamera, Scene, WebGLRenderer } from "three";

export interface RenderTicker {
  /** Registers a per-frame callback; call order matches registration order. */
  add: (fn: (deltaMs: number) => void) => void;
  remove: (fn: (deltaMs: number) => void) => void;
}

export interface ThreeAppHandle {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: OrthographicCamera;
  readonly ticker: RenderTicker;
  destroy: () => void;
}

/**
 * Full-viewport Three.js canvas mounted as a fixed background layer, behind all DOM content
 * — the Three.js replacement for the old `pixi-app.ts` (ARCHITECTURE.md §6). Same contract:
 * the canvas and the DOM UI (`ui/app-shell.ts`, `ui/lab-panel.ts`) are independent siblings
 * under `#app`, coordinated only through CSS z-index, never through a direct import.
 *
 * The camera is orthographic with `top: 0, bottom: window.innerHeight` (and `left: 0,
 * right: window.innerWidth`), so world coordinates equal screen pixels with a top-left,
 * y-down origin — the same convention the DOM-anchor scenes (`cauldron-scene.ts`,
 * `battle-scene.ts`) already use via `getBoundingClientRect()`. This is what lets scene code
 * call `object.position.set(rect.left, rect.top)` unchanged from the Pixi version.
 */
export function createThreeApp(): ThreeAppHandle {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);

  renderer.domElement.style.position = "fixed";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.zIndex = "-1";
  renderer.domElement.style.pointerEvents = "none";
  document.body.prepend(renderer.domElement);

  const scene = new Scene();
  const camera = new OrthographicCamera(0, window.innerWidth, 0, window.innerHeight, 0.1, 100);
  camera.position.z = 10;

  const onResize = (): void => {
    const { innerWidth, innerHeight } = window;
    renderer.setSize(innerWidth, innerHeight);
    camera.right = innerWidth;
    camera.bottom = innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", onResize);

  const callbacks = new Set<(deltaMs: number) => void>();
  const ticker: RenderTicker = {
    add: (fn) => {
      callbacks.add(fn);
    },
    remove: (fn) => {
      callbacks.delete(fn);
    },
  };

  let lastFrameMs = performance.now();
  let rafId = 0;
  const loop = (nowMs: number): void => {
    const deltaMs = nowMs - lastFrameMs;
    lastFrameMs = nowMs;
    for (const fn of callbacks) fn(deltaMs);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);

  const destroy = (): void => {
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);
    callbacks.clear();
    renderer.dispose();
    renderer.domElement.remove();
  };

  return { renderer, scene, camera, ticker, destroy };
}
