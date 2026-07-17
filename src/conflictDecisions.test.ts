import { describe, it, expect } from "vitest";
import { readDecisions, applyDecision, serializeDecisions, decisionsFor } from "./conflictDecisions";
import type { ConflictFinding } from "./types";

const finding = (id: string): ConflictFinding => ({
  id, subject: id, scope: "pfl", category: "formula", severity: "high", axis: "mixed", tags: [], why: "",
  participants: [], positions: [],
});

describe("readDecisions", () => {
  it("parses a decisions map", () => {
    expect(readDecisions(JSON.stringify({ "cf-1": { status: "dismissed" } }))).toEqual({ "cf-1": { status: "dismissed" } });
  });
  it("returns {} for null / malformed, never throws", () => {
    expect(readDecisions(null)).toEqual({});
    expect(readDecisions("{bad")).toEqual({});
    expect(readDecisions("[]")).toEqual({});
  });
});

describe("applyDecision", () => {
  it("stores a decision immutably", () => {
    const before = {};
    const after = applyDecision(before, "cf-1", { status: "dismissed", at: "t" });
    expect(after).toEqual({ "cf-1": { status: "dismissed", at: "t" } });
    expect(before).toEqual({}); // unchanged
  });
  it("overwrites an existing decision for the same id", () => {
    const after = applyDecision({ "cf-1": { status: "dismissed" } }, "cf-1", { status: "resolved", positionId: "A" });
    expect(after["cf-1"]).toEqual({ status: "resolved", positionId: "A" });
  });
  it("removes the entry when reset to open (finding returns to default)", () => {
    const after = applyDecision({ "cf-1": { status: "dismissed" } }, "cf-1", { status: "open" });
    expect(after["cf-1"]).toBeUndefined();
  });
});

describe("serializeDecisions", () => {
  it("emits keys in sorted order (stable, diffable)", () => {
    const s = serializeDecisions({ "cf-b": { status: "dismissed" }, "cf-a": { status: "resolved", positionId: "A" } });
    expect(s.indexOf("cf-a")).toBeLessThan(s.indexOf("cf-b"));
  });
});

describe("decisionsFor", () => {
  it("keeps only decisions whose finding still exists (prunes stale) and defaults missing to open", () => {
    const findings = [finding("cf-1"), finding("cf-2")];
    const decisions = { "cf-1": { status: "dismissed" as const }, "cf-gone": { status: "dismissed" as const } };
    const merged = decisionsFor(findings, decisions);
    expect(merged["cf-1"].status).toBe("dismissed");
    expect(merged["cf-2"].status).toBe("open"); // default
    expect(merged["cf-gone"]).toBeUndefined(); // pruned — its finding is gone
  });
});
