// ungovernedBaselineCli.ts — freeze (or prune) the ungoverned baseline. Run once at kg-init.
//
//   npx tsx src/ungovernedBaselineCli.ts            # freeze; refuses if one already exists
//   npx tsx src/ungovernedBaselineCli.ts --prune    # drop paths that have since become governed
//
// Thin glue by design: every decision lives in `ungovernedBaseline.ts`, which is tested. This resolves
// the project from cwd (`KG_REPO_ROOT` overrides), loads its config once and threads it down (§10.8).
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { artifactPath, loadConfig } from "./config";
import { writeBaseline } from "./ungovernedBaseline";
import type { Graph } from "./types";

const mode = process.argv.includes("--prune") ? "prune" : "create";
const repoRoot = process.env.KG_REPO_ROOT ?? process.cwd();
const config = await loadConfig(repoRoot);

const graphPath = join(repoRoot, artifactPath(config, "knowledge-graph.json"));
const json = await readFile(graphPath, "utf8").catch(() => null);
if (json === null) {
  // Without a graph nothing is governed, so the baseline would freeze the ENTIRE tree as excused and
  // the gate could never engage. Refusing is the only safe answer.
  console.error(`kg baseline — no graph at ${graphPath}. Run \`npm run build\` first.`);
  process.exit(2);
}

try {
  const result = await writeBaseline({ repoRoot, config, graph: JSON.parse(json) as Graph, mode });
  const rel = relative(repoRoot, result.path) || result.path;
  console.log(
    `kg baseline — ${result.paths.length} ungoverned path${result.paths.length === 1 ? "" : "s"} ` +
      `frozen in ${rel} (${result.scanned} files scanned).`,
  );
  if (mode === "prune")
    console.log(
      result.dropped.length
        ? `kg baseline — dropped ${result.dropped.length} now-governed path(s): ${result.dropped.slice(0, 10).join(", ")}${result.dropped.length > 10 ? ", …" : ""}`
        : "kg baseline — nothing to drop; every recorded path is still ungoverned.",
    );
  console.log("kg baseline — commit this file. From here, a NEW ungoverned path halts the briefing.");
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
}
