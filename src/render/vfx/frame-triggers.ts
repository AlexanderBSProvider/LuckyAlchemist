/**
 * Fires callbacks at a given fraction of an animation's total duration — e.g. a spark VFX
 * at 40% and 80% through a 1.15s burst spin. Mirrors the "hit frame → SFX/VFX" technique
 * from playable-ad reference projects, adapted: instead of indexing into a fixed
 * spritesheet frame count, triggers are expressed directly as a 0..1 fraction of the
 * animation's duration (LuckyAlchemist has no frame-based skeletal animation to index into).
 */

export interface TimedTrigger {
  /** Fraction of the animation's total duration, 0..1, at which `run` fires. */
  readonly at: number;
  readonly run: () => void;
}

/** Returns a function that cancels every trigger still pending. */
export function scheduleTimedTriggers(
  durationMs: number,
  triggers: readonly TimedTrigger[],
): () => void {
  const timeoutIds = triggers.map((trigger) =>
    window.setTimeout(trigger.run, Math.max(0, trigger.at * durationMs)),
  );
  return () => {
    for (const id of timeoutIds) window.clearTimeout(id);
  };
}
