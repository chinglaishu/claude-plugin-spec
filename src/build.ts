import { join } from "node:path";
import { buildGraph } from "./discover";
import { writeArtifacts } from "./artifacts";
import { stampSources } from "./sources";
import { loadConfig } from "./config";

// The project being measured is the CWD, overridable with KG_REPO_ROOT. Before phase 2 this walked
// `join(__dirname, "..", "..", "..")` — the tool assuming it was installed inside the tree it
// measures, which is exactly the assumption a distributable package cannot make (§10.9).
const repoRoot = process.env.KG_REPO_ROOT ?? process.cwd();
const config = await loadConfig(repoRoot);
const outDir = join(repoRoot, config.artifactDir);

const graph = await buildGraph(repoRoot, new Date().toISOString(), config);
await writeArtifacts(graph, outDir);
// Stamp the pins this graph was built from, so `check --pinned` can reproduce it (REQ-KG-GATE-01).
const pins = await stampSources(repoRoot, outDir, config.repos);
console.log(`kg: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.issues.length} issues`);
const at = Object.entries(pins).map(([name, sha]) => `${name}@${sha.slice(0, 9)}`).join(" ");
console.log(at ? `kg: pinned ${at}` : "kg: single-repo project — no sibling sources to pin");
