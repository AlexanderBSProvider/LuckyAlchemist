import type { Potion } from "../../core/mutations";
import { elementIconName } from "../../data/glyphs";
import type { IconName } from "../../data/icon-paths";
import { GRADE_ORDER, RARITY_ORDER } from "../../data/schemas";

/**
 * Purely-visual descriptor tables that turn an equipped potion (element × rarity × grade)
 * into "what changes on the hero". Cosmetic lookup only — plain TS, no JSON/Zod (same
 * carve-out as `glyphs.ts` / `rarity-visuals.ts`). Nothing here touches game balance.
 *
 * The hero has six overlay channels, one per body part (GAME-DESIGN.md §4's paper-doll:
 * limbs/weapon, skin/armor, eyes/scream, heart/HP, glands/speed, core/luck). Since the data
 * model has no per-slot body part yet, the mapping is deterministic on equip order — see
 * `mutationLoadout`. That is the single seam to change when `PotionSave` grows a real slot.
 */

export type ParticleShape = "flame" | "grit" | "droplet" | "shard" | "wisp";

export interface ElementVisual {
  /** Main overlay/glow color for this element. */
  readonly primary: number;
  /** Lighter accent (sparks, highlights). */
  readonly secondary: number;
  /** Motion recipe for this element's particles. */
  readonly particle: ParticleShape;
}

// Harmonized with the Grimoire palette so element colors sit next to the gold/emerald deck.
const SPIRIT_VISUAL: ElementVisual = { primary: 0x8a5fb5, secondary: 0xc9a6ec, particle: "wisp" };

export const ELEMENT_VISUALS: Record<string, ElementVisual> = {
  fire: { primary: 0xd96a2b, secondary: 0xf2b24a, particle: "flame" },
  earth: { primary: 0x8a7a3e, secondary: 0xc2ab63, particle: "grit" },
  water: { primary: 0x4f7ea8, secondary: 0x8fc4e6, particle: "droplet" },
  metal: { primary: 0xb8bcc4, secondary: 0xeef1f5, particle: "shard" },
  spirit: SPIRIT_VISUAL,
};

/** Element visual for a symbol id, falling back to spirit for anything unknown. */
export function elementVisual(symbolId: string): ElementVisual {
  return ELEMENT_VISUALS[symbolId] ?? SPIRIT_VISUAL;
}

/** The six paper-doll channels, in the design-doc order. Equip slot `i` drives part `i`. */
export const BODY_PARTS = ["arms", "skin", "eyes", "heart", "glands", "core"] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export interface MutationVisual {
  readonly part: BodyPart;
  readonly element: ElementVisual;
  /** Engraved element icon (icon-paths.ts key) for the chest sigil. */
  readonly iconName: IconName;
  /** 0..1 from rarity tier — drives glow alpha and particle rate. */
  readonly intensity: number;
  /** 0..3 from grade — drives overlay size and feature unlocks (spikes, extra motes). */
  readonly tier: number;
}

/**
 * Maps the equipped potions to per-body-part visuals. Equipped list order (potion creation
 * order) → body part, so the arena hero and the DOM slots grid — which both index the same
 * filtered list — can never disagree about which mutation sits on which part.
 */
export function mutationLoadout(potions: readonly Potion[]): MutationVisual[] {
  const equipped = potions.filter((potion) => potion.equipped);
  const loadout: MutationVisual[] = [];
  const rarityMax = Math.max(1, RARITY_ORDER.length - 1);

  for (let i = 0; i < equipped.length && i < BODY_PARTS.length; i += 1) {
    const potion = equipped[i];
    const part = BODY_PARTS[i];
    if (!potion || !part) continue;
    const rarityIndex = Math.max(0, RARITY_ORDER.indexOf(potion.rarity));
    const gradeIndex = Math.max(0, GRADE_ORDER.indexOf(potion.grade));
    loadout.push({
      part,
      element: elementVisual(potion.symbolId),
      iconName: elementIconName(potion.symbolId),
      intensity: rarityIndex / rarityMax,
      tier: gradeIndex,
    });
  }
  return loadout;
}
