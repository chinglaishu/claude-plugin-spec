import { describe, it, expect } from "vitest";
import { assemble } from "./buildGraph";
import type { ParseResult } from "./types";

const parts: ParseResult = {
  nodes: [
    { id: "house-view-freeze", type: "doc", title: "HV Freeze", status: "current", entrypoint: true },
    { id: "REQ-HV-FREEZE-01", type: "requirement", title: "req" },
    { id: "HV-1", type: "test", title: "publish" },
    { id: "lonely-doc", type: "doc", title: "orphan", status: "current" },
  ],
  edges: [
    { from: "HV-1", to: "house-view-freeze", type: "verifies", source: "cases" },
    { from: "house-view-freeze", to: "REQ-HV-FREEZE-01", type: "specifies", source: "doc" },
    { from: "house-view-freeze", to: "missing-doc", type: "references", source: "doc" },
    { from: "house-view-freeze", to: "services/house_view/", type: "governs", source: "doc" },
  ],
};

describe("assemble", () => {
  const g = assemble(parts, "2026-07-01T00:00:00Z");
  const kinds = g.issues.map((i) => i.kind);

  it("flags broken-link only for node-target edges", () => {
    expect(g.issues).toContainEqual({ kind: "broken-link", from: "house-view-freeze", to: "missing-doc", detail: "references target 'missing-doc' is not a node" });
    expect(kinds.filter((k) => k === "broken-link")).toHaveLength(1); // governs code path is NOT broken
  });
  it("flags uncovered requirement (no covers edge)", () => {
    expect(g.issues).toContainEqual({ kind: "uncovered-requirement", node: "REQ-HV-FREEZE-01", detail: "no test covers this requirement" });
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
        { id: "backend:house-view-freeze", type: "doc", title: "HVF", path: "svc_backend/a.md", status: "current" },
        { id: "backend:assumption-hierarchy-ux", type: "doc", title: "AH", path: "svc_backend/b.md", status: "current" },
      ],
      edges: [{ from: "backend:house-view-freeze", to: "assumption-hierarchy-ux", type: "references", source: "svc_backend/a.md" }],
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

// graph.registries — viewer-only payload (features.yaml basename → raw file text) powering the
// in-viewer registry document page. Explicitly NOT nodes/edges: it must never influence
// issues/ratchet, and it must serialize deterministically (keys inserted sorted, since
// JSON.stringify preserves insertion order).
describe("assemble — graph.registries (inline feature-registry yaml)", () => {
  const empty: ParseResult = { nodes: [], edges: [] };
  const regs = {
    // deliberately inserted OUT of order to prove assemble sorts on insert
    "portfolio.features.yaml": "- id: pfl.scenario\n  label: Scenario modeling\n",
    "add-property.features.yaml": "- id: add.mapping\n  label: Column mapping\n",
  };

  it("carries registries keyed by basename with byte-exact content, keys sorted", () => {
    const g = assemble(empty, "T", regs);
    expect(g.registries).toBeDefined();
    expect(Object.keys(g.registries!)).toEqual(["add-property.features.yaml", "portfolio.features.yaml"]);
    expect(g.registries!["add-property.features.yaml"]).toBe("- id: add.mapping\n  label: Column mapping\n");
    expect(g.registries!["portfolio.features.yaml"]).toBe("- id: pfl.scenario\n  label: Scenario modeling\n");
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
