import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { enumerateCandidates } from "./conflictCandidates";
import { conflictScanContext, type ScanItem } from "./conflictScanContext";
import type { Graph } from "./types";

/** Pure: the deterministic comparison surface for a scope, with the text to adjudicate.
 *  This is the ONLY input the out-of-platform kg-scan-conflicts skill needs — the AI reads
 *  these bundles and judges each pair; no AI runs here or in the build (REQ-KG-CONF-03). */
export function selectScanContext(graph: Graph, scope?: string): ScanItem[] {
  return conflictScanContext(graph, enumerateCandidates(graph, scope));
}

// CLI: `tsx src/scanContext.ts [--scope <domain>]` → prints the scan context as JSON on stdout.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("scanContext.ts")) {
  const scopeIdx = process.argv.indexOf("--scope");
  const scope = scopeIdx >= 0 ? process.argv[scopeIdx + 1] : undefined;
  const outDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const graph: Graph = JSON.parse(await readFile(join(outDir, "knowledge-graph.json"), "utf8"));
  const items = selectScanContext(graph, scope);
  process.stdout.write(JSON.stringify({ scope: scope ?? null, count: items.length, items }, null, 2) + "\n");
}
