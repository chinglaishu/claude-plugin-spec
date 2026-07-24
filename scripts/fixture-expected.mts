// scripts/fixture-expected.mts — (re)capture the REQ-1 expected graphs.
//
//   npx tsx scripts/fixture-expected.mts
//
// The expected graph is a COMMITTED CLAIM, not a cache: regenerate only after a deliberate fixture
// or tool-behaviour change, and review the diff like any requirement edit. Normalization and the
// pinned clock mirror fixtureRepo.test.ts exactly — the inert GitRunner keeps this repo's commit
// history out of the fixture's content, so the capture reproduces on a machine with no git at all.
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph } from "../src/discover";
import { loadConfig } from "../src/config";
import { normalizeForCompare } from "../src/check";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const PINNED = "2000-01-01T00:00:00.000Z";

for (const fixture of ["one-repo", "multi-repo"]) {
  const root = join(FIXTURES, fixture);
  const config = await loadConfig(root);
  const graph = await buildGraph(root, PINNED, config, async () => null);
  const json = JSON.stringify(normalizeForCompare(graph));
  await writeFile(join(FIXTURES, `${fixture}.expected.json`), json + "\n");
  console.log(`${fixture}: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.issues.length} issues`);
}
