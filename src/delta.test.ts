// covers: REQ-KG-VIEW-02
import { describe, it, expect } from "vitest";
import { computeDelta, formatDelta } from "./delta";

const mk = (nodes: any[], issues: any[] = []) => ({ generatedAt: "T", nodes, edges: [], issues } as any);
const oldG = mk(
  [
    { id: "backend:req-bil-01", type: "requirement", title: "R1" },
    { id: "frontend:bil-1", type: "test", title: "BIL-1", status: "pass" },
    { id: "frontend:bil-4", type: "test", title: "BIL-4", status: "pass" },
    { id: "backend:gone", type: "doc", title: "Gone" },
  ],
  [{ kind: "orphan-doc", node: "backend:gone", detail: "" }, { kind: "orphan-doc", node: "backend:x", detail: "" }]
);
const newG = mk(
  [
    { id: "backend:req-bil-01", type: "requirement", title: "R1" },
    { id: "backend:req-bil-02", type: "requirement", title: "R2" },
    { id: "frontend:bil-1", type: "test", title: "BIL-1", status: "pass" },
    { id: "frontend:bil-4", type: "test", title: "BIL-4", status: "fail" },
  ],
  [{ kind: "orphan-doc", node: "backend:x", detail: "" }]
);

describe("computeDelta", () => {
  const d = computeDelta(oldG, newG)!;
  it("groups added/removed nodes by type", () => {
    expect(d.added).toEqual([{ type: "requirement", ids: ["backend:req-bil-02"] }]);
    expect(d.removed).toEqual([{ type: "doc", ids: ["backend:gone"] }]);
  });
  it("detects status transitions on shared test ids", () => {
    expect(d.newlyFailing).toEqual(["frontend:bil-4"]);
    expect(d.newlyPassing).toEqual([]);
  });
  it("reports only issue kinds whose count changed", () => {
    expect(d.issueDeltas).toEqual([{ kind: "orphan-doc", before: 2, after: 1 }]);
  });
  it("returns null with no previous graph", () => {
    expect(computeDelta(null, newG)).toBeNull();
  });
});

describe("formatDelta", () => {
  it("renders human lines and a first-sync message for null", () => {
    const lines = formatDelta(computeDelta(oldG, newG));
    expect(lines.some((l) => l.includes("+1 requirement"))).toBe(true);
    expect(lines.some((l) => l.includes("newly failing") && l.includes("bil-4"))).toBe(true);
    expect(lines.some((l) => l.includes("orphan-doc 2 → 1"))).toBe(true);
    expect(formatDelta(null)).toEqual(["first sync — no previous graph to compare against"]);
  });
});
