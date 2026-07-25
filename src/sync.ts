import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isMain } from "./isMain";
import { buildGraph } from "./discover";
import { writeArtifacts } from "./artifacts";
import { computeDelta, formatDelta } from "./delta";
import { countIssuesByKind, ratchetFailures, type Baseline } from "./check";
import { stampSources } from "./sources";
import { loadConfig } from "./config";
import type { Graph } from "./types";

/** Hours between `iso` and now, or null when the timestamp is missing. */
export function ageHours(iso: string | undefined | null, now: Date): number | null {
  if (!iso) return null;
  return (now.getTime() - new Date(iso).getTime()) / 3_600_000;
}

if (isMain(import.meta.url, process.argv[1])) {
  const repoRoot = process.env.KG_REPO_ROOT ?? process.cwd();
  const config = await loadConfig(repoRoot);
  const outDir = join(repoRoot, config.artifactDir);
  const quiet = process.argv.includes("--quiet");

  const committed: Graph | null = await readFile(join(outDir, "knowledge-graph.json"), "utf8")
    .then((s) => JSON.parse(s) as Graph).catch(() => null);
  const fresh = await buildGraph(repoRoot, new Date().toISOString(), config);
  const delta = computeDelta(committed, fresh);
  const deltaLines = formatDelta(delta);
  await writeArtifacts(fresh, outDir, { delta, deltaLines });
  // sync writes the graph too, so it must stamp the pins alongside it — a graph whose lockfile
  // says it came from different inputs is a drift source of exactly the kind this file exists to
  // report (REQ-KG-GATE-01).
  const pins = await stampSources(repoRoot, outDir, config.repos);
  console.log(`kg sync: ${fresh.nodes.length} nodes, ${fresh.edges.length} edges, ${fresh.issues.length} issues — artifacts written`);
  const at = Object.entries(pins).map(([name, sha]) => `${name}@${sha.slice(0, 9)}`).join(" ");
  console.log(at ? `kg sync: pinned ${at}` : "kg sync: single-repo project — no sibling sources to pin");

  // Ratchet in REPORT mode: same math as check, but informational — never blocks.
  const baseline: Baseline = JSON.parse(await readFile(join(outDir, "knowledge-graph.baseline.json"), "utf8").catch(() => "{}"));
  const counts = countIssuesByKind(fresh.issues);
  const failures = ratchetFailures(baseline, counts);
  for (const kind of [...new Set([...Object.keys(baseline), ...Object.keys(counts)])].sort()) {
    const b = baseline[kind] ?? 0, c = counts[kind] ?? 0;
    if (b === c) continue;
    console.log(`  ${kind}: ${b} → ${c} ${c <= b ? "✓" : "⚠ above baseline"}`);
  }
  if (failures.length) console.log(`kg sync: ⚠ ${failures.length} issue kind(s) above baseline — \`npm run check\` would fail; fix or discuss before commit.`);

  if (!quiet) {
    console.log("── since last sync ──");
    for (const l of deltaLines) console.log(`  ${l}`);
  }
  const resAge = ageHours(fresh.lastRun?.at, new Date());
  if (resAge === null) console.log("kg sync: ⚠ no test results recorded — run `npm run sync:results`");
  else if (resAge > 24) console.log(`kg sync: ⚠ test results are ${Math.round(resAge)}h old — run \`npm run sync:results\``);
}
