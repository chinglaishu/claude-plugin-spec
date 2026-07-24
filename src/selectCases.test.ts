import { describe, it, expect } from "vitest";
import { casesForScope } from "./selectCases";
const g = {
  generatedAt: "T",
  nodes: [
    { id: "frontend:bil.versions", type: "feature", title: "V", flow: "bil" },
    { id: "frontend:add.step1", type: "feature", title: "S", flow: "add" },
    { id: "frontend:bil-1", type: "test", kind: "e2e", title: "BIL-1", spec: "billing.spec.ts", playwrightTitle: "bil one" },
    { id: "frontend:au-1", type: "test", kind: "e2e", title: "AU-1", spec: "auth-guard.spec.ts", playwrightTitle: "au one" },
    { id: "frontend:uw-1", type: "test", kind: "e2e", title: "UW-1", spec: "uw.spec.ts" }, // no playwrightTitle → not runnable
  ],
  edges: [
    { from: "frontend:bil-1", to: "frontend:bil.versions", type: "tags", source: "" },
    { from: "frontend:au-1", to: "frontend:add.step1", type: "tags", source: "" },
  ],
  issues: [],
} as any;

describe("casesForScope", () => {
  it("returns all runnable e2e cases with bare ids when unscoped", () => {
    expect(casesForScope(g).map((c) => c.caseId).sort()).toEqual(["au-1", "bil-1"]);
  });
  it("filters by flow via tags edges", () => {
    expect(casesForScope(g, "bil")).toEqual([{ caseId: "bil-1", spec: "billing.spec.ts", playwrightTitle: "bil one" }]);
  });
  it("filters by explicit case ids, case-insensitively", () => {
    expect(casesForScope(g, undefined, ["BIL-1"]).map((c) => c.caseId)).toEqual(["bil-1"]);
  });
});
