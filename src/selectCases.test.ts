import { describe, it, expect } from "vitest";
import { casesForScope } from "./selectCases";
const g = {
  generatedAt: "T",
  nodes: [
    { id: "frontend:hv.versions", type: "feature", title: "V", flow: "hv" },
    { id: "frontend:add.step1", type: "feature", title: "S", flow: "add" },
    { id: "frontend:hv-1", type: "test", kind: "e2e", title: "HV-1", spec: "house-view.spec.ts", playwrightTitle: "hv one" },
    { id: "frontend:au-1", type: "test", kind: "e2e", title: "AU-1", spec: "auth-guard.spec.ts", playwrightTitle: "au one" },
    { id: "frontend:uw-1", type: "test", kind: "e2e", title: "UW-1", spec: "uw.spec.ts" }, // no playwrightTitle → not runnable
  ],
  edges: [
    { from: "frontend:hv-1", to: "frontend:hv.versions", type: "tags", source: "" },
    { from: "frontend:au-1", to: "frontend:add.step1", type: "tags", source: "" },
  ],
  issues: [],
} as any;

describe("casesForScope", () => {
  it("returns all runnable e2e cases with bare ids when unscoped", () => {
    expect(casesForScope(g).map((c) => c.caseId).sort()).toEqual(["au-1", "hv-1"]);
  });
  it("filters by flow via tags edges", () => {
    expect(casesForScope(g, "hv")).toEqual([{ caseId: "hv-1", spec: "house-view.spec.ts", playwrightTitle: "hv one" }]);
  });
  it("filters by explicit case ids, case-insensitively", () => {
    expect(casesForScope(g, undefined, ["HV-1"]).map((c) => c.caseId)).toEqual(["hv-1"]);
  });
});
