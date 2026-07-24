// agentContextCli.ts — the hook entrypoint (REQ-KG-CTX-01).
//
//   npx tsx src/agentContextCli.ts <path>
//
// Thin glue by design: every decision lives in `contextPack`/`renderPack`, which are pure and tested.
// This resolves the project, reads the COMMITTED graph (never rebuilds — a hook must be fast enough
// that nobody is tempted to turn it off), and prints.
//
// It reads the committed graph rather than building one, which means a stale graph gives a stale
// briefing. That is the freshness gate's job (REQ-KG-01), not this file's — duplicating the check
// here would be a second opinion about staleness, and two opinions is the contradiction the tool
// exists to remove.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { contextPack, renderPack } from "./agentContext";
import { artifactPath, loadConfig } from "./config";
import type { Graph } from "./types";

const path = process.argv[2];
if (!path) {
  console.error("usage: agentContextCli <path>");
  process.exit(2);
}

const repoRoot = process.env.KG_REPO_ROOT ?? process.cwd();
const config = await loadConfig(repoRoot);
const graphPath = join(repoRoot, artifactPath(config, "knowledge-graph.json"));
const json = await readFile(graphPath, "utf8").catch(() => null);
if (json === null) {
  // Silent is the one thing this must never be: a missing graph would otherwise read as "nothing
  // governs this file", which is the opposite of the truth and would halt every edit in the repo.
  console.error(`kg agent-context — no graph at ${graphPath}. Run \`npm run build\` first.`);
  process.exit(2);
}

const graph = JSON.parse(json) as Graph;
console.log(renderPack(contextPack(graph, config, path)));
