// covers: REQ-KG-SERVE-02
import { describe, it, expect } from "vitest";
import { sep } from "node:path";
import { isWithinRoot } from "./pathGuard";

// Inputs mirror how callers actually use this guard: both `root` and `abs`
// are already `normalize()`d filesystem paths, so they use the platform's
// native separator (`sep`) — never a hardcoded "/".
const p = (...parts: string[]) => parts.join(sep);

describe("isWithinRoot", () => {
  it("accepts a path inside the root", () => {
    expect(isWithinRoot(p("a", "shots"), p("a", "shots", "case", "1.png"))).toBe(true);
  });

  it("accepts the root itself", () => {
    expect(isWithinRoot(p("a", "shots"), p("a", "shots"))).toBe(true);
  });

  it("rejects a sibling directory whose name merely starts with the root's name (boundary case)", () => {
    // Root ".../shots" must NOT match ".../shots-evil" — a naive
    // `abs.startsWith(root)` check would wrongly accept this because the
    // string "shots-evil/x" starts with the string "shots".
    expect(isWithinRoot(p("a", "shots"), p("a", "shots-evil", "x.png"))).toBe(false);
  });

  it("rejects a real traversal (../ escape resolved to outside root)", () => {
    expect(isWithinRoot(p("a", "shots"), p("a", "other"))).toBe(false);
  });

  it("tolerates a root already carrying a trailing separator", () => {
    expect(isWithinRoot(p("a", "shots") + sep, p("a", "shots", "case", "1.png"))).toBe(true);
    expect(isWithinRoot(p("a", "shots") + sep, p("a", "shots-evil", "x.png"))).toBe(false);
  });
});
