// covers: REQ-KG-VIEW-01
import { describe, it, expect } from "vitest";
import { renderViewer } from "./viewer";

const TEMPLATE = `<html><script>var KG=/*__KG_DATA__*/{nodes:[],edges:[],issues:[]}/*__KG_END__*/;</script></html>`;
const GRAPH = { generatedAt: "T", nodes: [{ id: "backend:x", type: "doc", title: "X" }], edges: [], issues: [] } as any;

describe("renderViewer", () => {
  it("inlines the graph JSON at the marker", () => {
    const out = renderViewer(GRAPH, TEMPLATE);
    expect(out).toContain('"backend:x"');
    expect(out).not.toContain("/*__KG_DATA__*/");
  });
  it("is deterministic for the same graph", () => {
    expect(renderViewer(GRAPH, TEMPLATE)).toBe(renderViewer(GRAPH, TEMPLATE));
  });
  it("throws if the marker is missing", () => {
    expect(() => renderViewer(GRAPH, "<html>no marker</html>")).toThrow();
  });
  it("produces a parseable KG object (no double-object / invalid JS)", () => {
    const out = renderViewer(GRAPH, TEMPLATE);
    const m = out.match(/var KG=(\{[\s\S]*\});/);
    expect(m).not.toBeNull();
    const kg = JSON.parse(m![1]);
    expect(kg.nodes[0].id).toBe("backend:x");
  });
});

const tpl = 'var KG=/*__KG_DATA__*/{}/*__KG_END__*/;\nvar DELTA=/*__KG_DELTA__*/null/*__KG_END_DELTA__*/;';
const g = { generatedAt: "T", nodes: [], edges: [], issues: [] } as any;

it("injects the delta between DELTA markers", () => {
  const out = renderViewer(g, tpl, { added: [], removed: [], newlyFailing: ["frontend:bil-4"], newlyPassing: [], issueDeltas: [] } as any);
  expect(out).toContain('"newlyFailing":["frontend:bil-4"]');
});
it("leaves DELTA null when no delta is passed (plain build)", () => {
  expect(renderViewer(g, tpl)).toContain("/*__KG_DELTA__*/null/*__KG_END_DELTA__*/");
});

// Regression: a graph node's own field (e.g. a test node's embedded `source`) can legitimately
// contain the LITERAL marker strings — the tool now indexes its own *.test.ts files (kg.tool
// feature), and a test like check.test.ts/viewer.test.ts genuinely contains the string
// "/*__KG_DELTA__*/" in a fixture. A naive `out.indexOf(D_START)` on the POST-DATA-INSERTION
// string finds that spurious occurrence INSIDE the just-inlined JSON blob (which sorts before
// the real template marker) and splices the delta into the middle of a JSON string, corrupting
// the page into invalid JS (viewer.html failed to even parse — this is the exact live bug found
// during integration verification, before this test existed).
describe("renderViewer — marker collision with node content", () => {
  const tplWithMarkers = 'var KG=/*__KG_DATA__*/{}/*__KG_END__*/;\nvar DELTA=/*__KG_DELTA__*/null/*__KG_END_DELTA__*/;';

  it("is unaffected when a node's own field contains the literal DELTA marker text", () => {
    const graphWithMarkerText = {
      generatedAt: "T",
      nodes: [{ id: "main:x.test.ts", type: "test", title: "x", source: 'const a = "/*__KG_DELTA__*/{\\"added\\":[1]}/*__KG_END_DELTA__*/";' }],
      edges: [],
      issues: [],
    } as any;
    const out = renderViewer(graphWithMarkerText, tplWithMarkers, { added: [], removed: [], newlyFailing: ["frontend:bil-4"], newlyPassing: [], issueDeltas: [] } as any);
    // The real delta must still land at the REAL (template) marker, not the one embedded in node data.
    expect(out).toContain('"newlyFailing":["frontend:bil-4"]');
    // The KG object itself must still be valid, parseable JSON — the corruption bug produced
    // a syntax error inside the KG blob (delta JSON spliced mid-string) that this catches.
    const m = out.match(/var KG=(\{[\s\S]*?\});\n/);
    expect(m).not.toBeNull();
    expect(() => JSON.parse(m![1])).not.toThrow();
  });
});
