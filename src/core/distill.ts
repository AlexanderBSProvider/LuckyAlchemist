import type { Rng } from "./rng";
import type { DistillationStage, GradeId } from "../data/schemas";
import { GRADE_ORDER } from "../data/schemas";

/**
 * Distillation: the push-your-luck decision at the heart of the loop (GAME-DESIGN.md §1.2).
 * Each cycle either advances the potion one grade up the ladder or bursts the flask,
 * losing it entirely. The player decides when to stop pushing — this module only resolves
 * a single cycle; the "stop or push again" choice lives in the store/UI layer.
 */

export type DistillOutcome =
  | { readonly kind: "advanced"; readonly grade: GradeId }
  | { readonly kind: "burst" };

function findStage(stages: readonly DistillationStage[], grade: GradeId): DistillationStage {
  const stage = stages.find((candidate) => candidate.grade === grade);
  if (!stage) throw new Error(`distillCycle: no distillation data for grade "${grade}"`);
  return stage;
}

export function distillCycle(
  rng: Rng,
  stages: readonly DistillationStage[],
  currentGrade: GradeId,
): DistillOutcome {
  const nextGrade = GRADE_ORDER[GRADE_ORDER.indexOf(currentGrade) + 1];
  if (!nextGrade) {
    throw new Error(`distillCycle: "${currentGrade}" is already the top grade`);
  }
  const stage = findStage(stages, currentGrade);
  if (!rng.chance(stage.advanceChance)) return { kind: "burst" };
  return { kind: "advanced", grade: nextGrade };
}
