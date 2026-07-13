import type { Rng } from "./rng";
import type { AshSiftConfig, Upgrade } from "../data/schemas";

/**
 * Lab upgrade pricing and ash sifting (GAME-DESIGN.md §5): the economy's "floor" —
 * sifting always yields at least `minYieldPerAsh` regardless of luck, so a player can
 * never get stuck with zero forward progress.
 */

export function upgradeCost(upgrade: Upgrade, currentLevel: number): number {
  return Math.ceil(upgrade.baseCost * Math.pow(upgrade.growthRate, currentLevel));
}

export interface SiftResult {
  readonly ingredientId: string;
  readonly amount: number;
}

export function siftAsh(rng: Rng, ash: number, config: AshSiftConfig): SiftResult {
  const guaranteed = Math.floor(ash * config.minYieldPerAsh);
  const bonus = rng.chance(config.bonusChance) ? Math.floor(ash * config.bonusYieldPerAsh) : 0;
  return { ingredientId: config.ingredientId, amount: guaranteed + bonus };
}

/**
 * Base power from lab upgrades alone (a flat 5 plus a bonus per upgrade level). Total
 * battle power is this *plus* `core/mutations.ts`'s `equippedPower` — split in two because
 * this half has no dependency on the potion inventory and is cheap to call anywhere.
 */
export function estimatePlayerPower(upgradeLevels: Readonly<Record<string, number>>): number {
  const totalLevels = Object.values(upgradeLevels).reduce((sum, level) => sum + level, 0);
  return 5 + totalLevels * 2;
}
