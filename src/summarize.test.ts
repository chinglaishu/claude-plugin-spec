// covers: REQ-KG-CORE-05, REQ-KG-VIEW-04
import { describe, it, expect } from "vitest";
import { healthForGraph, provingTestsOf, reqFlowOf, KIND_LABELS, FLOW_LABELS } from "./summarize";

const g = {
  generatedAt: "T",
  nodes: [
    { id: "frontend:hv.versions", type: "feature", title: "Version management", flow: "hv" },
    { id: "frontend:hv.covenant", type: "feature", title: "Covenant terms", flow: "hv" },
    { id: "frontend:add.upload", type: "feature", title: "Document upload", flow: "add" },
    { id: "backend:req-hv-01", type: "requirement", title: "REQ-HV-01", text: "Published pins are immutable." },
    { id: "backend:req-hv-02", type: "requirement", title: "REQ-HV-02", text: "Drafts never resolve." },
    { id: "backend:req-hv-03", type: "requirement", title: "REQ-HV-03", text: "Comparisons stay stable.", provenBy: ["hv-5"] },
    { id: "frontend:hv-1", type: "test", kind: "e2e", title: "HV-1", status: "pass", runAt: "2026-07-01T00:00:00Z" },
    { id: "frontend:hv-4", type: "test", kind: "e2e", title: "HV-4", status: "fail", runAt: "2026-07-03T00:00:00Z" },
    { id: "frontend:hv-5", type: "test", kind: "e2e", title: "HV-5", status: "pass", attempts: 2, flaky: true, runAt: "2026-07-02T00:00:00Z" },
  ],
  edges: [
    { from: "frontend:hv-1", to: "frontend:hv.versions", type: "tags", source: "" },
    { from: "frontend:hv-4", to: "frontend:hv.versions", type: "tags", source: "" },
    { from: "frontend:hv-5", to: "frontend:hv.versions", type: "tags", source: "" },
    { from: "frontend:hv-4", to: "frontend:add.upload", type: "tags", source: "" },
    { from: "frontend:hv.versions", to: "backend:req-hv-01", type: "specifies", source: "" },
    { from: "frontend:hv.versions", to: "backend:req-hv-02", type: "specifies", source: "" },
    { from: "frontend:hv.versions", to: "backend:req-hv-03", type: "specifies", source: "" },
    { from: "frontend:hv-1", to: "backend:req-hv-01", type: "covers", source: "" },
  ],
  issues: [],
} as any;

describe("healthForGraph", () => {
  const h = healthForGraph(g);
  const hv = h.flows.find((f) => f.flow === "hv")!;
  it("labels the flow and counts capabilities/tested", () => {
    expect(hv.label).toBe("House View");
    expect(hv.capabilities).toBe(2);
    expect(hv.tested).toBe(1);
    expect(hv.untested).toEqual(["Covenant terms"]);   // labels, not ids
  });
  it("lists failing and flaky tests by title", () => {
    expect(hv.failing).toEqual([{ id: "frontend:hv-4", title: "HV-4" }]);
    expect(hv.flaky).toEqual([{ id: "frontend:hv-5", title: "HV-5" }]);
  });
  it("counts requirement proof and names unproven promise texts", () => {
    expect(hv.reqTotal).toBe(3);
    expect(hv.reqProven).toBe(2);
    expect(hv.unproven).toEqual(["Drafts never resolve."]);
  });
  it("lastVerified = OLDEST runAt among the flow's tagged e2e tests", () => {
    expect(hv.lastVerified).toBe("2026-07-01T00:00:00Z");
  });
  it("totals roll up across flows", () => {
    expect(h.totals).toEqual({ features: 3, tested: 2, reqTotal: 3, reqProven: 2, failing: 1, flaky: 1 });
  });
  it("dedupes a test tagged into features of two different flows so totals count it once", () => {
    // hv-4 (status fail) is tagged to both hv.versions (flow hv) and add.upload (flow add)
    const add = h.flows.find((f) => f.flow === "add")!;
    expect(hv.failing.map((t) => t.id)).toContain("frontend:hv-4");
    expect(add.failing.map((t) => t.id)).toContain("frontend:hv-4");
    expect(h.totals.failing).toBe(1);
  });
});

describe("provingTestsOf", () => {
  it("includes covers-edge tests and provenBy-resolved tests (bare-id, case-insensitive), deduped and sorted by id", () => {
    const m = provingTestsOf(g);
    expect(m.get("backend:req-hv-01")!.map((t) => t.id)).toEqual(["frontend:hv-1"]);
    expect(m.get("backend:req-hv-02")).toBeUndefined();
    expect(m.get("backend:req-hv-03")!.map((t) => t.id)).toEqual(["frontend:hv-5"]);
  });
});

describe("reqFlowOf", () => {
  it("maps a requirement id to the specifying feature's flow, else other", () => {
    const m = reqFlowOf(g);
    expect(m.get("backend:req-hv-01")).toBe("hv");
    expect(m.get("backend:req-hv-03")).toBe("hv");
  });
});

describe("labels", () => {
  it("translates every ratchet kind to a human phrase", () => {
    for (const k of ["uncovered-requirement", "unverified-doc", "orphan-doc", "untracked-e2e", "broken-link", "ambiguous-link", "duplicate-id"])
      expect(KIND_LABELS[k], k).toBeTruthy();
    expect(FLOW_LABELS.hv).toBe("House View");
  });
});
