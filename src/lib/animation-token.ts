/**
 * Cancels stale scheduled callbacks (setTimeout/requestAnimationFrame chains) when an
 * interruptible animation is re-triggered before finishing — e.g. clicking "Brew" again
 * while the previous brew's burst animation is still playing. Deferred callbacks check
 * `isCurrent(token)` before acting instead of firing late into unrelated state.
 *
 * Lives in `src/lib/` (not `core/` or `data/`) because both `render/` and `ui/` need it and
 * ARCHITECTURE.md §1 forbids leaf layers importing each other directly.
 */

export interface AnimationTokenGuard {
  /** Invalidates every previously issued token and returns the new current one. */
  next: () => number;
  isCurrent: (token: number) => boolean;
}

export function createAnimationTokenGuard(): AnimationTokenGuard {
  let current = 0;
  return {
    next: () => {
      current += 1;
      return current;
    },
    isCurrent: (token) => token === current,
  };
}
