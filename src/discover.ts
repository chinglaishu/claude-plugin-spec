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
import { deriveUnitTagEdges } from "./deriveTags";
import { applyResults } from "./parseResults";
import { applyEvidence } from "./applyEvidence";
import { parseConflicts, foldConflicts } from "./parseConflicts";
import { detectUntrackedE2e } from "./untrackedE2e";
import { healthForGraph } from "./summarize";
import { docDates, type GitRunner } from "./gitDates";
import { knowledgeGlobs, e2ePath, artifactPath, IGNORE, type Config } from "./config";
import type { ConflictFinding, Graph, GraphNode, ParseResult } from "./types";

/** Node types that are backed by a real committed file and can carry git created/updated dates.
 *  `hook` is included because the viewer renders hook nodes as docs (isDoc → docDateLine), so they
 *  must be dated consistently with their doc/instruction/agent siblings. */
const DATED_TYPES: ReadonlySet<GraphNode["type"]> = new Set(["doc", "instruction", "agent", "hook"]);


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

export async function buildGraph(repoRoot: string, now: string, config: Config, gitRunner?: GitRunner): Promise<Graph> {
  // IGNORE is the tool's own floor (build output, vcs); `config.exclude` is the project saying which
  // sub-trees are not its knowledge — committed fixtures, samples, vendored trees. Applied to every
  // pass below, so an excluded tree cannot enter as a doc, a test, a spec or a conflict finding.
  const ignore = [...IGNORE, ...config.exclude];
  const files = await fg(knowledgeGlobs(config), { cwd: repoRoot, ignore, dot: true, unique: true });
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
        kind === "doc" ? parseDoc(input, config.repos) :
        kind === "cases" ? parseCases(input, config.repos) :
        kind === "features" ? parseFeatures(input, config.repos) :
        kind === "cache" ? parseCache(input, config.repos) :
        kind === "instruction" ? parseInstruction(input, config.repos) :
        kind === "agent" ? parseAgent(input, config.repos) :
        parseHooks(input, config.repos);
    } catch (e) {
      // A malformed source file (e.g. a YAML syntax error) must not abort the whole
      // build — skip it and surface the failure loudly.
      console.warn(`kg: skipped ${rel} — ${(e as Error).message.split("\n")[0]}`);
      continue;
    }
    all.nodes.push(...r.nodes);
    all.edges.push(...r.edges);
  }

  // Unit-test pass: index every file matching the project's own test globs.
  //
  // Feature registration used to GATE this, which silently excluded every project with no UI flow
  // registry — this tool among them: 39 requirements, 485 passing tests, and every requirement
  // reading `uncovered` because the linkage pass never ran at all (CEO 2026-07-24). A gate that
  // depends on an e2e artifact makes "every behaviour proven" unreachable for a library or a CLI.
  // Feature matching now only DERIVES tag edges, which is the only thing it was ever evidence of.
  const candidates = await fg(config.unitTestGlobs, { cwd: repoRoot, ignore, dot: true, unique: true });
  for (const rel of candidates) {
    const content = await readFile(join(repoRoot, rel), "utf8");
    const r = parseUnitTest({ path: rel, content }, config.repos);
    all.nodes.push(...r.nodes);
    all.edges.push(...r.edges);
  }
  all.edges.push(...deriveUnitTagEdges(all.nodes));

  const graph = assemble(all, now, registries);

  // Stamp file-backed knowledge nodes (doc/instruction/agent) with git created/updated dates.
  // docDates runs ONE git process per repo in the topology and tolerates git being unavailable — a
  // missing/failed git yields no entry, so this is a no-op-safe augmentation that never blocks the
  // build. Stamped here (right after assemble) so the dates ride through the downstream
  // result/evidence folds, which spread each node and leave non-test nodes untouched.
  const datedNodes = graph.nodes.filter((n) => DATED_TYPES.has(n.type) && n.path);
  if (datedNodes.length) {
    const dates = await docDates(repoRoot, datedNodes.map((n) => n.path!), config.repos, gitRunner);
    for (const n of datedNodes) {
      const d = dates.get(n.path!);
      if (d?.created) n.created = d.created;
      if (d?.updated) n.updated = d.updated;
    }
  }

  // fork-② rule: every e2e *.spec.ts must be linked to a *.cases.yaml entry
  // carrying verifies/covers/features. New bare e2e tests are not allowed.
  const specFiles = await fg(e2ePath(config, "**/*.spec.ts"), { cwd: repoRoot, ignore, dot: false, unique: true });
  graph.issues.push(...detectUntrackedE2e(specFiles, graph));
  graph.issues.sort((a, b) => {
    const ka = [a.kind, a.node ?? "", a.from ?? "", a.to ?? "", a.detail].join("\x00");
    const kb = [b.kind, b.node ?? "", b.from ?? "", b.to ?? "", b.detail].join("\x00");
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  const resultsPath = join(repoRoot, e2ePath(config, "kg-test-results.json"));
  const resultsJson = await readFile(resultsPath, "utf8").catch(() => null);
  const withResults = applyResults(graph, resultsJson);

  // Evidence branch index (contract 3) — same ingestion idiom as kg-test-results.json above:
  // read like a file, tolerate absence, fold in deterministically.
  const evidencePath = join(repoRoot, e2ePath(config, "kg-evidence-index.json"));
  const evidenceJson = await readFile(evidencePath, "utf8").catch(() => null);
  const withEvidence = applyEvidence(withResults, evidenceJson);

  withEvidence.health = healthForGraph(withEvidence);

  // Conflicts payload (contradiction findings, viewer-only) — same ingestion idiom as
  // kg-test-results.json / kg-evidence-index.json: read from source, tolerate absence, fold in
  // deterministically. NOT nodes/edges → zero issue/ratchet impact (like registries).
  const conflictFiles = await fg(artifactPath(config, "conflicts/**/*.conflicts.json"), { cwd: repoRoot, ignore, dot: true, unique: true });
  const findings: ConflictFinding[] = [];
  for (const rel of conflictFiles) {
    const content = await readFile(join(repoRoot, rel), "utf8");
    findings.push(...parseConflicts({ path: rel, content }));
  }
  const conflicts = foldConflicts(findings);
  if (conflicts.length) withEvidence.conflicts = conflicts;

  // The topology, for the viewer — which ships with the tool and never sees a config, so anything it
  // needs to know about a project's layout has to arrive as data or get hardcoded (REQ-0).
  withEvidence.project = { repos: config.repos, e2eDir: config.e2eDir };

  return withEvidence;
}
