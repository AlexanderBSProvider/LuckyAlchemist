/**
 * One level deep equality check. Used by the store to decide whether a subscriber's
 * selected slice actually changed before calling its listener — cheap enough to run on
 * every dispatch, and correct as long as selectors return primitives or freshly-built
 * plain objects/arrays (which is exactly what selectors should do).
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;

  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((key) => Object.is(aRecord[key], bRecord[key]));
}
