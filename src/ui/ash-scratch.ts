/**
 * Scratch-card reveal for ash sifting (GAME-DESIGN.md §2: "a layer scratches away, target
 * ingredients come out of the pits"). Two stacked plain 2D `<canvas>` elements — the prize
 * text is baked into the bottom one, an ash texture covers it on top and gets erased by
 * dragging (`destination-out`). This is deliberately not the WebGL canvas in
 * `render/three-app.ts` (that one is a single fixed, `pointer-events:none` background layer
 * and can't host a drag interaction) — a real DOM canvas lives inside the lab panel instead.
 *
 * Coverage is estimated from total scratch stroke length rather than per-frame pixel
 * readback (`getImageData`) — cheap, and "did the player make a good-faith effort" doesn't
 * need pixel-exact accuracy. See docs/course/04-dom-canvas-scratch.md.
 *
 * The blob placement inside the ash texture uses plain `Math.random()`, same as
 * `visualPick`/`visualShuffle` in `ui/lab-panel.ts` — pure cosmetics, never the sifting
 * outcome itself (that's already resolved by `core/economy.ts`'s seeded `Rng` before this
 * component ever sees a result).
 */

export interface AshScratchResult {
  readonly label: string;
  readonly amount: number;
}

export type AshScratchPhase = "empty" | "covered" | "revealed";

export interface AshScratchHandle {
  phase: () => AshScratchPhase;
  /** Paints a freshly hidden prize and starts accepting scratch input. No-op unless idle. */
  arm: (result: AshScratchResult) => void;
  destroy: () => void;
}

const REVEAL_THRESHOLD = 0.55;
const REVEAL_HOLD_MS = 1200;
const BRUSH_DIAMETER = 36;
const ASH_BLOB_COUNT = 36;

interface Point {
  readonly x: number;
  readonly y: number;
}

function getContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ash-scratch: 2D canvas context unavailable");
  return ctx;
}

export function createAshScratch(
  container: HTMLElement,
  onSettled: () => void,
): AshScratchHandle {
  const wrapper = document.createElement("div");
  wrapper.className = "ash-scratch";
  wrapper.hidden = true;

  const prizeCanvas = document.createElement("canvas");
  prizeCanvas.className = "ash-scratch__layer ash-scratch__layer--prize";
  const ashCanvas = document.createElement("canvas");
  ashCanvas.className = "ash-scratch__layer ash-scratch__layer--ash";

  wrapper.append(prizeCanvas, ashCanvas);
  container.append(wrapper);

  const prizeCtx = getContext2d(prizeCanvas);
  const ashCtx = getContext2d(ashCanvas);

  let phase: AshScratchPhase = "empty";
  let cssWidth = 0;
  let cssHeight = 0;
  let scratchedArea = 0;
  let lastPoint: Point | null = null;
  let revealTimeout: ReturnType<typeof setTimeout> | null = null;

  const sizeLayer = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const paintAsh = (): void => {
    ashCtx.globalCompositeOperation = "source-over";
    ashCtx.clearRect(0, 0, cssWidth, cssHeight);
    ashCtx.fillStyle = "#2b241c";
    ashCtx.fillRect(0, 0, cssWidth, cssHeight);
    for (let i = 0; i < ASH_BLOB_COUNT; i += 1) {
      const x = Math.random() * cssWidth;
      const y = Math.random() * cssHeight;
      const r = 5 + Math.random() * 12;
      const shade = 28 + Math.floor(Math.random() * 30);
      ashCtx.fillStyle = `rgba(${String(shade + 24)}, ${String(shade + 16)}, ${String(shade)}, 0.55)`;
      ashCtx.beginPath();
      ashCtx.arc(x, y, r, 0, Math.PI * 2);
      ashCtx.fill();
    }
  };

  const paintPrize = (result: AshScratchResult): void => {
    prizeCtx.clearRect(0, 0, cssWidth, cssHeight);
    prizeCtx.textAlign = "center";
    prizeCtx.textBaseline = "middle";
    prizeCtx.fillStyle = "#c9a227";
    prizeCtx.font = `${String(Math.round(cssHeight * 0.26))}px "IM Fell English SC", serif`;
    prizeCtx.fillText(`+${String(result.amount)} ${result.label}`, cssWidth / 2, cssHeight / 2);
  };

  const clearLayers = (): void => {
    prizeCtx.clearRect(0, 0, cssWidth, cssHeight);
    ashCtx.clearRect(0, 0, cssWidth, cssHeight);
  };

  const resize = (): void => {
    const rect = wrapper.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    cssWidth = rect.width;
    cssHeight = rect.height;
    sizeLayer(prizeCanvas, prizeCtx);
    sizeLayer(ashCanvas, ashCtx);
    if (phase === "covered") paintAsh();
    else clearLayers();
  };

  const resizeObserver = new ResizeObserver(() => {
    resize();
  });
  resizeObserver.observe(wrapper);

  const finishReveal = (): void => {
    ashCtx.clearRect(0, 0, cssWidth, cssHeight);
    phase = "revealed";
    revealTimeout = setTimeout(() => {
      phase = "empty";
      wrapper.hidden = true;
      clearLayers();
      onSettled();
    }, REVEAL_HOLD_MS);
  };

  const scratchAt = (x: number, y: number): void => {
    ashCtx.globalCompositeOperation = "destination-out";
    ashCtx.beginPath();
    ashCtx.arc(x, y, BRUSH_DIAMETER / 2, 0, Math.PI * 2);
    ashCtx.fill();
  };

  const scratchLine = (from: Point, to: Point): void => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / (BRUSH_DIAMETER / 3)));
    for (let i = 0; i <= steps; i += 1) {
      scratchAt(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
    }
    scratchedArea += distance * BRUSH_DIAMETER;
    const fraction = Math.min(1, scratchedArea / (cssWidth * cssHeight));
    if (fraction >= REVEAL_THRESHOLD) finishReveal();
  };

  const pointFromEvent = (event: PointerEvent): Point => {
    const rect = ashCanvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: PointerEvent): void => {
    if (phase !== "covered") return;
    ashCanvas.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    lastPoint = point;
    scratchAt(point.x, point.y);
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (phase !== "covered" || !lastPoint) return;
    const point = pointFromEvent(event);
    scratchLine(lastPoint, point);
    lastPoint = point;
  };

  const handlePointerUp = (): void => {
    lastPoint = null;
  };

  ashCanvas.addEventListener("pointerdown", handlePointerDown);
  ashCanvas.addEventListener("pointermove", handlePointerMove);
  ashCanvas.addEventListener("pointerup", handlePointerUp);
  ashCanvas.addEventListener("pointercancel", handlePointerUp);

  return {
    phase: () => phase,
    arm: (result) => {
      if (phase !== "empty") return;
      wrapper.hidden = false;
      scratchedArea = 0;
      lastPoint = null;
      resize();
      paintPrize(result);
      paintAsh();
      phase = "covered";
    },
    destroy: () => {
      if (revealTimeout !== null) clearTimeout(revealTimeout);
      resizeObserver.disconnect();
      ashCanvas.removeEventListener("pointerdown", handlePointerDown);
      ashCanvas.removeEventListener("pointermove", handlePointerMove);
      ashCanvas.removeEventListener("pointerup", handlePointerUp);
      ashCanvas.removeEventListener("pointercancel", handlePointerUp);
      wrapper.remove();
    },
  };
}
