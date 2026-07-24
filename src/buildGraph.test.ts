// covers: REQ-KG-CORE-01, REQ-KG-CORE-06
import { describe, it, expect } from "vitest";
import { assemble } from "./buildGraph";
import type { ParseResult } from "./types";

const parts: ParseResult = {
  nodes: [
    { id: "billing-freeze", type: "doc", title: "BIL Freeze", status: "current", entrypoint: true },
    { id: "REQ-BIL-FREEZE-01", type: "requirement", title: "req" },
    { id: "BIL-1", type: "test", title: "publish" },
    { id: "lonely-doc", type: "doc", title: "orphan", status: "current" },
  ],
  edges: [
    { from: "BIL-1", to: "billing-freeze", type: "verifies", source: "cases" },
    { from: "billing-freeze", to: "REQ-BIL-FREEZE-01", type: "specifies", source: "doc" },
    { from: "billing-freeze", to: "missing-doc", type: "references", source: "doc" },
    { from: "billing-freeze", to: "services/billing/", type: "governs", source: "doc" },
  ],
};

describe("assemble", () => {
  const g = assemble(parts, "2026-07-01T00:00:00Z");
  const kinds = g.issues.map((i) => i.kind);

  it("flags broken-link only for node-target edges", () => {
    expect(g.issues).toContainEqual({ kind: "broken-link", from: "billing-freeze", to: "missing-doc", detail: "references target 'missing-doc' is not a node" });
    expect(kinds.filter((k) => k === "broken-link")).toHaveLength(1); // governs code path is NOT broken
  });
  it("flags uncovered requirement (no covers edge)", () => {
    expect(g.issues).toContainEqual({ kind: "uncovered-requirement", node: "REQ-BIL-FREEZE-01", detail: "no test covers this requirement" });
  });
  it("flags orphan-doc (no inbound references/imports)", () => {
    expect(kinds).toContain("orphan-doc");
    expect(g.issues.find((i) => i.kind === "orphan-doc")?.node).toBe("lonely-doc");
  });
  it("sorts nodes deterministically", () => {
    expect(g.nodes.map((n) => n.id)).toEqual([...g.nodes.map((n) => n.id)].sort());
  });
});

describe("assemble — bare-slug resolver", () => {
  it("resolves bare reference targets to the namespaced node id", () => {
    const parts = {
      nodes: [
        { id: "backend:billing-freeze", type: "doc", title: "HVF", path: "svc_backend/a.md", status: "current" },
        { id: "backend:assumption-hierarchy-ux", type: "doc", title: "AH", path: "svc_backend/b.md", status: "current" },
      ],
      edges: [{ from: "backend:billing-freeze", to: "assumption-hierarchy-ux", type: "references", source: "svc_backend/a.md" }],
    } as any;
    const g = assemble(parts, "T");
    expect(g.edges[0].to).toBe("backend:assumption-hierarchy-ux");
    expect(g.issues.filter((i) => i.kind === "broken-link")).toHaveLength(0);
  });

  it("flags a bare target that matches two nodes as ambiguous-link", () => {
    const parts = {
      nodes: [
        { id: "backend:readme", type: "doc", title: "R", path: "svc_backend/README.md", status: "current" },
        { id: "frontend:readme", type: "doc", title: "R", path: "svc_frontend/README.md", status: "current" },
        { id: "main:x", type: "doc", title: "X", path: "x.md", status: "current" },
      ],
      edges: [{ from: "main:x", to: "readme", type: "references", source: "x.md" }],
    } as any;
    const g = assemble(parts, "T");
    expect(g.issues.some((i) => i.kind === "ambiguous-link" && i.to === "readme")).toBe(true);
  });
});

describe("assemble — duplicate-id determinism", () => {
  const dupParts: ParseResult = {
    nodes: [
      { id: "dup", type: "doc", title: "Dup Z", path: "z/dup.md", status: "current" },
      { id: "dup", type: "doc", title: "Dup A", path: "a/dup.md", status: "current" },
      { id: "other", type: "doc", title: "Other", path: "other.md", status: "current", entrypoint: true },
    ],
    edges: [],
  };

  const g1 = assemble(dupParts, "2026-07-01T00:00:00Z");
  const g2 = assemble({ ...dupParts, nodes: [...dupParts.nodes].reverse() }, "2026-07-01T00:00:00Z");

  it("keeps exactly one node with id 'dup'", () => {
    expect(g1.nodes.filter((n) => n.id === "dup")).toHaveLength(1);
  });

  it("keeps the lexicographically smaller path ('a/dup.md') as the winner", () => {
    const winner = g1.nodes.find((n) => n.id === "dup");
    expect(winner?.path).toBe("a/dup.md");
  });

  it("emits a duplicate-id issue for 'dup'", () => {
    expect(g1.issues).toContainEqual(
      expect.objectContaining({ kind: "duplicate-id", node: "dup" })
    );
  });

  it("produces byte-identical output regardless of input node order", () => {
    expect(JSON.stringify(g1)).toBe(JSON.stringify(g2));
  });
});

describe("assemble — unverified-doc: self-proven via specified requirements", () => {
  it("does NOT flag unverified-doc when every specified requirement is covered by a test", () => {
    const parts: ParseResult = {
      nodes: [
        { id: "tool-prd", type: "doc", title: "Tool PRD", status: "current", entrypoint: true },
        { id: "REQ-TOOL-01", type: "requirement", title: "req 1" },
        { id: "REQ-TOOL-02", type: "requirement", title: "req 2" },
        { id: "tool.test.ts", type: "test", kind: "unit-fe", title: "tool test" },
      ],
      edges: [
        { from: "tool-prd", to: "REQ-TOOL-01", type: "specifies", source: "doc" },
        { from: "tool-prd", to: "REQ-TOOL-02", type: "specifies", source: "doc" },
        { from: "tool.test.ts", to: "REQ-TOOL-01", type: "covers", source: "doc" },
        { from: "tool.test.ts", to: "REQ-TOOL-02", type: "covers", source: "doc" },
      ],
    };
    const g = assemble(parts, "T");
    expect(g.issues.filter((i) => i.kind === "unverified-doc")).toHaveLength(0);
    expect(g.issues.filter((i) => i.kind === "uncovered-requirement")).toHaveLength(0);
  });

  it("still flags unverified-doc when at least one specified requirement is uncovered", () => {
    const parts: ParseResult = {
      nodes: [
        { id: "tool-prd", type: "doc", title: "Tool PRD", status: "current", entrypoint: true },
        { id: "REQ-TOOL-01", type: "requirement", title: "req 1" },
        { id: "REQ-TOOL-02", type: "requirement", title: "req 2 (unproven)" },
        { id: "tool.test.ts", type: "test", kind: "unit-fe", title: "tool test" },
      ],
      edges: [
        { from: "tool-prd", to: "REQ-TOOL-01", type: "specifies", source: "doc" },
        { from: "tool-prd", to: "REQ-TOOL-02", type: "specifies", source: "doc" },
        { from: "tool.test.ts", to: "REQ-TOOL-01", type: "covers", source: "doc" },
      ],
    };
    const g = assemble(parts, "T");
    expect(g.issues).toContainEqual({ kind: "unverified-doc", node: "tool-prd", detail: "no test verifies this doc (soft)" });
    expect(g.issues).toContainEqual({ kind: "uncovered-requirement", node: "REQ-TOOL-02", detail: "no test covers this requirement" });
  });

  it("still flags unverified-doc for a doc with no requirements and no verifies edge (no regression)", () => {
    const parts: ParseResult = {
      nodes: [{ id: "plain-doc", type: "doc", title: "Plain", status: "current", entrypoint: true }],
      edges: [],
    };
    const g = assemble(parts, "T");
    expect(g.issues).toContainEqual({ kind: "unverified-doc", node: "plain-doc", detail: "no test verifies this doc (soft)" });
  });

  it("counts a requirement proven via authored provenBy (not just an inbound covers edge)", () => {
    const parts: ParseResult = {
      nodes: [
        { id: "tool-prd", type: "doc", title: "Tool PRD", status: "current", entrypoint: true },
        { id: "REQ-TOOL-01", type: "requirement", title: "req 1", provenBy: ["tool.test.ts"] },
        { id: "tool.test.ts", type: "test", kind: "unit-fe", title: "tool test" },
      ],
      edges: [{ from: "tool-prd", to: "REQ-TOOL-01", type: "specifies", source: "doc" }],
    };
    const g = assemble(parts, "T");
    expect(g.issues.filter((i) => i.kind === "unverified-doc")).toHaveLength(0);
  });
});

/**
 * broken-proof — a cited proof that names nothing (REQ-KG-CORE-06).
 *
 * `provenBy` is where a doc's `covers:` frontmatter lands, and it was the one authored claim in the
 * graph that could be WRONG WITHOUT CONSEQUENCE: `provenByTest` kept the slugs that resolved to a
 * test node and silently discarded the rest, so a requirement could cite four proofs, have three of
 * them name files that do not exist, and still read as fully proven — with nothing anywhere saying
 * so. Found live: the port moved every test out of `tools/knowledge-graph/src/`, and 48 of the 49
 * cited paths in this repo's own PRD kept pointing at the old location. It survived a coverage
 * backfill and a PRD split precisely because nothing reported it.
 *
 * The asymmetry it fixes: an edge's TARGET has always been validated (`broken-link`, REQ-KG-CORE-01)
 * while a requirement's cited PROOF was not. Note this is a claim about the citation, not about
 * coverage — a requirement genuinely proven by a `covers:` comment still gets flagged for the dead
 * path it also cites, because "proven anyway" is exactly how the wrong citation survives.
 */
describe("assemble — broken-proof", () => {
  const doc = (provenBy: string[]): ParseResult => ({
    nodes: [
      { id: "tool-prd", type: "doc", title: "Tool PRD", status: "current", entrypoint: true },
      { id: "REQ-TOOL-01", type: "requirement", title: "req 1", provenBy },
      { id: "main:src/real.test.ts", type: "test", kind: "unit-fe", title: "real test" },
      { id: "main:src/helper.ts", type: "doc", title: "not a test", status: "current" },
    ],
    edges: [{ from: "tool-prd", to: "REQ-TOOL-01", type: "specifies", source: "doc" }],
  });

  it("flags a provenBy entry that resolves to no node at all", () => {
    const g = assemble(doc(["main:tools/knowledge-graph/src/real.test.ts"]), "T");
    expect(g.issues).toContainEqual({
      kind: "broken-proof",
      node: "REQ-TOOL-01",
      detail: "cited proof 'main:tools/knowledge-graph/src/real.test.ts' is not a test node",
    });
  });

  it("flags a provenBy entry that resolves to a node which is not a test", () => {
    const g = assemble(doc(["main:src/helper.ts"]), "T");
    expect(g.issues.filter((i) => i.kind === "broken-proof")).toHaveLength(1);
  });

  it("accepts a resolving proof, by full id and by bare slug alike", () => {
    for (const slug of ["main:src/real.test.ts", "src/real.test.ts"]) {
      const g = assemble(doc([slug]), "T");
      expect(g.issues.filter((i) => i.kind === "broken-proof"), slug).toHaveLength(0);
    }
  });

  // The point of the whole issue kind: a dead citation must not be masked by a live one.
  it("flags the dead citation even when a sibling citation proves the requirement", () => {
    const g = assemble(doc(["main:src/real.test.ts", "main:tools/knowledge-graph/src/gone.test.ts"]), "T");
    expect(g.issues.filter((i) => i.kind === "uncovered-requirement")).toHaveLength(0);
    expect(g.issues.filter((i) => i.kind === "broken-proof")).toHaveLength(1);
  });

  it("says nothing about a requirement that cites no proof — that is uncovered-requirement's job", () => {
    const g = assemble(doc([]), "T");
    expect(g.issues.filter((i) => i.kind === "broken-proof")).toHaveLength(0);
    expect(g.issues).toContainEqual({ kind: "uncovered-requirement", node: "REQ-TOOL-01", detail: "no test covers this requirement" });
  });
});

// graph.registries — viewer-only payload (features.yaml basename → raw file text) powering the
// in-viewer registry document page. Explicitly NOT nodes/edges: it must never influence
// issues/ratchet, and it must serialize deterministically (keys inserted sorted, since
// JSON.stringify preserves insertion order).
describe("assemble — graph.registries (inline feature-registry yaml)", () => {
  const empty: ParseResult = { nodes: [], edges: [] };
  const regs = {
    // deliberately inserted OUT of order to prove assemble sorts on insert
    "pricing.features.yaml": "- id: pfl.scenario\n  label: Scenario modeling\n",
    "onboarding.features.yaml": "- id: add.mapping\n  label: Column mapping\n",
  };

  it("carries registries keyed by basename with byte-exact content, keys sorted", () => {
    const g = assemble(empty, "T", regs);
    expect(g.registries).toBeDefined();
    expect(Object.keys(g.registries!)).toEqual(["onboarding.features.yaml", "pricing.features.yaml"]);
    expect(g.registries!["onboarding.features.yaml"]).toBe("- id: add.mapping\n  label: Column mapping\n");
    expect(g.registries!["pricing.features.yaml"]).toBe("- id: pfl.scenario\n  label: Scenario modeling\n");
  });

  it("omits the registries key entirely when none are provided (no artifact churn)", () => {
    expect("registries" in assemble(empty, "T")).toBe(false);
    expect("registries" in assemble(empty, "T", {})).toBe(false);
  });

  it("serializes deterministically: two assembles produce the identical JSON string", () => {
    const a = assemble(empty, "T", { ...regs });
    // second call with the SAME entries inserted in the opposite order
    const flipped = Object.fromEntries(Object.entries(regs).reverse());
    const b = assemble(empty, "T", flipped);
    expect(JSON.stringify(a.registries)).toBe(JSON.stringify(b.registries));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not add issues or nodes/edges (viewer-only payload)", () => {
    const g = assemble(empty, "T", regs);
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
    expect(g.issues).toEqual([]);
  });
});

/**
 * REQ-KG-CORE-07 — a `status: draft` doc is a PROPOSAL, and the ratchet must not count proposals.
 *
 * Found by dogfooding `kg-draft-spec` on this repo: drafting one doc raised `uncovered-requirement`
 * by four and `unverified-doc` by one, and `check --update-baseline` only ever LOWERS — so there was
 * no sanctioned way to accept the rise. The product's own recommended first move on an unspecced repo
 * left `npm run check` permanently red, and the only ways out were deleting the draft or refreshing a
 * baseline, which is the one move this project never makes.
 *
 * A draft has not claimed anything yet, so there is nothing to have failed to prove. It becomes
 * countable the moment the CEO promotes it.
 */
describe("assemble — a draft doc is a proposal, not an unmet promise", () => {
  const draftParts = (status: string): ParseResult => ({
    nodes: [
      { id: "d", type: "doc", title: "Drafted", status, entrypoint: true },
      { id: "REQ-D-1", type: "requirement", title: "drafted claim" },
    ],
    edges: [{ from: "d", to: "REQ-D-1", type: "specifies", source: "doc" }],
  });

  it("does not count a drafted requirement as uncovered", () => {
    const g = assemble(draftParts("draft"), "T");
    expect(g.issues.filter((i) => i.kind === "uncovered-requirement")).toHaveLength(0);
  });

  it("does not count a draft doc as unverified", () => {
    const g = assemble(draftParts("draft"), "T");
    expect(g.issues.filter((i) => i.kind === "unverified-doc")).toHaveLength(0);
  });

  // The exemption must be the DRAFT status doing the work, not the shape of the fixture — otherwise
  // this passes for a reason that has nothing to do with what it claims to test.
  it("counts both the moment the same doc is promoted to current", () => {
    const g = assemble(draftParts("current"), "T");
    expect(g.issues.filter((i) => i.kind === "uncovered-requirement")).toHaveLength(1);
    expect(g.issues.filter((i) => i.kind === "unverified-doc")).toHaveLength(1);
  });

  // A requirement an approved doc also specifies is a real promise; a draft restating it must not
  // launder it out of the ratchet.
  it("still counts a requirement that any non-draft doc specifies", () => {
    const parts: ParseResult = {
      nodes: [
        { id: "draft", type: "doc", title: "Drafted", status: "draft", entrypoint: true },
        { id: "real", type: "doc", title: "Approved", status: "current", entrypoint: true },
        { id: "REQ-X-1", type: "requirement", title: "shared claim" },
      ],
      edges: [
        { from: "draft", to: "REQ-X-1", type: "specifies", source: "doc" },
        { from: "real", to: "REQ-X-1", type: "specifies", source: "doc" },
      ],
    };
    expect(assemble(parts, "T").issues.filter((i) => i.kind === "uncovered-requirement")).toHaveLength(1);
  });

  // A draft still has to be reachable, or drafts accumulate as unlinked strays.
  it("still flags an unlinked draft as an orphan", () => {
    const parts: ParseResult = {
      nodes: [{ id: "d", type: "doc", title: "Drafted", status: "draft" }],
      edges: [],
    };
    expect(assemble(parts, "T").issues.filter((i) => i.kind === "orphan-doc")).toHaveLength(1);
  });
});
