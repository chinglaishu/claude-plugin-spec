// recordRun's pure pieces, fed a FABRICATED Playwright JSON report (with screenshot
// attachments) + a graph fixture. Proves:
//   (i)   kg-test-results.json entries update with status + error (via parsePlaywrightJson + merge);
//   (ii)  each test's screenshot attachment resolves to the .step-shots/<dirId>/<dirId>-result.png copy;
//   (iii) title→case resolution keys results LOWERCASE (applyResults lookup) but the shot dir keeps
//         the ORIGINAL bare id, and UNMAPPED tests (auth setup) are skipped entirely.
import { describe, it, expect } from "vitest";
import { caseTitleMap, resolveResultShots, type ResultShot } from "./recordRun";
import { parsePlaywrightJson } from "./parsePlaywrightReport";
import type { Graph } from "./types";

const graph = {
  generatedAt: "T",
  nodes: [
    { id: "frontend:ADD-4", type: "test", title: "ADD-4", kind: "e2e", spec: "onboarding-scenarios.spec.ts", playwrightTitle: "a wizard draft persists and can be resumed" },
    { id: "frontend:UW-8", type: "test", title: "UW-8", kind: "e2e", spec: "underwrite.spec.ts", playwrightTitle: "UW-8 reverse yield" },
    { id: "frontend:BIL-1", type: "test", title: "BIL-1", kind: "unit-fe" }, // not e2e → not in map
  ],
  edges: [], issues: [],
} as unknown as Graph;

// Fabricated Playwright JSON report: one passing e2e with a screenshot, one failing e2e with
// two attempts (last attempt's shot must win), plus an auth-setup spec that maps to NO case.
const report = JSON.stringify({
  suites: [
    { title: "onboarding-scenarios.spec.ts", specs: [
      { title: "a wizard draft persists and can be resumed", ok: true, tests: [{ results: [
        { status: "passed", attachments: [{ name: "screenshot", contentType: "image/png", path: "/tmp/pw/add4/test-finished-1.png" }] },
      ] }] },
    ] },
    { title: "underwrite.spec.ts", specs: [
      { title: "UW-8 reverse yield", ok: false, tests: [{ results: [
        { status: "failed", errors: [{ message: "Error: expect(locator).toBeVisible() failed" }], attachments: [{ name: "screenshot", contentType: "image/png", path: "/tmp/pw/uw8/attempt-0.png" }] },
        { status: "failed", errors: [{ message: "retry error" }], attachments: [{ name: "screenshot", contentType: "image/png", path: "/tmp/pw/uw8/attempt-1.png" }] },
      ] }] },
    ] },
    { title: "auth.setup.ts", specs: [
      { title: "authenticate via Supabase email + password", ok: true, tests: [{ results: [
        { status: "passed", attachments: [{ name: "screenshot", contentType: "image/png", path: "/tmp/pw/setup/x.png" }] },
      ] }] },
    ] },
  ],
});

describe("caseTitleMap", () => {
  const map = caseTitleMap(graph);
  it("maps each e2e playwrightTitle to its lowercase caseId + original-cased dirId", () => {
    expect(map.get("a wizard draft persists and can be resumed")).toEqual({ caseId: "add-4", dirId: "ADD-4" });
    expect(map.get("UW-8 reverse yield")).toEqual({ caseId: "uw-8", dirId: "UW-8" });
  });
  it("excludes non-e2e tests and titles with no playwrightTitle", () => {
    expect(map.size).toBe(2);
  });
});

describe("resolveResultShots", () => {
  const map = caseTitleMap(graph);
  const shots = resolveResultShots(report, map);
  const byDir = (id: string) => shots.find((s: ResultShot) => s.dirId === id);

  it("resolves a screenshot for each mapped case", () => {
    expect(shots.length).toBe(2);
  });
  it("copies to .step-shots/<dirId>/<dirId>-result.png with the ORIGINAL bare id", () => {
    expect(byDir("ADD-4")).toEqual({ dirId: "ADD-4", srcPath: "/tmp/pw/add4/test-finished-1.png", destName: "ADD-4-result.png" });
  });
  it("prefers the LAST (failure/final) attempt's screenshot for a retried failing case", () => {
    expect(byDir("UW-8")!.srcPath).toBe("/tmp/pw/uw8/attempt-1.png");
  });
  it("skips the unmapped auth-setup spec entirely (no shot for it)", () => {
    expect(shots.some((s) => s.srcPath.includes("/setup/"))).toBe(false);
  });
});

// Integration-ish pin: the SAME report drives parsePlaywrightJson (results) keyed by lowercase
// caseId, proving recordRun's two halves agree on casing.
describe("recordRun results half stays consistent with the shot half", () => {
  const map = caseTitleMap(graph);
  const titles = new Map([...map.entries()].map(([t, v]) => [t, v.caseId]));
  const results = parsePlaywrightJson(report, titles);
  it("records status + error for failing case, keyed lowercase", () => {
    expect(results["uw-8"].status).toBe("fail");
    expect(results["uw-8"].error).toContain("expect(locator).toBeVisible() failed");
    expect(results["add-4"].status).toBe("pass");
  });
  it("does not record the unmapped auth-setup spec", () => {
    expect(Object.keys(results).sort()).toEqual(["add-4", "uw-8"]);
  });
});
