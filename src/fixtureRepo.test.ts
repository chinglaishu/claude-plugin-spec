// REQ-1 (founding design §7): the committed fixture projects — one-repo and multi-repo — build to
// their committed expected graphs, byte-identical, on any machine, with no access to any private
// codebase.
//
// This is REQ-0's permanent successor (§12.1, CEO 2026-07-17). REQ-0 proved the PORT against a
// private tree and retired; these fixtures are the standing, CI-runnable proof that "generic" is
// real. They test the assumption rather than the spelling (§12.9): a tool that silently hardcodes a
// layout builds the wrong fixture graph whether or not it ever names a project.
//
// Byte-identity is over the NORMALIZED graph — check.ts's normalizeForCompare, the same comparator
// `check` gates freshness with — because git created/updated dates belong to this repo's history,
// not to the fixture's content. The build itself injects an inert GitRunner so the expected graphs
// are reproducible on a machine with no git at all.
//
// To regenerate after a DELIBERATE fixture or tool-behaviour change:
//   npx tsx scripts/fixture-expected.mts
// and review the diff — the expected graph is a committed claim, not a cache.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGraph } from "./discover";
import { loadConfig } from "./config";
import { graphsMatch, normalizeForCompare } from "./check";
import type { GitRunner } from "./gitDates";
import type { Graph } from "./types";

const FIXTURES = join(__dirname, "..", "fixtures");
const PINNED = "2000-01-01T00:00:00.000Z";
/** Git reports nothing: no dates get stamped, so the graph is machine- and history-independent. */
const NO_GIT: GitRunner = async () => null;

async function build(fixture: string): Promise<Graph> {
  const root = join(FIXTURES, fixture);
  const config = await loadConfig(root);
  return buildGraph(root, PINNED, config, NO_GIT);
}

async function expected(fixture: string): Promise<{ text: string; graph: Graph }> {
  const text = (await readFile(join(FIXTURES, `${fixture}.expected.json`), "utf8")).trim();
  return { text, graph: JSON.parse(text) as Graph };
}

describe("REQ-1 — one-repo fixture", () => {
  it("builds byte-identically to its committed expected graph", async () => {
    const fresh = await build("one-repo");
    const exp = await expected("one-repo");
    expect(JSON.stringify(normalizeForCompare(fresh))).toBe(exp.text);
    expect(graphsMatch(exp.graph, fresh)).toBe(true);
  });

  it("produces the graph the fixture was designed to produce", async () => {
    const g = await build("one-repo");
    const ids = new Set(g.nodes.map((n) => n.id));

    // The degenerate topology: one repo owning the root, everything namespaced `main:`.
    expect(ids).toContain("main:checkout-spec"); // the doc
    expect(ids).toContain("main:checkout"); // the feature
    expect(ids).toContain("main:checkout-happy-path"); // the e2e case
    expect(ids).toContain("main:src/checkout.test.ts"); // the unit test, repo-relative bare id
    expect(ids).toContain("main:claude"); // CLAUDE.md as an instruction node
    expect(ids).toContain("REQ-FX-1"); // requirement ids are never namespaced
    expect(ids).toContain("REQ-FX-2");
    expect(ids).toContain("REQ-FX-3");

    // The case's bare `features: [checkout]` tag resolves to the namespaced feature.
    expect(g.edges).toContainEqual(
      expect.objectContaining({ from: "main:checkout-happy-path", to: "main:checkout", type: "tags" }),
    );
    // The unit test's tag edge is DERIVED from the feature's path globs, not authored.
    expect(g.edges).toContainEqual(
      expect.objectContaining({ from: "main:src/checkout.test.ts", to: "main:checkout", type: "tags", source: "derived" }),
    );

    // Three issues, each deliberate, each a distinct kind — pinning the issue machinery:
    // REQ-FX-2 has no covering test; the doc has an unproven requirement so the soft escape
    // hatch must NOT launder it; orphan.spec.ts has no case entry.
    expect(g.issues.map((i) => [i.kind, i.node ?? i.detail])).toEqual([
      ["uncovered-requirement", "REQ-FX-2"],
      ["untracked-e2e", "e2e/orphan.spec.ts — no linked case entry (verifies/covers/features required)"],
      ["unverified-doc", "main:checkout-spec"],
    ]);

    // REQ-FX-1 is proven by the case's `covers`; REQ-FX-3 by `provenBy` resolving to the unit
    // test — neither may appear as uncovered.
    const uncovered = g.issues.filter((i) => i.kind === "uncovered-requirement").map((i) => i.node);
    expect(uncovered).not.toContain("REQ-FX-1");
    expect(uncovered).not.toContain("REQ-FX-3");
  });
});

describe("REQ-1 — multi-repo fixture", () => {
  it("builds byte-identically to its committed expected graph", async () => {
    const fresh = await build("multi-repo");
    const exp = await expected("multi-repo");
    expect(JSON.stringify(normalizeForCompare(fresh))).toBe(exp.text);
    expect(graphsMatch(exp.graph, fresh)).toBe(true);
  });

  it("namespaces every node by its owning repo and resolves links across repos", async () => {
    const g = await build("multi-repo");
    const ids = new Set(g.nodes.map((n) => n.id));

    expect(ids).toContain("main:workspace-spec"); // root repo doc
    expect(ids).toContain("backend:api-spec"); // nested repo doc
    expect(ids).toContain("backend:tests/test_rates.py"); // pytest unit test, repo-relative bare id
    expect(ids).toContain("frontend:rates-widget"); // features registry lives in the frontend repo
    expect(ids).toContain("frontend:rates-api");
    expect(ids).toContain("frontend:rates-happy"); // e2e case
    expect(ids).toContain("frontend:fixture-notes"); // the deliberate orphan

    // A bare wikilink in the root doc resolves across the repo boundary.
    expect(g.edges).toContainEqual(
      expect.objectContaining({ from: "main:workspace-spec", to: "backend:api-spec", type: "references" }),
    );
    // A backend pytest file tags a feature registered in the frontend's registry.
    expect(g.edges).toContainEqual(
      expect.objectContaining({ from: "backend:tests/test_rates.py", to: "frontend:rates-api", type: "tags", source: "derived" }),
    );
    // The e2e case verifies the backend doc by bare slug, resolved cross-repo.
    expect(g.edges).toContainEqual(
      expect.objectContaining({ from: "frontend:rates-happy", to: "backend:api-spec", type: "verifies" }),
    );

    // REQ-FXB-1 is proven (covers edge + provenBy → the pytest node) — never uncovered. And
    // api-spec's every requirement being proven means the soft escape hatch clears it of
    // unverified-doc… but it also has a direct `verifies` from the case, so both paths hold.
    expect(g.issues.filter((i) => i.kind === "uncovered-requirement")).toEqual([]);
    expect(g.issues.map((i) => i.node ?? "")).not.toContain("backend:api-spec");

    // The deliberate defects: a wikilink to a doc that does not exist, and an orphan doc.
    expect(g.issues).toContainEqual(
      expect.objectContaining({ kind: "broken-link", from: "main:workspace-spec", to: "missing-doc" }),
    );
    expect(g.issues).toContainEqual(expect.objectContaining({ kind: "orphan-doc", node: "frontend:fixture-notes" }));
  });
});

describe("REQ-1 — the committed expected graphs", () => {
  it("are stored already-normalized, so what is committed is exactly what is compared", async () => {
    for (const fixture of ["one-repo", "multi-repo"]) {
      const exp = await expected(fixture);
      expect(JSON.stringify(normalizeForCompare(exp.graph))).toBe(exp.text);
    }
  });
});
