import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/rng";

describe("createRng", () => {
  it("is deterministic: same seed produces the same sequence", () => {
    const a = createRng("stage-1-seed");
    const b = createRng("stage-1-seed");

    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());

    expect(seqA).toEqual(seqB);
  });

  it("different seeds produce different sequences", () => {
    const a = createRng("seed-a");
    const b = createRng("seed-b");

    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());

    expect(seqA).not.toEqual(seqB);
  });

  it("accepts numeric seeds and stays deterministic", () => {
    const a = createRng(42);
    const b = createRng(42);

    expect(a.next()).toBe(b.next());
  });

  it("next() always returns a float in [0, 1)", () => {
    const rng = createRng("bounds-check");
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  describe("int", () => {
    it("stays within [min, max] inclusive", () => {
      const rng = createRng("int-bounds");
      for (let i = 0; i < 1000; i++) {
        const value = rng.int(3, 7);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(3);
        expect(value).toBeLessThanOrEqual(7);
      }
    });

    it("can return both endpoints given enough draws", () => {
      const rng = createRng("int-endpoints");
      const seen = new Set<number>();
      for (let i = 0; i < 500; i++) seen.add(rng.int(1, 3));
      expect(seen).toEqual(new Set([1, 2, 3]));
    });

    it("supports a single-value range", () => {
      const rng = createRng("int-single");
      expect(rng.int(5, 5)).toBe(5);
    });

    it("throws when min > max", () => {
      const rng = createRng("int-invalid");
      expect(() => rng.int(5, 1)).toThrow(RangeError);
    });
  });

  describe("chance", () => {
    it("probability 0 never succeeds", () => {
      const rng = createRng("chance-zero");
      for (let i = 0; i < 200; i++) expect(rng.chance(0)).toBe(false);
    });

    it("probability 1 always succeeds", () => {
      const rng = createRng("chance-one");
      for (let i = 0; i < 200; i++) expect(rng.chance(1)).toBe(true);
    });

    it("roughly matches the requested probability over many draws", () => {
      const rng = createRng("chance-distribution");
      const draws = 5000;
      let successes = 0;
      for (let i = 0; i < draws; i++) if (rng.chance(0.3)) successes++;
      expect(successes / draws).toBeGreaterThan(0.25);
      expect(successes / draws).toBeLessThan(0.35);
    });
  });

  describe("pick", () => {
    it("only ever returns provided values", () => {
      const rng = createRng("pick-values");
      const entries = [
        { value: "common", weight: 70 },
        { value: "rare", weight: 25 },
        { value: "legendary", weight: 5 },
      ];
      for (let i = 0; i < 500; i++) {
        expect(["common", "rare", "legendary"]).toContain(rng.pick(entries));
      }
    });

    it("respects relative weights over many draws", () => {
      const rng = createRng("pick-distribution");
      const entries = [
        { value: "heads", weight: 1 },
        { value: "tails", weight: 3 },
      ] as const;
      const draws = 5000;
      const counts = { heads: 0, tails: 0 };
      for (let i = 0; i < draws; i++) counts[rng.pick(entries)]++;

      // heads should land near 25%, tails near 75%, with slack for randomness.
      expect(counts.heads / draws).toBeGreaterThan(0.2);
      expect(counts.heads / draws).toBeLessThan(0.3);
    });

    it("ignores zero-weight entries", () => {
      const rng = createRng("pick-zero-weight");
      const entries = [
        { value: "never", weight: 0 },
        { value: "always", weight: 1 },
      ];
      for (let i = 0; i < 100; i++) {
        expect(rng.pick(entries)).toBe("always");
      }
    });

    it("throws on an empty entry list", () => {
      const rng = createRng("pick-empty");
      expect(() => rng.pick([])).toThrow(RangeError);
    });

    it("throws when total weight is not positive", () => {
      const rng = createRng("pick-no-weight");
      expect(() => rng.pick([{ value: "x", weight: 0 }])).toThrow(RangeError);
    });
  });

  describe("fork", () => {
    it("is deterministic given the same parent state and label", () => {
      const parentA = createRng("fork-parent");
      const parentB = createRng("fork-parent");

      const childA = parentA.fork("brewing");
      const childB = parentB.fork("brewing");

      expect(childA.next()).toBe(childB.next());
    });

    it("produces a stream independent from the parent's own sequence", () => {
      const parent = createRng("fork-independence");
      const child = parent.fork("battle");

      const parentNext = parent.next();
      const childNext = child.next();

      expect(parentNext).not.toBe(childNext);
    });

    it("different labels produce different streams from the same parent state", () => {
      const parentA = createRng("fork-labels");
      const parentB = createRng("fork-labels");

      const brewChild = parentA.fork("brewing");
      const battleChild = parentB.fork("battle");

      expect(brewChild.next()).not.toBe(battleChild.next());
    });

    it("advances the parent by exactly one draw", () => {
      const withFork = createRng("fork-advance");
      const reference = createRng("fork-advance");

      withFork.fork("anything");
      reference.next();

      expect(withFork.next()).toBe(reference.next());
    });
  });
});
