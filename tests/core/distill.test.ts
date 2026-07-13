import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/rng";
import { distillCycle } from "../../src/core/distill";
import type { DistillationStage } from "../../src/data/schemas";

const certainAdvance: DistillationStage[] = [
  { grade: "tincture", advanceChance: 1 },
  { grade: "elixir", advanceChance: 1 },
  { grade: "grand-elixir", advanceChance: 1 },
];

const certainBurst: DistillationStage[] = [
  { grade: "tincture", advanceChance: 0 },
  { grade: "elixir", advanceChance: 0 },
  { grade: "grand-elixir", advanceChance: 0 },
];

describe("distillCycle", () => {
  it("advances to the next grade when the roll succeeds", () => {
    const result = distillCycle(createRng("seed"), certainAdvance, "tincture");
    expect(result).toEqual({ kind: "advanced", grade: "elixir" });
  });

  it("walks the full ladder tincture -> elixir -> grand-elixir -> quintessence", () => {
    const rng = createRng("ladder");
    const step1 = distillCycle(rng, certainAdvance, "tincture");
    const step2 = distillCycle(rng, certainAdvance, "elixir");
    const step3 = distillCycle(rng, certainAdvance, "grand-elixir");
    expect([step1, step2, step3]).toEqual([
      { kind: "advanced", grade: "elixir" },
      { kind: "advanced", grade: "grand-elixir" },
      { kind: "advanced", grade: "quintessence" },
    ]);
  });

  it("bursts the flask when the roll fails", () => {
    const result = distillCycle(createRng("seed"), certainBurst, "elixir");
    expect(result).toEqual({ kind: "burst" });
  });

  it("throws when pushing past the top grade", () => {
    expect(() => distillCycle(createRng("seed"), certainAdvance, "quintessence")).toThrow(
      /already the top grade/,
    );
  });

  it("throws when no distillation data exists for the current grade", () => {
    expect(() => distillCycle(createRng("seed"), [], "tincture")).toThrow(
      /no distillation data/,
    );
  });
});
