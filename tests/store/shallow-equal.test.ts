import { describe, expect, it } from "vitest";
import { shallowEqual } from "../../src/store/shallow-equal";

describe("shallowEqual", () => {
  it("treats identical primitives as equal", () => {
    expect(shallowEqual(1, 1)).toBe(true);
    expect(shallowEqual("a", "a")).toBe(true);
    expect(shallowEqual(null, null)).toBe(true);
    expect(shallowEqual(undefined, undefined)).toBe(true);
  });

  it("treats different primitives as unequal", () => {
    expect(shallowEqual(1, 2)).toBe(false);
    expect(shallowEqual("a", "b")).toBe(false);
    expect(shallowEqual(null, undefined)).toBe(false);
  });

  it("treats objects with the same one-level keys/values as equal", () => {
    expect(shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it("treats objects with a differing value as unequal", () => {
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("treats objects with a different key count as unequal", () => {
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("does not compare nested objects deeply", () => {
    const shared = { x: 1 };
    expect(shallowEqual({ nested: shared }, { nested: { x: 1 } })).toBe(false);
    expect(shallowEqual({ nested: shared }, { nested: shared })).toBe(true);
  });

  it("treats arrays with equal elements as equal", () => {
    expect(shallowEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(shallowEqual([1, 2, 3], [1, 2])).toBe(false);
  });
});
