// covers: REQ-KG-CONF-05
import { describe, it, expect } from "vitest";
import { conflictId } from "./conflictId";

describe("conflictId", () => {
  it("is stable for the same subject+scope (basis for sticky dismiss/resolve)", () => {
    expect(conflictId("net_margin denominator", "pfl")).toBe(conflictId("net_margin denominator", "pfl"));
  });
  it("differs when the subject differs", () => {
    expect(conflictId("a", "pfl")).not.toBe(conflictId("b", "pfl"));
  });
  it("differs when the scope differs", () => {
    expect(conflictId("a", "pfl")).not.toBe(conflictId("a", "bil"));
  });
  it("has no subject/scope boundary collision (subjects contain spaces)", () => {
    // With a plain-space separator, id("b c","a") and id("c","a b") would both hash "a b c".
    expect(conflictId("b c", "a")).not.toBe(conflictId("c", "a b"));
  });
  it("uses the cf- prefix", () => {
    expect(conflictId("x", "y")).toMatch(/^cf-[0-9a-f]{10}$/);
  });
});
