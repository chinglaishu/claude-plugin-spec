import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph } from "./discover";
import { writeArtifacts } from "./artifacts";
import { stampSources } from "./sources";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.KG_REPO_ROOT ?? join(__dirname, "..", "..", "..");
const outDir = join(__dirname, "..");

const graph = await buildGraph(repoRoot, new Date().toISOString());
await writeArtifacts(graph, outDir);
// Stamp the pins this graph was built from, so `check --pinned` can reproduce it (REQ-KG-GATE-01).
const pins = await stampSources(repoRoot, outDir);
console.log(`kg: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.issues.length} issues`);
console.log(`kg: pinned backend@${pins.backend.slice(0, 9)} frontend@${pins.frontend.slice(0, 9)}`);
