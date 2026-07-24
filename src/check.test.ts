// covers: REQ-KG-01
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { graphsMatch, viewerMatches, countIssuesByKind, ratchetFailures, lowerBaseline } from "./check";
import { renderViewer } from "./viewer";
import type { Graph, Issue } from "./types";

// The REAL production template — the freshness gate compares against a viewer rendered from it, so
// the date-normalization regression must be proven against the real thing, not a toy template.
const REAL_TEMPLATE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "viewer.template.html"), "utf8");

const base: Graph = {
  generatedAt: "2026-07-01T00:00:00Z",
  nodes: [{ id: "n1", type: "doc", title: "Node 1", status: "current", entrypoint: true }],
  edges: [],
  issues: [],
};

describe("graphsMatch", () => {
  it("returns true for identical graphs", () => {
    expect(graphsMatch(base, { ...base })).toBe(true);
  });

  it("returns true when graphs differ only in generatedAt", () => {
    const fresh: Graph = { ...base, generatedAt: "2026-07-02T12:00:00Z" };
    expect(graphsMatch(base, fresh)).toBe(true);
  });

  it("returns false when nodes differ", () => {
    const fresh: Graph = {
      ...base,
      nodes: [{ id: "n2", type: "doc", title: "Node 2", status: "current", entrypoint: true }],
    };
    expect(graphsMatch(base, fresh)).toBe(false);
  });

  it("returns false when edges differ", () => {
    const fresh: Graph = {
      ...base,
      edges: [{ from: "n1", to: "n2", type: "references", source: "doc" }],
    };
    expect(graphsMatch(base, fresh)).toBe(false);
  });

  it("returns false when issues differ", () => {
    const fresh: Graph = {
      ...base,
      issues: [{ kind: "orphan-doc", node: "n1", detail: "no inbound references/imports" }],
    };
    expect(graphsMatch(base, fresh)).toBe(false);
  });
});

// created/updated are git commit dates — as volatile as generatedAt (they change whenever a dated
// .md is committed on a new calendar day), so they MUST be excluded from the freshness fingerprint
// or `npm run check` false-fails STALE. reviewedAt is frontmatter-derived (content) and MUST stay.
describe("graphsMatch — volatile git dates (created/updated) excluded, reviewedAt kept", () => {
  const dated = (created: string, updated: string, title = "Node 1"): Graph => ({
    generatedAt: "2026-07-01T00:00:00Z",
    nodes: [{ id: "n1", type: "doc", title, path: "svc_backend/.github/x.md", created, updated }],
    edges: [],
    issues: [],
  });

  it("returns true when two graphs differ ONLY in a node's created/updated", () => {
    expect(graphsMatch(dated("2026-01-01", "2026-06-01"), dated("2026-01-02", "2026-07-15"))).toBe(true);
  });

  it("still returns false for a real structural diff (node title) when dates are equal", () => {
    expect(graphsMatch(dated("2026-01-01", "2026-06-01", "Node 1"), dated("2026-01-01", "2026-06-01", "Node 1 RENAMED"))).toBe(false);
  });

  it("keeps reviewedAt in the fingerprint — a frontmatter last_reviewed change still triggers rebuild", () => {
    const a: Graph = { generatedAt: "T", nodes: [{ id: "n1", type: "doc", title: "N", reviewedAt: "2026-01-01" }], edges: [], issues: [] };
    const b: Graph = { generatedAt: "T", nodes: [{ id: "n1", type: "doc", title: "N", reviewedAt: "2026-05-05" }], edges: [], issues: [] };
    expect(graphsMatch(a, b)).toBe(false);
  });
});

describe("viewerMatches", () => {
  it("ignores the embedded generatedAt", () => {
    const a = `x"generatedAt":"2026-01-01T00:00:00Z"y`;
    const b = `x"generatedAt":"2026-07-02T09:00:00Z"y`;
    expect(viewerMatches(a, b)).toBe(true);
  });

  it("detects real content drift", () => {
    expect(viewerMatches(`x"nodes":[1]`, `x"nodes":[2]`)).toBe(false);
  });

  it("ignores the injected DELTA block (sync vs build must both be fresh)", () => {
    const a = 'x /*__KG_DELTA__*/null/*__KG_END_DELTA__*/ y "generatedAt":"1"';
    const b = 'x /*__KG_DELTA__*/{"added":[]}/*__KG_END_DELTA__*/ y "generatedAt":"2"';
    expect(viewerMatches(a, b)).toBe(true);
  });

  // Regression: once the tool indexes its own *.test.ts files as unit nodes, a node's inlined
  // `source` field can legitimately contain the LITERAL marker text (this exact fixture in
  // viewer.test.ts / check.test.ts is proof). A naive `.replace(...)` (non-global) on the whole
  // committed/fresh viewer.html string strips the FIRST /*__KG_DELTA__*/…/*__KG_END_DELTA__*/
  // span it finds — which sits INSIDE the data blob (the decoy) — and never reaches the REAL
  // template span after it, so the real trailing delta is left un-normalized and a legitimately
  // fresh (delta non-null) sync-written viewer.html false-fails as STALE against the committed
  // (delta null) one. The two strings below simulate that: an earlier decoy marker span embedded
  // in a simulated data blob (identical in both), followed by the REAL trailing delta span, which
  // is the only thing that actually differs.
  describe("marker collision: decoy DELTA span embedded in data blob before the real one", () => {
    const decoy = '"source":"const s = \'/*__KG_DELTA__*/null/*__KG_END_DELTA__*/\';"';

    it("normalizes via the LAST (real, trailing) DELTA span even with an earlier decoy", () => {
      const a = `{${decoy}} /*__KG_DELTA__*/null/*__KG_END_DELTA__*/ "generatedAt":"1"`;
      const b = `{${decoy}} /*__KG_DELTA__*/{"added":[1]}/*__KG_END_DELTA__*/ "generatedAt":"2"`;
      expect(viewerMatches(a, b)).toBe(true);
    });

    it("still detects real drift when the REAL trailing span differs in kind, not just the decoy", () => {
      const a = `{${decoy}} /*__KG_DELTA__*/null/*__KG_END_DELTA__*/ "nodes":[1]`;
      const b = `{${decoy}} /*__KG_DELTA__*/null/*__KG_END_DELTA__*/ "nodes":[2]`;
      expect(viewerMatches(a, b)).toBe(false);
    });
  });

  // Rendered from the REAL template: two viewers whose only difference is a node's git
  // created/updated must compare fresh, or `npm run check` false-fails STALE on any cross-day commit
  // of a dated .md. A real content diff (node title) must still be caught.
  describe("volatile git dates (created/updated) blanked in the rendered viewer (real template)", () => {
    const render = (created: string, updated: string, title = "Foo"): string =>
      renderViewer(
        {
          generatedAt: "2026-07-01T00:00:00Z",
          nodes: [
            { id: "backend:foo", type: "doc", title, path: "svc_backend/.github/system-design/foo.md", created, updated },
          ],
          edges: [],
          issues: [],
        } as unknown as Graph,
        REAL_TEMPLATE,
      );

    it("treats two viewers that differ ONLY in a node's created/updated as fresh", () => {
      expect(viewerMatches(render("2026-01-01", "2026-06-01"), render("2026-01-02", "2026-07-15"))).toBe(true);
    });

    it("still flags a real structural diff (node title) as stale", () => {
      expect(viewerMatches(render("2026-01-01", "2026-06-01", "Foo"), render("2026-01-01", "2026-06-01", "Foo RENAMED"))).toBe(false);
    });

    it("keeps reviewedAt drift stale (frontmatter change must rebuild the viewer)", () => {
      const withReview = (reviewedAt: string): string =>
        renderViewer(
          { generatedAt: "T", nodes: [{ id: "backend:foo", type: "doc", title: "Foo", reviewedAt }], edges: [], issues: [] } as unknown as Graph,
          REAL_TEMPLATE,
        );
      expect(viewerMatches(withReview("2026-01-01"), withReview("2026-05-05"))).toBe(false);
    });
  });
});

const issues = (kinds: string[]): Issue[] => kinds.map((kind) => ({ kind, detail: "x" }));

describe("countIssuesByKind", () => {
  it("tallies issues per kind", () => {
    expect(countIssuesByKind(issues(["orphan-doc", "orphan-doc", "broken-link"]))).toEqual({
      "orphan-doc": 2,
      "broken-link": 1,
    });
  });

  it("returns an empty tally for no issues", () => {
    expect(countIssuesByKind([])).toEqual({});
  });
});

describe("ratchetFailures", () => {
  it("passes when every kind is at or below its baseline", () => {
    const baseline = { "orphan-doc": 143, "broken-link": 9 };
    expect(ratchetFailures(baseline, { "orphan-doc": 143, "broken-link": 8 })).toEqual([]);
  });

  it("fails a kind that rose above baseline", () => {
    const baseline = { "orphan-doc": 143 };
    expect(ratchetFailures(baseline, { "orphan-doc": 144 })).toEqual([
      { kind: "orphan-doc", baseline: 143, actual: 144 },
    ]);
  });

  it("treats a kind absent from the baseline as baseline 0 (blocks immediately)", () => {
    // untracked-e2e is baselined at 0 → any occurrence must fail the gate.
    expect(ratchetFailures({}, { "untracked-e2e": 1 })).toEqual([
      { kind: "untracked-e2e", baseline: 0, actual: 1 },
    ]);
  });

  it("does not fail when a baselined kind disappears", () => {
    expect(ratchetFailures({ "broken-link": 9 }, {})).toEqual([]);
  });
});

describe("lowerBaseline", () => {
  it("lowers a count when issues were fixed", () => {
    expect(lowerBaseline({ "orphan-doc": 143 }, { "orphan-doc": 140 })).toEqual({ "orphan-doc": 140 });
  });

  it("never raises a count (a regression cannot be papered over)", () => {
    expect(lowerBaseline({ "orphan-doc": 143 }, { "orphan-doc": 150 })).toEqual({ "orphan-doc": 143 });
  });

  it("records a brand-new kind at its current count", () => {
    expect(lowerBaseline({}, { "untracked-e2e": 2 })).toEqual({ "untracked-e2e": 2 });
  });

  it("drops a kind to 0 once fully resolved", () => {
    expect(lowerBaseline({ "broken-link": 9 }, {})).toEqual({ "broken-link": 0 });
  });
});
