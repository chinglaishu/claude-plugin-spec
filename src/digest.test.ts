// covers: REQ-KG-VIEW-03
import { describe, it, expect } from "vitest";
import { renderDigest } from "./digest";
import { healthForGraph } from "./summarize";

const g = {
  generatedAt: "T",
  nodes: [
    { id: "frontend:bil.versions", type: "feature", title: "Version management", flow: "bil" },
    { id: "frontend:bil.covenant", type: "feature", title: "Covenant terms", flow: "bil" },
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
    { from: "frontend:bil.versions", to: "backend:req-bil-01", type: "specifies", source: "" },
    { from: "frontend:bil.versions", to: "backend:req-bil-02", type: "specifies", source: "" },
    { from: "frontend:bil.versions", to: "backend:req-bil-03", type: "specifies", source: "" },
    { from: "frontend:bil-1", to: "backend:req-bil-01", type: "covers", source: "" },
  ],
  issues: [],
} as any;
g.health = healthForGraph(g);
g.lastRun = { at: "2026-07-03T00:00:00Z", commit: "abc" };

describe("renderDigest", () => {
  const files = renderDigest(g);
  it("emits an index plus one file per flow", () => {
    expect(Object.keys(files).sort()).toEqual(["bil.md", "index.md"]);
  });
  it("flow file lists requirements with proof status and gaps", () => {
    const bil = files["bil.md"];
    expect(bil).toContain("# bil — knowledge digest");   // the project's own flow key, not a tool-supplied name
    expect(bil).toContain("REQ-BIL-01: Published pins are immutable.");
    expect(bil).toContain("Proven by: BIL-1");
    expect(bil).toContain("⚠ NO COVERING TEST");        // req-bil-02
    expect(bil).toContain("Failing now: BIL-4");
    expect(bil).toContain("Flaky: BIL-5");
    expect(bil).toContain("Untested capabilities: Covenant terms");
  });
  it("counts a provenBy-only requirement as proven, not as a covering-test warning", () => {
    const bil = files["bil.md"];
    expect(bil).toContain("REQ-BIL-03: Comparisons stay stable.");
    expect(bil).toContain("Proven by: BIL-5");
    expect(bil).toContain("promises: 3 (proven 2)");
    // req-bil-03's own warning must not appear; only req-bil-02's warning should remain
    const warnCount = (bil.match(/⚠ NO COVERING TEST/g) ?? []).length;
    expect(warnCount).toBe(1);
  });
  it("index carries timestamps and per-flow one-liners", () => {
    expect(files["index.md"]).toContain("results 2026-07-03");
    expect(files["index.md"]).toContain("bil");
    expect(files["index.md"]).toContain("bil.md");
  });
});
