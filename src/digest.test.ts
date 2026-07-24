// covers: REQ-KG-VIEW-03
import { describe, it, expect } from "vitest";
import { renderDigest } from "./digest";
import { healthForGraph } from "./summarize";

const g = {
  generatedAt: "T",
  nodes: [
    { id: "frontend:hv.versions", type: "feature", title: "Version management", flow: "hv" },
    { id: "frontend:hv.covenant", type: "feature", title: "Covenant terms", flow: "hv" },
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
    { from: "frontend:hv.versions", to: "backend:req-hv-01", type: "specifies", source: "" },
    { from: "frontend:hv.versions", to: "backend:req-hv-02", type: "specifies", source: "" },
    { from: "frontend:hv.versions", to: "backend:req-hv-03", type: "specifies", source: "" },
    { from: "frontend:hv-1", to: "backend:req-hv-01", type: "covers", source: "" },
  ],
  issues: [],
} as any;
g.health = healthForGraph(g);
g.lastRun = { at: "2026-07-03T00:00:00Z", commit: "abc" };

describe("renderDigest", () => {
  const files = renderDigest(g);
  it("emits an index plus one file per flow", () => {
    expect(Object.keys(files).sort()).toEqual(["hv.md", "index.md"]);
  });
  it("flow file lists requirements with proof status and gaps", () => {
    const hv = files["hv.md"];
    expect(hv).toContain("# House View — knowledge digest");
    expect(hv).toContain("REQ-HV-01: Published pins are immutable.");
    expect(hv).toContain("Proven by: HV-1");
    expect(hv).toContain("⚠ NO COVERING TEST");        // req-hv-02
    expect(hv).toContain("Failing now: HV-4");
    expect(hv).toContain("Flaky: HV-5");
    expect(hv).toContain("Untested capabilities: Covenant terms");
  });
  it("counts a provenBy-only requirement as proven, not as a covering-test warning", () => {
    const hv = files["hv.md"];
    expect(hv).toContain("REQ-HV-03: Comparisons stay stable.");
    expect(hv).toContain("Proven by: HV-5");
    expect(hv).toContain("promises: 3 (proven 2)");
    // req-hv-03's own warning must not appear; only req-hv-02's warning should remain
    const warnCount = (hv.match(/⚠ NO COVERING TEST/g) ?? []).length;
    expect(warnCount).toBe(1);
  });
  it("index carries timestamps and per-flow one-liners", () => {
    expect(files["index.md"]).toContain("results 2026-07-03");
    expect(files["index.md"]).toContain("House View");
    expect(files["index.md"]).toContain("hv.md");
  });
});
