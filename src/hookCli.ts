// hookCli.ts — the PreToolUse entrypoint. Reads the hook payload on stdin, prints the decision.
//
//   hooks.json:  npx tsx "${CLAUDE_PLUGIN_ROOT}/src/hookCli.ts"
//
// Separate from `agentContextCli.ts`, which stays the HUMAN entrypoint (`… <path>` → readable text).
// One file serving both would have to guess which contract it is under, and guessing wrong is how the
// briefing was silent for its whole life.
//
// Every failure here exits 0 with NO output, which Claude Code reads as "this hook has no opinion".
// That is deliberate: a briefing hook must never break the user's edit because the project has no
// graph yet, or no config, or because this file has a bug. Silence on error is the right behaviour —
// silence on SUCCESS was the defect.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { contextPack } from "./agentContext";
import { artifactPath, loadConfig } from "./config";
import { editedPathFrom, hookDecision } from "./hookBriefing";
import { isMain } from "./isMain";
import type { Graph } from "./types";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

if (isMain(import.meta.url, process.argv[1])) {
  const quit = () => process.exit(0); // no opinion
  try {
    const edited = editedPathFrom(await readStdin());
    if (!edited) quit();

    // The hook runs in the user's project directory, so cwd is the project — but KG_REPO_ROOT still
    // wins, so a workspace that nests the project elsewhere can say so.
    const repoRoot = process.env.KG_REPO_ROOT ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    const config = await loadConfig(repoRoot);

    // The edited path arrives ABSOLUTE; the graph speaks in workspace-relative paths.
    const rel = edited!.startsWith(repoRoot) ? edited!.slice(repoRoot.length).replace(/^[/\\]+/, "") : edited!;

    const json = await readFile(join(repoRoot, artifactPath(config, "knowledge-graph.json")), "utf8");
    const baselineJson = await readFile(join(repoRoot, artifactPath(config, "ungoverned-baseline.json")), "utf8").catch(() => null);
    // ABSENT IS NOT EMPTY: no baseline means the project has never been governed, and must never halt.
    let baseline: string[] | undefined;
    if (baselineJson !== null) {
      const parsed = JSON.parse(baselineJson);
      baseline = Array.isArray(parsed) ? parsed.map(String) : undefined;
    }

    const pack = contextPack(JSON.parse(json) as Graph, config, rel, baseline);
    process.stdout.write(JSON.stringify(hookDecision(pack)));
  } catch {
    // No graph, no config, unreadable artifact — the user is mid-setup. Say nothing, block nothing.
  }
  process.exit(0);
}
