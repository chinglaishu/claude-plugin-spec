import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { artifactPath, loadConfig } from "./config";
import { fixPlan } from "./conflictFixPlan";
import { readDecisions } from "./conflictDecisions";
import type { Graph } from "./types";

// CLI: `tsx src/fixPlan.ts` → prints the fix plan (dissenters to change, by type) for every finding
// the user marked RESOLVED with a canonical position. The kg-fix-conflicts skill reads this and
// applies each target: doc-edit for docs, TDD + review for code.
//
// Graph and decisions are resolved from the PROJECT (cwd, or `KG_REPO_ROOT`) via its own
// `artifactDir` — never from the tool's own directory, which is only ever right when the tool happens
// to be installed inside the project it measures (§10.9).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("fixPlan.ts")) {
  const repoRoot = process.env.KG_REPO_ROOT ?? process.cwd();
  const config = await loadConfig(repoRoot);
  const graphPath = join(repoRoot, artifactPath(config, "knowledge-graph.json"));
  const json = await readFile(graphPath, "utf8").catch(() => null);
  if (json === null) {
    console.error(`kg fix-plan — no graph at ${graphPath}. Run \`npm run build\` first.`);
    process.exit(2);
  }
  const graph = JSON.parse(json) as Graph;
  const decisionsPath = join(repoRoot, artifactPath(config, "conflicts", "decisions.json"));
  const decisions = readDecisions(await readFile(decisionsPath, "utf8").catch(() => null));
  const plans = fixPlan(graph.conflicts ?? [], decisions);
  process.stdout.write(JSON.stringify({ count: plans.length, plans }, null, 2) + "\n");
}
