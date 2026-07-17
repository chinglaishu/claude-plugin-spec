import { describe, it, expect } from "vitest";
import { isTypeVisible } from "./typeVisibility";

describe("isTypeVisible", () => {
  it("defaults everything visible when vis is absent/empty/null", () => {
    expect(isTypeVisible({ type: "test", kind: "unit-fe" })).toBe(true);
    expect(isTypeVisible({ type: "cache-entry" }, {})).toBe(true);
    expect(isTypeVisible({ type: "test", kind: "unit-be" }, null)).toBe(true);
  });
  it("hides unit-fe tests only when 'unit-fe' is explicitly false", () => {
    expect(isTypeVisible({ type: "test", kind: "unit-fe" }, { "unit-fe": false })).toBe(false);
    expect(isTypeVisible({ type: "test", kind: "unit-fe" }, { "unit-fe": true })).toBe(true);
  });
  it("hides unit-be tests only when 'unit-be' is explicitly false", () => {
    expect(isTypeVisible({ type: "test", kind: "unit-be" }, { "unit-be": false })).toBe(false);
  });
  it("hides cache-entry nodes only when 'cache-entry' is explicitly false", () => {
    expect(isTypeVisible({ type: "cache-entry" }, { "cache-entry": false })).toBe(false);
    expect(isTypeVisible({ type: "cache-entry" }, { "cache-entry": true })).toBe(true);
  });
  it("a toggle only affects its own kind — hiding unit-fe leaves unit-be/e2e/cache visible", () => {
    const v = { "unit-fe": false };
    expect(isTypeVisible({ type: "test", kind: "unit-be" }, v)).toBe(true);
    expect(isTypeVisible({ type: "test", kind: "e2e" }, v)).toBe(true);
    expect(isTypeVisible({ type: "cache-entry" }, v)).toBe(true);
  });
  it("never hides non-hideable node types even when all flags are false", () => {
    const off = { "unit-fe": false, "unit-be": false, "cache-entry": false } as const;
    ["doc", "requirement", "instruction", "agent", "hook", "feature"].forEach((t) => {
      expect(isTypeVisible({ type: t }, off)).toBe(true);
    });
    expect(isTypeVisible({ type: "test", kind: "e2e" }, off)).toBe(true); // e2e is never hideable
  });
  it("a test node with no kind is always visible (not a hideable unit kind)", () => {
    expect(isTypeVisible({ type: "test" }, { "unit-fe": false, "unit-be": false })).toBe(true);
  });
});
