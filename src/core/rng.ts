/**
 * Seeded, deterministic pseudo-random number generator.
 *
 * Everything in `core/` that needs randomness takes an {@link Rng} instance instead of
 * calling `Math.random()`. That is what makes brewing/distillation/battle formulas
 * unit-testable (same seed → same outcome), replayable (weekly seed challenges), and
 * simulatable in bulk (`tools/econ-sim.ts` runs thousands of sessions in milliseconds).
 *
 * Algorithm: xmur3 (seed string → 32-bit hash stream) feeding sfc32 (a fast, small-state
 * PRNG with good statistical quality for game purposes — not cryptographic).
 */

export interface WeightedEntry<T> {
  readonly value: T;
  readonly weight: number;
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next: () => number;
  /** Random integer in [min, max], inclusive on both ends. */
  int: (min: number, max: number) => number;
  /** `true` with the given probability (0..1). */
  chance: (probability: number) => boolean;
  /** Pick one value from weighted entries. Weights must be positive and need not sum to 1. */
  pick: <T>(entries: readonly WeightedEntry<T>[]) => T;
  /**
   * Deterministic, independent child stream namespaced by `label`.
   *
   * Drawing from a fork never advances the parent's own stream beyond the single draw
   * used to seed the fork, so unrelated subsystems (e.g. brewing vs. battle) can each
   * hold a stable fork without interfering with each other's sequence.
   */
  fork: (label: string) => Rng;
}

/** xmur3: hashes an arbitrary string into a stream of well-mixed 32-bit seeds. */
function xmur3(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** sfc32: given four 32-bit seed words, returns a `next()` producing floats in [0, 1). */
function sfc32(a0: number, b0: number, c0: number, d0: number): () => number {
  let a = a0 >>> 0;
  let b = b0 >>> 0;
  let c = c0 >>> 0;
  let d = d0 >>> 0;
  return () => {
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

function seedToNext(seed: string): () => number {
  const hash = xmur3(seed);
  return sfc32(hash(), hash(), hash(), hash());
}

function buildRng(next: () => number): Rng {
  const int: Rng["int"] = (min, max) => {
    if (min > max) {
      throw new RangeError(`Rng.int: min (${min}) must be <= max (${max})`);
    }
    const span = max - min + 1;
    return min + Math.floor(next() * span);
  };

  const chance: Rng["chance"] = (probability) => next() < probability;

  const pick: Rng["pick"] = (entries) => {
    if (entries.length === 0) {
      throw new RangeError("Rng.pick: entries must not be empty");
    }
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0) {
      throw new RangeError("Rng.pick: total weight must be > 0");
    }
    let roll = next() * total;
    for (const entry of entries) {
      if (entry.weight <= 0) continue;
      if (roll < entry.weight) return entry.value;
      roll -= entry.weight;
    }
    // Floating point rounding can leave a sliver of `roll` unconsumed — fall back to
    // the last positively-weighted entry rather than throwing.
    const fallback = [...entries].reverse().find((entry) => entry.weight > 0);
    if (!fallback) {
      throw new RangeError("Rng.pick: total weight must be > 0");
    }
    return fallback.value;
  };

  const fork: Rng["fork"] = (label) => {
    const drawn = next();
    return createRng(`${drawn.toString(36)}:${label}`);
  };

  return { next, int, chance, pick, fork };
}

/** Creates a deterministic {@link Rng} from a string or number seed. */
export function createRng(seed: string | number): Rng {
  return buildRng(seedToNext(String(seed)));
}
