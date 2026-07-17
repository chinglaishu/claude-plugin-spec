import { describe, it, expect } from "vitest";
import { detectUntrackedE2e } from "./untrackedE2e";
import type { Graph, GraphNode, GraphEdge } from "./types";

/** Minimal fixture: assemble a Graph from raw nodes/edges. */
const graph = (nodes: GraphNode[], edges: GraphEdge[]): Graph => ({
  generatedAt: "2026-07-03T00:00:00Z",
  nodes,
  edges,
  issues: [],
});

const testNode = (id: string, spec: string): GraphNode => ({
  id,
  type: "test",
  title: id,
  kind: "e2e",
  spec,
});

describe("detectUntrackedE2e", () => {
  it("returns nothing when every spec has a case entry with at least one link", () => {
    const g = graph(
      [testNode("HV-1", "house-view-cascade.spec.ts")],
      [{ from: "HV-1", to: "house-view-freeze", type: "verifies", source: "x" }],
    );
    expect(detectUntrackedE2e(["e2e/house-view-cascade.spec.ts"], g)).toEqual([]);
  });

  it("flags a spec file with no matching case entry at all", () => {
    const g = graph([], []);
    const issues = detectUntrackedE2e(["e2e/orphan.spec.ts"], g);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: "untracked-e2e",
      detail: expect.stringContaining("orphan.spec.ts"),
    });
  });

  it("flags a case entry that exists but carries no verifies/covers/features", () => {
    // A bare test node — a case entry with only id/title/spec, no links.
    const g = graph([testNode("BARE-1", "bare.spec.ts")], []);
    const issues = detectUntrackedE2e(["e2e/bare.spec.ts"], g);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: "untracked-e2e",
      detail: expect.stringContaining("case entry exists but has no verifies/covers/features link"),
    });
  });

  it("accepts any of verifies, covers, or tags as a qualifying link", () => {
    const g1 = graph([testNode("T-1", "s1.spec.ts")], [{ from: "T-1", to: "REQ-X", type: "covers", source: "x" }]);
    const g2 = graph([testNode("T-2", "s2.spec.ts")], [{ from: "T-2", to: "add.mapping", type: "tags", source: "x" }]);
    expect(detectUntrackedE2e(["e2e/s1.spec.ts"], g1)).toEqual([]);
    expect(detectUntrackedE2e(["e2e/s2.spec.ts"], g2)).toEqual([]);
  });

  it("ignores non-test nodes and unit tests entirely", () => {
    const unit: GraphNode = { id: "u1", type: "test", title: "u", kind: "unit-fe" };
    const g = graph([unit], []);
    // No e2e nodes → any e2e spec file should show as untracked.
    expect(detectUntrackedE2e(["e2e/x.spec.ts"], g)).toHaveLength(1);
  });

  it("matches spec paths regardless of directory prefix (case entry `spec:` is a bare filename)", () => {
    // Case entries record `spec: house-view-cascade.spec.ts` (bare), while the
    // discovered file list gives us the full relative path.
    const g = graph(
      [testNode("HV-1", "house-view-cascade.spec.ts")],
      [{ from: "HV-1", to: "d", type: "verifies", source: "x" }],
    );
    expect(detectUntrackedE2e(["svc_frontend/e2e/house-view-cascade.spec.ts"], g)).toEqual([]);
  });
});
