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

/** Cosmetic-only bestiary for the battle arena — cycles by stage id, no balance data. */
const BESTIARY = ["🐀", "🦇", "🕷️", "🐍", "👹", "🦂", "🐺", "👺", "🐉", "💀"];

export function foeGlyphFor(stageId: number): string {
  return BESTIARY[(stageId - 1) % BESTIARY.length] ?? "👹";
}
