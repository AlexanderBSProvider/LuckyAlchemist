/**
 * Economy simulation harness (ARCHITECTURE.md §8, GAME-DESIGN.md §5).
 *
 * Runs thousands of simulated play sessions directly against `src/core` (no store, no
 * browser) and reports the "% of simulated players stalled" metric — the metric that
 * matters for this game is not average RTP, it's how many sessions never move forward.
 *
 * Mirrors the real mechanic now that it exists: fighting doesn't need any potions (base
 * power alone can win early stages), which is what lets a fresh save bootstrap — win a
 * fight, get ingredients, brew, equip, repeat.
 */
import { createRng } from "../src/core/rng";
import type { Rng } from "../src/core/rng";
import { brew } from "../src/core/brewing";
import { distillCycle } from "../src/core/distill";
import { simulateStage } from "../src/core/battle";
import { siftAsh, upgradeCost, estimatePlayerPower } from "../src/core/economy";
import { createPotion, equippedPower } from "../src/core/mutations";
import type { Potion } from "../src/core/mutations";
import {
  symbols,
  rings,
  ingredients,
  distillationStages,
  stages,
  upgrades,
  ashSiftConfig,
  mutationConfig,
  battleConfig,
} from "../src/data";
import type { GradeId } from "../src/data/schemas";

const PLAYER_COUNT = 10_000;
const SIMULATED_HOURS = 20;
const BREWS_PER_HOUR = 6;
const DISTILL_PUSHES = 2; // fixed strategy: always push twice, then bank whatever survives
const SIFT_ASH_THRESHOLD = 5;
const STUCK_HOURS_THRESHOLD = 5; // no stage advance for this many consecutive hours = stuck
// Auto-battle cadence comes from data (battle.json), the same value the game's driver in
// main.ts uses — the sim must roll as many fight attempts as the real game does.
const FIGHTS_PER_HOUR = Math.max(1, Math.round(3600 / battleConfig.autoIntervalSeconds));

interface PlayerState {
  gold: number;
  ash: number;
  ingredientCounts: Record<string, number>;
  upgradeLevels: Record<string, number>;
  potions: Potion[];
  stageIndex: number;
}

function createPlayerState(): PlayerState {
  return { gold: 0, ash: 0, ingredientCounts: {}, upgradeLevels: {}, potions: [], stageIndex: 0 };
}

function currentPower(state: PlayerState): number {
  return estimatePlayerPower(state.upgradeLevels) + equippedPower(state.potions, mutationConfig);
}

/** Spends one of every ingredient currently held as the brewing stake, if any are held. */
function runBrewAndDistill(rng: Rng, state: PlayerState): void {
  const ingredientIds = Object.entries(state.ingredientCounts)
    .filter(([, amount]) => amount > 0)
    .map(([id]) => id);
  if (ingredientIds.length === 0) return;
  for (const id of ingredientIds) {
    state.ingredientCounts[id] = (state.ingredientCounts[id] ?? 0) - 1;
  }

  const result = brew(rng, { rings, symbols, ingredients }, { ingredientIds });
  if (result.outcome.kind === "fail") {
    state.ash += 1;
    return;
  }

  let grade: GradeId = "tincture";
  for (let push = 0; push < DISTILL_PUSHES; push++) {
    const outcome = distillCycle(rng, distillationStages, grade);
    if (outcome.kind === "burst") return; // flask lost, nothing joins the inventory
    grade = outcome.grade;
  }

  let potion = createPotion(
    String(state.potions.length + 1),
    result.outcome.symbolId,
    result.outcome.rarity,
    grade,
  );
  const equippedCount = state.potions.filter((p) => p.equipped).length;
  if (equippedCount < mutationConfig.maxEquippedSlots) potion = { ...potion, equipped: true };
  state.potions.push(potion);
}

function runSifting(rng: Rng, state: PlayerState): void {
  if (state.ash < SIFT_ASH_THRESHOLD) return;
  const result = siftAsh(rng, state.ash, ashSiftConfig);
  state.ingredientCounts[result.ingredientId] =
    (state.ingredientCounts[result.ingredientId] ?? 0) + result.amount;
  state.ash = 0;
}

function runFight(rng: Rng, state: PlayerState): void {
  const stage = stages[state.stageIndex];
  if (!stage) return; // cleared every Stage 1 stage
  const outcome = simulateStage(rng, stage, currentPower(state));
  if (outcome.kind === "loss") return;

  state.gold += outcome.reward.gold;
  state.ingredientCounts[outcome.reward.ingredientId] =
    (state.ingredientCounts[outcome.reward.ingredientId] ?? 0) + outcome.reward.ingredientAmount;
  state.stageIndex += 1;
}

/** Greedy: buy the first upgrade the player can currently afford. */
function runShopping(state: PlayerState): void {
  for (const upgrade of upgrades) {
    const level = state.upgradeLevels[upgrade.id] ?? 0;
    const cost = upgradeCost(upgrade, level);
    if (state.gold < cost) continue;
    state.gold -= cost;
    state.upgradeLevels[upgrade.id] = level + 1;
    return;
  }
}

interface SessionResult {
  finalStageIndex: number;
  clearedAllStages: boolean;
  stuck: boolean;
}

function runSession(seed: string): SessionResult {
  const rootRng = createRng(seed);
  const brewRng = rootRng.fork("brew");
  const siftRng = rootRng.fork("sift");
  const battleRng = rootRng.fork("battle");

  const state = createPlayerState();
  let lastAdvanceHour = 0;
  let stuck = false;

  for (let hour = 1; hour <= SIMULATED_HOURS; hour++) {
    const stageBefore = state.stageIndex;

    for (let f = 0; f < FIGHTS_PER_HOUR; f++) runFight(battleRng, state);
    for (let i = 0; i < BREWS_PER_HOUR; i++) runBrewAndDistill(brewRng, state);
    runSifting(siftRng, state);
    runShopping(state);

    if (state.stageIndex > stageBefore) {
      lastAdvanceHour = hour;
    } else if (hour - lastAdvanceHour >= STUCK_HOURS_THRESHOLD) {
      stuck = true;
    }
  }

  return {
    finalStageIndex: state.stageIndex,
    clearedAllStages: state.stageIndex >= stages.length,
    stuck,
  };
}

function main(): void {
  let stuckCount = 0;
  let clearedCount = 0;
  let stageIndexTotal = 0;

  for (let i = 0; i < PLAYER_COUNT; i++) {
    const result = runSession(`econ-sim-${String(i)}`);
    if (result.stuck) stuckCount += 1;
    if (result.clearedAllStages) clearedCount += 1;
    stageIndexTotal += result.finalStageIndex;
  }

  const stuckPct = (100 * stuckCount) / PLAYER_COUNT;
  const clearedPct = (100 * clearedCount) / PLAYER_COUNT;
  const avgStage = stageIndexTotal / PLAYER_COUNT;

  console.log(
    `[econ-sim] players simulated: ${String(PLAYER_COUNT)}, horizon: ${String(SIMULATED_HOURS)}h, ` +
      `auto-battle: ${String(FIGHTS_PER_HOUR)} fights/h`,
  );
  console.log(
    `[econ-sim] stuck (no stage advance for ${String(STUCK_HOURS_THRESHOLD)}h+): ` +
      `${stuckPct.toFixed(1)}%`,
  );
  console.log(`[econ-sim] cleared all ${String(stages.length)} stages: ${clearedPct.toFixed(1)}%`);
  console.log(`[econ-sim] average stages cleared: ${avgStage.toFixed(2)}`);
}

main();
