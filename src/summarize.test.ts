// covers: REQ-KG-CORE-05, REQ-KG-VIEW-04
import { describe, it, expect } from "vitest";
import { healthForGraph, provingTestsOf, reqFlowOf, KIND_LABELS, FLOW_LABELS } from "./summarize";

const g = {
  generatedAt: "T",
  nodes: [
    { id: "frontend:bil.versions", type: "feature", title: "Version management", flow: "bil" },
    { id: "frontend:bil.covenant", type: "feature", title: "Covenant terms", flow: "bil" },
    { id: "frontend:add.upload", type: "feature", title: "Document upload", flow: "add" },
    { id: "backend:req-bil-01", type: "requirement", title: "REQ-BIL-01", text: "Published pins are immutable." },
    { id: "backend:req-bil-02", type: "requirement", title: "REQ-BIL-02", text: "Drafts never resolve." },
    { id: "backend:req-bil-03", type: "requirement", title: "REQ-BIL-03", text: "Comparisons stay stable.", provenBy: ["bil-5"] },
    { id: "frontend:bil-1", type: "test", kind: "e2e", title: "BIL-1", status: "pass", runAt: "2026-07-01T00:00:00Z" },
    { id: "frontend:bil-4", type: "test", kind: "e2e", title: "BIL-4", status: "fail", runAt: "2026-07-03T00:00:00Z" },
    { id: "frontend:bil-5", type: "test", kind: "e2e", title: "BIL-5", status: "pass", attempts: 2, flaky: true, runAt: "2026-07-02T00:00:00Z" },
  ],
  edges: [
    { from: "frontend:bil-1", to: "frontend:bil.versions", type: "tags", source: "" },
    { from: "frontend:bil-4", to: "frontend:bil.versions", type: "tags", source: "" },
    { from: "frontend:bil-5", to: "frontend:bil.versions", type: "tags", source: "" },
    { from: "frontend:bil-4", to: "frontend:add.upload", type: "tags", source: "" },
    { from: "frontend:bil.versions", to: "backend:req-bil-01", type: "specifies", source: "" },
    { from: "frontend:bil.versions", to: "backend:req-bil-02", type: "specifies", source: "" },
    { from: "frontend:bil.versions", to: "backend:req-bil-03", type: "specifies", source: "" },
    { from: "frontend:bil-1", to: "backend:req-bil-01", type: "covers", source: "" },
  ],
  issues: [],
} as any;

describe("healthForGraph", () => {
  const h = healthForGraph(g);
  const bil = h.flows.find((f) => f.flow === "bil")!;
  it("labels the flow and counts capabilities/tested", () => {
    // A flow renders under the key the PROJECT declared in its own *.features.yaml. The tool used to
    // carry a table of one particular project's product surfaces and label everyone's flows from it.
    expect(bil.label).toBe("bil");
    expect(bil.capabilities).toBe(2);
    expect(bil.tested).toBe(1);
    expect(bil.untested).toEqual(["Covenant terms"]);   // labels, not ids
  });
  it("lists failing and flaky tests by title", () => {
    expect(bil.failing).toEqual([{ id: "frontend:bil-4", title: "BIL-4" }]);
    expect(bil.flaky).toEqual([{ id: "frontend:bil-5", title: "BIL-5" }]);
  });
  it("counts requirement proof and names unproven promise texts", () => {
    expect(bil.reqTotal).toBe(3);
    expect(bil.reqProven).toBe(2);
    expect(bil.unproven).toEqual(["Drafts never resolve."]);
  });
  it("lastVerified = OLDEST runAt among the flow's tagged e2e tests", () => {
    expect(bil.lastVerified).toBe("2026-07-01T00:00:00Z");
  });
  it("totals roll up across flows", () => {
    expect(h.totals).toEqual({ features: 3, tested: 2, reqTotal: 3, reqProven: 2, failing: 1, flaky: 1 });
  });
  it("dedupes a test tagged into features of two different flows so totals count it once", () => {
    // bil-4 (status fail) is tagged to both bil.versions (flow bil) and add.upload (flow add)
    const add = h.flows.find((f) => f.flow === "add")!;
    expect(bil.failing.map((t) => t.id)).toContain("frontend:bil-4");
    expect(add.failing.map((t) => t.id)).toContain("frontend:bil-4");
    expect(h.totals.failing).toBe(1);
  });
});

describe("provingTestsOf", () => {
  it("includes covers-edge tests and provenBy-resolved tests (bare-id, case-insensitive), deduped and sorted by id", () => {
    const m = provingTestsOf(g);
    expect(m.get("backend:req-bil-01")!.map((t) => t.id)).toEqual(["frontend:bil-1"]);
    expect(m.get("backend:req-bil-02")).toBeUndefined();
    expect(m.get("backend:req-bil-03")!.map((t) => t.id)).toEqual(["frontend:bil-5"]);
  });
});

describe("reqFlowOf", () => {
  it("maps a requirement id to the specifying feature's flow, else other", () => {
    const m = reqFlowOf(g);
    expect(m.get("backend:req-bil-01")).toBe("bil");
    expect(m.get("backend:req-bil-03")).toBe("bil");
  });
});

describe("labels", () => {
  it("translates every ratchet kind to a human phrase", () => {
    for (const k of ["uncovered-requirement", "unverified-doc", "orphan-doc", "untracked-e2e", "broken-link", "ambiguous-link", "duplicate-id"])
      expect(KIND_LABELS[k], k).toBeTruthy();
    // Issue kinds are the TOOL's vocabulary, so it names them. Flows are the PROJECT's, so it does not:
    // `other` is the tool's own bucket for features declaring no flow, and is the only entry left.
    expect(Object.keys(FLOW_LABELS)).toEqual(["other"]);
  });
});
