import type { RarityTier } from "./schemas";

/**
 * Canonical rarity tint per tier — the single source both DOM and Three.js read. The DOM
 * side gets these as `--rarity-*` CSS custom properties (stamped onto `:root` by `main.ts`
 * at bootstrap, replacing the old hardcoded values in `grimoire.css`); the Three.js side
 * reads the numeric form directly, since a canvas can't consume CSS variables.
 *
 * Cosmetic lookup, not gameplay balance — plain TS, no JSON/Zod (same carve-out as
 * `glyphs.ts`). One shared glow style recolored per tier is the whole rarity visual
 * language (GAME-DESIGN.md §8: vial × rarity color × stamp), ported as a technique from
 * the reference project's single-glow-image-plus-CSS-filter approach.
 */
export const RARITY_TINTS: Record<RarityTier, number> = {
  common: 0xa89a82,
  uncommon: 0x3fa372,
  rare: 0x4f7ea8,
  epic: 0x8a5fb5,
  legendary: 0xc9a227,
  quintessence: 0xf2e9d8,
};

/** `#rrggbb` form for DOM/CSS consumers. */
export function rarityCssColor(tier: RarityTier): string {
  return `#${RARITY_TINTS[tier].toString(16).padStart(6, "0")}`;
}
