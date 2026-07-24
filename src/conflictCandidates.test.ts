// covers: REQ-KG-CONF-02
import { describe, it, expect } from "vitest";
import { enumerateCandidates } from "./conflictCandidates";
import type { Graph, GraphNode, GraphEdge } from "./types";

const doc = (id: string, domain?: string): GraphNode => ({ id, type: "doc", title: id, domain });
const req = (id: string): GraphNode => ({ id, type: "requirement", title: id });
const test = (id: string): GraphNode => ({ id, type: "test", title: id });
const edge = (from: string, to: string, type: GraphEdge["type"]): GraphEdge => ({ from, to, type, source: "x" });
const graph = (nodes: GraphNode[], edges: GraphEdge[]): Graph => ({ generatedAt: "", nodes, edges, issues: [] });

describe("enumerateCandidates", () => {
  it("pairs docs linked by a references edge (doc-doc)", () => {
    const g = graph([doc("main:a", "pfl"), doc("main:b", "pfl")], [edge("main:a", "main:b", "references")]);
    expect(enumerateCandidates(g)).toContainEqual({ kind: "doc-doc", a: "main:a", b: "main:b" });
  });
  it("pairs a doc with the code path it governs (doc-code)", () => {
    const g = graph([doc("main:a")], [edge("main:a", "services/x/", "governs")]);
    expect(enumerateCandidates(g)).toContainEqual({ kind: "doc-code", a: "main:a", b: "services/x/" });
  });
  it("pairs a requirement with the test that covers it (req-test)", () => {
    const g = graph([req("REQ-1"), test("T-1")], [edge("T-1", "REQ-1", "covers")]);
    expect(enumerateCandidates(g)).toContainEqual({ kind: "req-test", a: "REQ-1", b: "T-1" });
  });
  it("never emits a pair for two nodes with no connecting edge (no free-hunting)", () => {
    const g = graph([doc("main:a", "pfl"), doc("main:b", "pfl")], []);
    expect(enumerateCandidates(g)).toEqual([]);
  });
  it("dedupes reciprocal references into one unordered pair, sorted", () => {
    const g = graph(
      [doc("main:b", "pfl"), doc("main:a", "pfl")],
      [edge("main:b", "main:a", "references"), edge("main:a", "main:b", "references")],
    );
    expect(enumerateCandidates(g)).toEqual([{ kind: "doc-doc", a: "main:a", b: "main:b" }]);
  });
  it("filters doc-anchored pairs to the requested scope (by doc domain)", () => {
    const g = graph(
      [doc("main:a", "pfl"), doc("main:b", "pfl"), doc("main:c", "hv"), doc("main:d", "hv")],
      [edge("main:a", "main:b", "references"), edge("main:c", "main:d", "references")],
    );
    expect(enumerateCandidates(g, "pfl")).toEqual([{ kind: "doc-doc", a: "main:a", b: "main:b" }]);
  });
});
