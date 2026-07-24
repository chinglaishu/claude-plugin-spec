// covers: REQ-KG-EVID-03, REQ-KG-EVID-04, REQ-KG-05
import { describe, it, expect } from "vitest";
import { applyEvidence } from "./applyEvidence";

const graph = {
  generatedAt: "T",
  nodes: [
    { id: "frontend:add-3", type: "test", kind: "e2e", title: "Add 3" },
    { id: "frontend:bil-1", type: "test", kind: "e2e", title: "BIL-1" },
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
    expect(g.nodes.find((n: any) => n.id === "frontend:bil-1").evidence).toBeUndefined();
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

/**
 * REQ-KG-05's NEGATIVE clause — screenshot binaries never enter the committed graph.
 *
 * This was the one requirement left uncovered by the 2026-07-24 backfill, and deliberately so: the
 * upload path proved the positive half thoroughly while nothing asserted the negative, and a
 * `covers:` edge over an unproven clause is the exact failure §10.2 records. Enforcing it is what
 * closes the gap — a test alone would only have described the hole.
 *
 * The graph is a pure function of the tree and is committed on every build. An inline `data:` image
 * would put megabytes of base64 into `knowledge-graph.json`, and — worse than size — it would put
 * the *content* of a screenshot into version control, which is precisely what storing evidence out
 * of band exists to prevent.
 */
describe("evidence carries references, never binaries (REQ-KG-05)", () => {
  const g = { generatedAt: "T", nodes: [{ id: "main:checkout", type: "test", kind: "e2e" }], edges: [], issues: [] } as any;
  const idx = (shots: Record<string, string>) =>
    JSON.stringify({ branch: "b", updatedAt: "T", cases: { checkout: { sha: "abc", shots } } });

  it("keeps ordinary URL references", () => {
    const out = applyEvidence(g, idx({ "01-start.png": "https://blobs.example.com/kg/checkout/01-start.png" }));
    expect(out.nodes[0].evidence).toEqual({ "01-start.png": "https://blobs.example.com/kg/checkout/01-start.png" });
  });

  it("drops an inline data: image so it can never reach knowledge-graph.json", () => {
    const out = applyEvidence(g, idx({ "01-start.png": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" }));
    expect(out.nodes[0].evidence).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("base64");
  });

  it("keeps the good references and drops only the binary one", () => {
    const out = applyEvidence(
      g,
      idx({ "01.png": "https://blobs.example.com/a.png", "02.png": "data:image/png;base64,AAAA" }),
    );
    expect(out.nodes[0].evidence).toEqual({ "01.png": "https://blobs.example.com/a.png" });
  });
});
