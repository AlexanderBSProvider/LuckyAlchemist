import { estimatePlayerPower } from "../core/economy";
import { equippedPower } from "../core/mutations";
import { mutationConfig } from "../data";
import type { GameState } from "./game-state";

/**
 * Derived-state helpers shared by every consumer of the store (UI panels, the auto-battle
 * driver in `main.ts`, later render/audio). Lives in `store/` so leaf layers don't each
 * re-implement the same core-formula combination.
 */

/** Total battle power: lab upgrades base + equipped mutation potions. */
export function playerPower(state: GameState): number {
  return estimatePlayerPower(state.upgradeLevels) + equippedPower(state.potions, mutationConfig);
}
