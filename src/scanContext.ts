import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { artifactPath, loadConfig, IGNORE, type Config } from "./config";
import { CODE_EXT, codeCandidatePairs, isProofFile } from "./codeCandidates";
import { enumerateCandidates } from "./conflictCandidates";
import { conflictScanContext, type ScanItem } from "./conflictScanContext";
import type { Graph } from "./types";

/** Pure: the deterministic comparison surface for a scope, with the text to adjudicate.
 *  This is the ONLY input the out-of-platform kg-scan-conflicts skill needs — the AI reads
 *  these bundles and judges each pair; no AI runs here or in the build (REQ-KG-CONF-03). */
export function selectScanContext(graph: Graph, scope?: string): ScanItem[] {
  return conflictScanContext(graph, enumerateCandidates(graph, scope));
}

/**
 * The code↔code half of the surface, read from the tree rather than the graph.
 *
 * Deliberately NOT a graph payload: findings are viewer-only and the symbol index is scan-only, so
 * nothing here can move `knowledge-graph.json`, the fingerprint, or the ratchet. It also means a
 * project gets code-vs-code scanning without first running a build.
 */
export async function codeScanItems(
  repoRoot: string,
  config: Config,
): Promise<{ items: ScanItem[]; scanned: number; dropped: number }> {
  const rels = await fg("**/*", {
    cwd: repoRoot, ignore: [...IGNORE, ...config.exclude, artifactPath(config, "**")],
    dot: true, unique: true, onlyFiles: true, followSymbolicLinks: false,
  });
  // Source only. A test states what source must do, so two suites sharing a fixture name is a
  // convention rather than a contradiction — and left in, that noise was the majority of the surface.
  const code = rels.filter((p) => CODE_EXT.test(p) && !isProofFile(p, config)).sort();
  const files = [];
  for (const path of code) files.push({ path, text: await readFile(join(repoRoot, path), "utf8").catch(() => "") });

  const { pairs, dropped } = codeCandidatePairs(files, { withReport: true });
  const items: ScanItem[] = pairs.map((pair) => ({
    pair,
    a: { kind: "code", ref: pair.a, path: pair.a },
    b: { kind: "code", ref: pair.b, path: pair.b },
  }));
  return { items, scanned: files.length, dropped };
}

/** PURE. Every doc `domain` that has candidate pairs, with how many — so the scan skill can pick a
 *  scope from the graph itself instead of guessing a name or hardcoding a path to go looking for one.
 *  Derived from the same enumerator, so a listed scope is exactly what `--scope` will hand back. */
export function scannableScopes(graph: Graph): { scope: string; pairs: number }[] {
  const domains = new Set(
    graph.nodes.filter((n) => n.type === "doc" && n.domain).map((n) => n.domain as string),
  );
  return [...domains]
    .sort()
    .map((scope) => ({ scope, pairs: enumerateCandidates(graph, scope).length }))
    .filter((s) => s.pairs > 0);
}

// CLI: `tsx src/scanContext.ts [--scope <domain>]` → prints the scan context as JSON on stdout.
//
// The graph is resolved from the PROJECT (cwd, or `KG_REPO_ROOT`) via its own `artifactDir` — never
// from the tool's own directory. The latter is true only while the tool lives inside the artifact dir
// it measures (§10.9), which an installed plugin never does.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("scanContext.ts")) {
  const scopeIdx = process.argv.indexOf("--scope");
  const scope = scopeIdx >= 0 ? process.argv[scopeIdx + 1] : undefined;
  const repoRoot = process.env.KG_REPO_ROOT ?? process.cwd();
  const config = await loadConfig(repoRoot);
  const graphPath = join(repoRoot, artifactPath(config, "knowledge-graph.json"));
  const json = await readFile(graphPath, "utf8").catch(() => null);
  if (json === null) {
    console.error(`kg scan-context — no graph at ${graphPath}. Run \`npm run build\` first.`);
    process.exit(2);
  }
  const graph = JSON.parse(json) as Graph;
  if (process.argv.includes("--scopes")) {
    const code = await codeScanItems(repoRoot, config);
    process.stdout.write(
      JSON.stringify({ scopes: scannableScopes(graph), code: { pairs: code.items.length, filesScanned: code.scanned } }, null, 2) + "\n",
    );
  } else {
    const docItems = selectScanContext(graph, scope);
    // `--scope` names a doc DOMAIN, and a code pair has none — so a scoped scan is the doc surface
    // only. An unscoped scan is where a repo with no docs at all still gets a surface.
    const code = scope ? { items: [], scanned: 0, dropped: 0 } : await codeScanItems(repoRoot, config);
    const items = [...docItems, ...code.items];
    process.stdout.write(
      JSON.stringify(
        {
          scope: scope ?? null,
          count: items.length,
          // Never a silent cap: a truncated surface that says nothing reads as "everything was looked at".
          ...(code.dropped ? { codePairsDropped: code.dropped, note: "code pair cap reached — narrow the scan or raise the limit" } : {}),
          items,
        },
        null,
        2,
      ) + "\n",
    );
  }
}
