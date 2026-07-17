import { describe, it, expect } from "vitest";
import { applyResults } from "./parseResults";

const graph = {
  generatedAt: "T",
  nodes: [
    { id: "frontend:hv-1", type: "test", title: "HV-1", status: "todo" },
    { id: "frontend:hv-3", type: "test", title: "HV-3", status: "todo" },
    { id: "backend:x", type: "doc", title: "X", status: "current" },
  ],
  edges: [], issues: [],
} as any;
const results = JSON.stringify({ generatedAt: "2026-07-02T09:14:00Z", commit: "a1b2c3d", results: { "hv-1": "pass" } });

describe("applyResults", () => {
  it("overrides test status from the results file and stamps lastRun", () => {
    const g = applyResults(graph, results);
    expect(g.nodes.find((n: any) => n.id === "frontend:hv-1").status).toBe("pass");
    expect(g.nodes.find((n: any) => n.id === "frontend:hv-3").status).toBe("todo"); // no result → unchanged
    expect(g.nodes.find((n: any) => n.id === "backend:x").status).toBe("current");  // non-test untouched
    expect(g.lastRun).toEqual({ at: "2026-07-02T09:14:00Z", commit: "a1b2c3d" });
  });
  it("returns the graph unchanged when there is no results file", () => {
    expect(applyResults(graph, null).lastRun).toBeUndefined();
  });

  const v2results = JSON.stringify({
    generatedAt: "2026-07-03T10:00:00Z", commit: "e4f5a6b",
    results: { "hv-1": { status: "pass", attempts: 2, at: "2026-07-03T10:00:00Z" } },
  });

  it("v2: stamps status, attempts, runAt and derives flaky for retry-passes", () => {
    const g = applyResults(graph, v2results);
    const n = g.nodes.find((n: any) => n.id === "frontend:hv-1");
    expect(n.status).toBe("pass");
    expect(n.attempts).toBe(2);
    expect(n.runAt).toBe("2026-07-03T10:00:00Z");
    expect(n.flaky).toBe(true);
  });
  it("v1 entries never mark flaky (attempts normalize to 1)", () => {
    const g = applyResults(graph, results); // the existing v1 fixture
    expect(g.nodes.find((n: any) => n.id === "frontend:hv-1").flaky).toBeUndefined();
  });

  // R2-B: entries may carry `error` (failed cases) and `commit` (recording commit) —
  // stamped onto the node as lastError / runCommit so the viewer can show them.
  const v2errResults = JSON.stringify({
    generatedAt: "2026-07-06T08:00:00Z", commit: "aaaa111",
    results: { "hv-1": { status: "fail", attempts: 2, at: "2026-07-06T08:00:00Z", error: "Error: expect(locator).toBeVisible() failed", commit: "9f8e7d6" } },
  });

  it("stamps lastError and runCommit from the entry's error/commit fields", () => {
    const g = applyResults(graph, v2errResults);
    const n = g.nodes.find((n: any) => n.id === "frontend:hv-1");
    expect(n.status).toBe("fail");
    expect(n.lastError).toBe("Error: expect(locator).toBeVisible() failed");
    expect(n.runCommit).toBe("9f8e7d6");
    expect(n.flaky).toBeUndefined(); // fail + retries is not flaky (flaky = pass on retry)
  });

  it("leaves lastError/runCommit absent when the entry predates the fields", () => {
    const g = applyResults(graph, v2results); // v2 entry without error/commit
    const n = g.nodes.find((n: any) => n.id === "frontend:hv-1");
    expect(n.lastError).toBeUndefined();
    expect(n.runCommit).toBeUndefined();
    const v1n = applyResults(graph, results).nodes.find((n: any) => n.id === "frontend:hv-1");
    expect((v1n as any).lastError).toBeUndefined();
    expect((v1n as any).runCommit).toBeUndefined();
  });

  // F2b: entries may carry an AI-authored `suggestedFix` (+ provenance) — stamped onto the
  // node verbatim so the viewer can render it (esc()'d) for a failing case.
  const v2fixResults = JSON.stringify({
    generatedAt: "2026-07-07T09:00:00Z", commit: "bbbb222",
    results: { "hv-1": { status: "fail", attempts: 1, at: "2026-07-07T09:00:00Z",
      error: "Error: expect(locator).toBeVisible() failed",
      suggestedFix: "Wait for the versions query to settle before asserting the badge — the assertion races the React Query refetch.",
      suggestedFixAt: "2026-07-07T09:05:00Z", suggestedFixBy: "kg-e2e" } },
  });

  it("carries suggestedFix from the entry onto the node (2b)", () => {
    const n = applyResults(graph, v2fixResults).nodes.find((n: any) => n.id === "frontend:hv-1");
    expect(n.status).toBe("fail");
    expect((n as any).suggestedFix).toBe("Wait for the versions query to settle before asserting the badge — the assertion races the React Query refetch.");
  });

  it("leaves suggestedFix absent when the entry has none", () => {
    const n = applyResults(graph, v2errResults).nodes.find((n: any) => n.id === "frontend:hv-1");
    expect((n as any).suggestedFix).toBeUndefined();
  });
});
