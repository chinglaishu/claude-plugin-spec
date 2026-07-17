import { describe, it, expect } from "vitest";
import { applyEvidence } from "./applyEvidence";

const graph = {
  generatedAt: "T",
  nodes: [
    { id: "frontend:add-3", type: "test", kind: "e2e", title: "Add 3" },
    { id: "frontend:hv-1", type: "test", kind: "e2e", title: "HV-1" },
    { id: "frontend:some-unit.test.ts", type: "test", kind: "unit-fe", title: "some-unit.test.ts" },
    { id: "backend:x", type: "doc", title: "X" },
  ],
  edges: [], issues: [],
} as any;

const index = JSON.stringify({
  branch: "e2e-evidence",
  updatedAt: "2026-07-05T00:00:00Z",
  cases: {
    "add-3": {
      sha: "abc1234",
      shots: {
        "add3-1-rent-roll.png": "https://raw.githubusercontent.com/acme-org/svc_frontend/e2e-evidence/kg-cases/add-3/abc1234/01-add3-1-rent-roll.png",
      },
    },
  },
});

describe("applyEvidence", () => {
  it("attaches an evidence map onto the matching e2e test node (bare-id match)", () => {
    const g = applyEvidence(graph, index);
    const n = g.nodes.find((n: any) => n.id === "frontend:add-3");
    expect(n.evidence).toEqual({
      "add3-1-rent-roll.png": "https://raw.githubusercontent.com/acme-org/svc_frontend/e2e-evidence/kg-cases/add-3/abc1234/01-add3-1-rent-roll.png",
    });
  });

  it("leaves e2e nodes with no matching case entry untouched", () => {
    const g = applyEvidence(graph, index);
    expect(g.nodes.find((n: any) => n.id === "frontend:hv-1").evidence).toBeUndefined();
  });

  it("never attaches evidence to a non-e2e test node even if the bare id matched", () => {
    const withUnitMatch = JSON.parse(index);
    withUnitMatch.cases["some-unit.test.ts"] = { sha: "z", shots: { "x.png": "https://example.com/x.png" } };
    const g = applyEvidence(graph, JSON.stringify(withUnitMatch));
    expect(g.nodes.find((n: any) => n.id === "frontend:some-unit.test.ts").evidence).toBeUndefined();
  });

  it("is case-insensitive on the bare case id, matching the rest of the graph's bare-id convention", () => {
    const upper = JSON.parse(index);
    upper.cases["ADD-3"] = upper.cases["add-3"];
    delete upper.cases["add-3"];
    const g = applyEvidence(graph, JSON.stringify(upper));
    expect(g.nodes.find((n: any) => n.id === "frontend:add-3").evidence).toBeDefined();
  });

  it("returns the graph unchanged when there is no evidence index file", () => {
    const g = applyEvidence(graph, null);
    expect(g.nodes.find((n: any) => n.id === "frontend:add-3").evidence).toBeUndefined();
  });

  it("does not throw on a malformed/empty index and leaves the graph unchanged", () => {
    expect(applyEvidence(graph, "not json").nodes).toEqual(graph.nodes);
    expect(applyEvidence(graph, "{}").nodes).toEqual(graph.nodes);
  });

  it("is deterministic: same file content in, same graph out (freshness-check safe)", () => {
    const a = applyEvidence(graph, index);
    const b = applyEvidence(graph, index);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
