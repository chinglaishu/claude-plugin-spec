import { describe, it, expect } from "vitest";
import { report } from "./artifacts";
const g = { generatedAt: "T", nodes: [], edges: [], issues: [{ kind: "orphan-doc", node: "backend:x", detail: "d" }] } as any;
describe("report", () => {
  it("keeps the existing summary shape", () => {
    expect(report(g)).toContain("**Issues:** 1");
  });
  it("appends a Since-last-sync section when delta lines are given", () => {
    const r = report(g, ["+1 requirement (backend:req-x)"]);
    expect(r).toContain("## Since last sync");
    expect(r).toContain("+1 requirement");
  });
  it("adds a Results timestamp line after Generated when lastRun exists", () => {
    const withRun = { ...g, lastRun: { at: "2026-07-03T00:00:00Z", commit: "abc1234" } };
    const r = report(withRun);
    expect(r).toContain("Generated: T\n\nResults: 2026-07-03T00:00:00Z (abc1234)\n");
  });
  it("shows 'Results: none recorded' when lastRun is absent", () => {
    const r = report(g);
    expect(r).toContain("Generated: T\n\nResults: none recorded\n");
  });
});
