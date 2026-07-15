import type { IconName } from "./icon-paths";

/** Engraved alchemical glyphs for era-1 symbols — unicode, no art assets (GAME-DESIGN.md §8). */
const SYMBOL_GLYPHS: Record<string, string> = {
  fire: "🜂",
  earth: "🜃",
  water: "🜄",
  metal: "🜛",
  spirit: "🜍",
};

export function glyphFor(id: string): string {
  return SYMBOL_GLYPHS[id] ?? "✶";
}

/** The five era-1 symbols share their id with an engraved game-icons key (icon-paths.ts). */
const ELEMENT_ICON_KEYS: readonly string[] = ["fire", "earth", "water", "metal", "spirit"];
export function elementIconName(symbolId: string): IconName {
  return ELEMENT_ICON_KEYS.includes(symbolId) ? (symbolId as IconName) : "spirit";
}

/** Cosmetic-only bestiary for the battle arena — cycles by stage id, no balance data. */
const BESTIARY = ["🐀", "🦇", "🕷️", "🐍", "👹", "🦂", "🐺", "👺", "🐉", "💀"];

export function foeGlyphFor(stageId: number): string {
  return BESTIARY[(stageId - 1) % BESTIARY.length] ?? "👹";
}
