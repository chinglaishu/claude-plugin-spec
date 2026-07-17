import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fixPlan } from "./conflictFixPlan";
import { readDecisions } from "./conflictDecisions";
import type { Graph } from "./types";

// CLI: `tsx src/fixPlan.ts` → prints the fix plan (dissenters to change, by type) for every finding
// the user marked RESOLVED with a canonical position. The kg-fix-conflicts skill reads this and
// applies each target: doc-edit for docs, TDD + review for code.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("fixPlan.ts")) {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const graph: Graph = JSON.parse(await readFile(join(outDir, "knowledge-graph.json"), "utf8"));
  const decisions = readDecisions(await readFile(join(outDir, "conflicts", "decisions.json"), "utf8").catch(() => null));
  const plans = fixPlan(graph.conflicts ?? [], decisions);
  process.stdout.write(JSON.stringify({ count: plans.length, plans }, null, 2) + "\n");
}
