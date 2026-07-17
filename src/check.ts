import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildGraph } from "./discover";
import { renderViewer } from "./viewer";
import { TEMPLATE_PATH } from "./toolDir";
import { pinnedGateDecision, readSources, toSources, SOURCES_FILE } from "./sources";
import { loadConfig } from "./config";
import type { Graph, Issue } from "./types";

/**
 * Blank the volatile fields (`generatedAt`, and each node's git `created`/`updated`) so only
 * content differences survive the freshness comparison. Node dates are blanked IN PLACE (existing
 * key kept, value → "") so key order is preserved and nodes without them are untouched; `reviewedAt`
 * is frontmatter-derived content and is deliberately left in the fingerprint.
 */
function normalizeForCompare(g: Graph): Graph {
  return {
    ...g,
    generatedAt: "",
    nodes: g.nodes.map((n) => {
      if (!("created" in n) && !("updated" in n)) return n;
      const c = { ...n };
      if ("created" in c) c.created = "";
      if ("updated" in c) c.updated = "";
      return c;
    }),
  };
}

export function graphsMatch(committed: Graph, fresh: Graph): boolean {
  return JSON.stringify(normalizeForCompare(committed)) === JSON.stringify(normalizeForCompare(fresh));
}

const D_START = "/*__KG_DELTA__*/";
const D_END = "/*__KG_END_DELTA__*/";

export function viewerMatches(committed: string, fresh: string): boolean {
  // Normalize the injected DELTA block so a sync-written (delta non-null) viewer.html compares
  // equal to a plain build (delta null). Once the tool indexes its own *.test.ts files as unit
  // nodes, a node's inlined `source` can legitimately contain the LITERAL marker text (this file's
  // own fixtures above), so a decoy /*__KG_DELTA__*/…/*__KG_END_DELTA__*/ span can sit INSIDE the
  // data blob, before the REAL template span. renderViewer() (viewer.ts) always emits the real
  // DELTA markers as the LAST such span in the document (they come from the template, strictly
  // after the data insertion point), so we locate the real span via lastIndexOf, mirroring the
  // producer-side fix in viewer.ts (a5af415) rather than the first (possibly decoy) match.
  const strip = (s: string) => {
    // Blank the volatile embedded values: generatedAt and the git created/updated dates. The
    // created/updated replace is global (every node) and symmetric on both sides, so even a
    // doc/source that literally contains that text is blanked identically and stays safe.
    // reviewedAt (frontmatter content) is intentionally NOT blanked — a review-date change should
    // still register as drift.
    const normalized = s
      .replace(/"generatedAt":"[^"]*"/, '"generatedAt":""')
      .replace(/"(created|updated)":"[^"]*"/g, '"$1":""');
    const ds = normalized.lastIndexOf(D_START);
    const de = normalized.lastIndexOf(D_END);
    if (ds < 0 || de < 0 || de < ds) return normalized;
    return normalized.slice(0, ds) + D_START + "null" + D_END + normalized.slice(de + D_END.length);
  };
  return strip(committed) === strip(fresh);
}

/** The ratchet baseline: frozen count of tolerated issues per kind. */
export type Baseline = Record<string, number>;

/** Tally validation issues by their `kind`. */
export function countIssuesByKind(issues: Issue[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const i of issues) counts[i.kind] = (counts[i.kind] ?? 0) + 1;
  return counts;
}

/**
 * Kinds whose current count exceeds the baseline (a kind missing from the baseline
 * is treated as baseline 0, so a brand-new kind like `untracked-e2e` blocks on first
 * occurrence). A kind that disappeared is never a failure.
 */
export function ratchetFailures(baseline: Baseline, counts: Record<string, number>): { kind: string; baseline: number; actual: number }[] {
  const failures: { kind: string; baseline: number; actual: number }[] = [];
  for (const kind of Object.keys(counts)) {
    const allowed = baseline[kind] ?? 0;
    if (counts[kind] > allowed) failures.push({ kind, baseline: allowed, actual: counts[kind] });
  }
  return failures.sort((a, b) => (a.kind < b.kind ? -1 : 1));
}

/**
 * The next baseline after a passing run: each kind ratchets DOWN to the current count
 * but is never raised (a regression cannot be papered over by re-baselining). Kinds in
 * either the old baseline or the current counts are represented; a resolved kind goes to 0.
 */
export function lowerBaseline(baseline: Baseline, counts: Record<string, number>): Baseline {
  const next: Baseline = {};
  for (const kind of new Set([...Object.keys(baseline), ...Object.keys(counts)])) {
    const current = counts[kind] ?? 0;
    const prev = baseline[kind];
    next[kind] = prev === undefined ? current : Math.min(prev, current);
  }
  return next;
}

// Run as a script only when invoked directly (not when imported by tests)
const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // The project is the CWD (KG_REPO_ROOT overrides) and its artifacts live where IT says — not
  // beside the tool. See artifacts.ts's TOOL_DIR for the other half of that split (§10.9).
  const repoRoot = process.env.KG_REPO_ROOT ?? process.cwd();
  const config = await loadConfig(repoRoot);
  const outDir = join(repoRoot, config.artifactDir);
  const committedPath = join(outDir, "knowledge-graph.json");
  const baselinePath = join(outDir, "knowledge-graph.baseline.json");
  const updateBaseline = process.argv.includes("--update-baseline");

  // REQ-KG-GATE-02. `--pinned` is the CI posture: assert the siblings sit exactly at the commits the
  // committed graph was built from, so "does the graph match a rebuild from source?" becomes a
  // question this process can actually answer. Locally the default stays as it was — the dev's three
  // repos are coherent, and that is the fast inner loop.
  if (process.argv.includes("--pinned")) {
    const lockfileText = await readFile(join(outDir, SOURCES_FILE), "utf8").catch(() => null);
    const decision = pinnedGateDecision(lockfileText, toSources(await readSources(repoRoot, config.repos)), config.repos);
    for (const m of decision.messages) (decision.ok ? console.log : console.error)(m);
    if (!decision.ok) process.exit(1);
  }

  const committed = JSON.parse(await readFile(committedPath, "utf8"));
  const fresh = await buildGraph(repoRoot, committed.generatedAt, config); // reuse timestamp so only content diffs matter
  if (!graphsMatch(committed, fresh)) {
    console.error("kg: knowledge-graph.json is STALE — run `npm run build` and commit.");
    process.exit(1);
  }
  const template = await readFile(TEMPLATE_PATH, "utf8");
  const committedViewer = await readFile(join(outDir, "viewer.html"), "utf8");
  if (!viewerMatches(committedViewer, renderViewer(fresh, template))) {
    console.error("kg: viewer.html is STALE — run `npm run build` and commit.");
    process.exit(1);
  }
  console.log("kg: graph is fresh ✓");

  // Ratchet: issue counts may fall but never rise above the frozen baseline.
  const counts = countIssuesByKind(fresh.issues);
  const baseline: Baseline = JSON.parse(await readFile(baselinePath, "utf8").catch(() => "{}"));

  if (updateBaseline) {
    const next = lowerBaseline(baseline, counts);
    await writeFile(baselinePath, JSON.stringify(next, null, 2) + "\n");
    console.log("kg: baseline lowered ✓ — review & commit knowledge-graph.baseline.json");
    process.exit(0);
  }

  const failures = ratchetFailures(baseline, counts);
  if (failures.length) {
    console.error("kg: issue ratchet BROKEN — these kinds rose above baseline:");
    for (const f of failures) console.error(`  ${f.kind}: ${f.actual} > ${f.baseline} (allowed)`);
    console.error("Fix the new issues, or if intentional run `npm run check -- --update-baseline` (only lowers).");
    process.exit(1);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`kg: issue ratchet held ✓ — ${total} issue(s), all within baseline.`);
}
