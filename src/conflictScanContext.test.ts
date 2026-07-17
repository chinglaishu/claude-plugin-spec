import { describe, it, expect } from "vitest";
import { conflictScanContext } from "./conflictScanContext";
import type { Graph, GraphNode, GraphEdge } from "./types";

const doc = (id: string, body: string): GraphNode => ({ id, type: "doc", title: id, path: `${id}.md`, body });
const req = (id: string, text: string): GraphNode => ({ id, type: "requirement", title: id, text });
const test = (id: string, source: string): GraphNode => ({ id, type: "test", title: id, source });
const edge = (from: string, to: string, type: GraphEdge["type"]): GraphEdge => ({ from, to, type, source: "x" });
const graph = (nodes: GraphNode[], edges: GraphEdge[]): Graph => ({ generatedAt: "", nodes, edges, issues: [] });

describe("conflictScanContext", () => {
  it("bundles both doc bodies for a doc-doc pair", () => {
    const g = graph([doc("main:a", "A body"), doc("main:b", "B body")], [edge("main:a", "main:b", "references")]);
    const [item] = conflictScanContext(g, [{ kind: "doc-doc", a: "main:a", b: "main:b" }]);
    expect(item.a).toMatchObject({ kind: "doc", ref: "main:a", text: "A body" });
    expect(item.b).toMatchObject({ kind: "doc", ref: "main:b", text: "B body" });
  });
  it("recovers doc/code roles for a doc-code pair regardless of a/b order", () => {
    const g = graph([doc("main:a", "claims X")], [edge("main:a", "services/x/", "governs")]);
    // a/b are sorted alphabetically → "main:a" > "services/x/"? compare: 'm' < 's' so a="main:a"
    const [item] = conflictScanContext(g, [{ kind: "doc-code", a: "main:a", b: "services/x/" }]);
    const docSide = [item.a, item.b].find((s) => s.kind === "doc")!;
    const codeSide = [item.a, item.b].find((s) => s.kind === "code")!;
    expect(docSide).toMatchObject({ ref: "main:a", text: "claims X" });
    expect(codeSide).toMatchObject({ ref: "services/x/", path: "services/x/" });
  });
  it("bundles requirement text and test source for a req-test pair", () => {
    const g = graph([req("REQ-1", "must hold"), test("T-1", "expect(x).toBe(1)")], [edge("T-1", "REQ-1", "covers")]);
    const [item] = conflictScanContext(g, [{ kind: "req-test", a: "REQ-1", b: "T-1" }]);
    const reqSide = [item.a, item.b].find((s) => s.kind === "req")!;
    const testSide = [item.a, item.b].find((s) => s.kind === "test")!;
    expect(reqSide).toMatchObject({ ref: "REQ-1", text: "must hold" });
    expect(testSide).toMatchObject({ ref: "T-1", text: "expect(x).toBe(1)" });
  });
});
