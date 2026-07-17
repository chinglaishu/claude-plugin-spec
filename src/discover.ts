import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseDoc } from "./parseDoc";
import { parseCases } from "./parseCases";
import { parseFeatures } from "./parseFeatures";
import { parseCache } from "./parseCache";
import { parseUnitTest } from "./parseUnitTests";
import { parseInstruction, parseAgent, parseHooks } from "./parseConfig";
import { assemble } from "./buildGraph";
import { matchingFeatures, deriveUnitTagEdges } from "./deriveTags";
import { applyResults } from "./parseResults";
import { applyEvidence } from "./applyEvidence";
import { parseConflicts, foldConflicts } from "./parseConflicts";
import { detectUntrackedE2e } from "./untrackedE2e";
import { healthForGraph } from "./summarize";
import { docDates, type GitRunner } from "./gitDates";
import type { ConflictFinding, Graph, GraphNode, ParseResult } from "./types";

/** Node types that are backed by a real committed file and can carry git created/updated dates.
 *  `hook` is included because the viewer renders hook nodes as docs (isDoc → docDateLine), so they
 *  must be dated consistently with their doc/instruction/agent siblings. */
const DATED_TYPES: ReadonlySet<GraphNode["type"]> = new Set(["doc", "instruction", "agent", "hook"]);

export const GLOBS = [
  "**/.github/**/*.md", "**/system-design/**/*.md", "**/memories/**/*.md",
  "dojostack_frontend/e2e/cases/**/*.cases.yaml",
  "dojostack_frontend/e2e/features/**/*.features.yaml",
  "dojostack_frontend/e2e/cache/**/*.cache.yaml",
  "**/CLAUDE.md", "**/copilot-instructions.md", "**/*.instructions.md",
  ".claude/agents/**/*.md", "**/*.agent.md", ".claude/settings*.json",
  ".claude/skills/*/SKILL.md",
];
// Candidate unit-test files. Only those whose path matches a registered feature's globs are
// indexed — keeps the graph bounded (grows as features are registered).
export const UNIT_GLOBS = [
  "dojostack_frontend/src/**/*.test.ts", "dojostack_frontend/src/**/*.test.tsx",
  "dojostack_backend/tests/**/test_*.py", "dojostack_backend/tests/**/*_test.py",
  // The KG tool's own Vitest files — registered so the tool's PRD (KNOWLEDGE_GRAPH_TOOL.md) can
  // honestly `provenBy` real test-node slugs instead of fabricated edges (see the "kg" feature
  // registry entry in dojostack_frontend/e2e/features/claude-plugin-spec.features.yaml, whose `paths` this
  // glob feeds into via matchingFeatures()).
  "tools/knowledge-graph/src/**/*.test.ts",
];
const IGNORE = ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/.config-backup*/**", "**/.git/**"];

export function classify(rel: string): "doc" | "cases" | "features" | "cache" | "instruction" | "agent" | "hook" | null {
  const p = rel.replace(/\\/g, "/");
  if (p.endsWith(".features.yaml")) return "features";
  if (p.endsWith(".cache.yaml")) return "cache";
  if (p.endsWith(".cases.yaml")) return "cases";
  if (/(^|\/)(CLAUDE\.md|copilot-instructions\.md)$/.test(p) || p.endsWith(".instructions.md")) return "instruction";
  if (p.startsWith(".claude/agents/") || p.endsWith(".agent.md")) return "agent";
  if (/\.claude\/skills\/[^/]+\/SKILL\.md$/.test(p)) return "agent";
  if (/\.claude\/settings.*\.json$/.test(p)) return "hook";
  if (p.endsWith(".md") && (p.includes("/.github/") || p.includes("/system-design/") || p.includes("/memories/"))) return "doc";
  return null;
}

export async function buildGraph(repoRoot: string, now: string, gitRunner?: GitRunner): Promise<Graph> {
  const files = await fg(GLOBS, { cwd: repoRoot, ignore: IGNORE, dot: true, unique: true });
  const all: ParseResult = { nodes: [], edges: [] };
  // Raw *.features.yaml text keyed by basename — inlined into graph.registries (viewer-only
  // payload for the in-viewer registry document page; assemble() sorts the keys).
  const registries: Record<string, string> = {};
  for (const rel of files) {
    const kind = classify(rel);
    if (!kind) continue;
    const content = await readFile(join(repoRoot, rel), "utf8");
    const input = { path: rel, content };
    if (kind === "features") {
      const basename = rel.replace(/\\/g, "/").split("/").pop()!;
      // Shouldn't happen (the features dir is flat), but if two files ever share a
      // basename, last-wins — loudly, so the collision gets fixed at the source.
      if (basename in registries) console.warn(`kg: duplicate registry basename '${basename}' — ${rel} overrides an earlier file`);
      registries[basename] = content;
    }
    let r: ParseResult;
    try {
      r =
        kind === "doc" ? parseDoc(input) :
        kind === "cases" ? parseCases(input) :
        kind === "features" ? parseFeatures(input) :
        kind === "cache" ? parseCache(input) :
        kind === "instruction" ? parseInstruction(input) :
        kind === "agent" ? parseAgent(input) :
        parseHooks(input);
    } catch (e) {
      // A malformed source file (e.g. a YAML syntax error) must not abort the whole
      // build — skip it and surface the failure loudly.
      console.warn(`kg: skipped ${rel} — ${(e as Error).message.split("\n")[0]}`);
      continue;
    }
    all.nodes.push(...r.nodes);
    all.edges.push(...r.edges);
  }

  // Unit-test pass: index only the Vitest/pytest files that fall under a registered feature.
  const features = all.nodes.filter((n): n is GraphNode => n.type === "feature");
  if (features.length) {
    const candidates = await fg(UNIT_GLOBS, { cwd: repoRoot, ignore: IGNORE, dot: true, unique: true });
    for (const rel of candidates) {
      if (!matchingFeatures(rel, features).length) continue;
      const content = await readFile(join(repoRoot, rel), "utf8");
      const r = parseUnitTest({ path: rel, content });
      all.nodes.push(...r.nodes);
    }
    all.edges.push(...deriveUnitTagEdges(all.nodes));
  }

  const graph = assemble(all, now, registries);

  // Stamp file-backed knowledge nodes (doc/instruction/agent) with git created/updated dates.
  // docDates runs ONE git process per repo (main/backend/frontend) and tolerates git being
  // unavailable — a missing/failed git yields no entry, so this is a no-op-safe augmentation that
  // never blocks the build. Stamped here (right after assemble) so the dates ride through the
  // downstream result/evidence folds, which spread each node and leave non-test nodes untouched.
  const datedNodes = graph.nodes.filter((n) => DATED_TYPES.has(n.type) && n.path);
  if (datedNodes.length) {
    const dates = await docDates(repoRoot, datedNodes.map((n) => n.path!), gitRunner);
    for (const n of datedNodes) {
      const d = dates.get(n.path!);
      if (d?.created) n.created = d.created;
      if (d?.updated) n.updated = d.updated;
    }
  }

  // fork-② rule: every e2e *.spec.ts must be linked to a *.cases.yaml entry
  // carrying verifies/covers/features. New bare e2e tests are not allowed.
  const specFiles = await fg("dojostack_frontend/e2e/**/*.spec.ts", { cwd: repoRoot, ignore: IGNORE, dot: false, unique: true });
  graph.issues.push(...detectUntrackedE2e(specFiles, graph));
  graph.issues.sort((a, b) => {
    const ka = [a.kind, a.node ?? "", a.from ?? "", a.to ?? "", a.detail].join("\x00");
    const kb = [b.kind, b.node ?? "", b.from ?? "", b.to ?? "", b.detail].join("\x00");
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  const resultsPath = join(repoRoot, "dojostack_frontend", "e2e", "kg-test-results.json");
  const resultsJson = await readFile(resultsPath, "utf8").catch(() => null);
  const withResults = applyResults(graph, resultsJson);

  // Evidence branch index (contract 3) — same ingestion idiom as kg-test-results.json above:
  // read like a file, tolerate absence, fold in deterministically.
  const evidencePath = join(repoRoot, "dojostack_frontend", "e2e", "kg-evidence-index.json");
  const evidenceJson = await readFile(evidencePath, "utf8").catch(() => null);
  const withEvidence = applyEvidence(withResults, evidenceJson);

  withEvidence.health = healthForGraph(withEvidence);

  // Conflicts payload (contradiction findings, viewer-only) — same ingestion idiom as
  // kg-test-results.json / kg-evidence-index.json: read from source, tolerate absence, fold in
  // deterministically. NOT nodes/edges → zero issue/ratchet impact (like registries).
  const conflictFiles = await fg("tools/knowledge-graph/conflicts/**/*.conflicts.json", { cwd: repoRoot, ignore: IGNORE, dot: true, unique: true });
  const findings: ConflictFinding[] = [];
  for (const rel of conflictFiles) {
    const content = await readFile(join(repoRoot, rel), "utf8");
    findings.push(...parseConflicts({ path: rel, content }));
  }
  const conflicts = foldConflicts(findings);
  if (conflicts.length) withEvidence.conflicts = conflicts;

  return withEvidence;
}
