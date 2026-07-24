// agentContext.ts — the briefing staff is handed BEFORE it edits a file (REQ-KG-CTX-01).
//
// This is deliverable 3 of the founding design's three (§5) — "the gold, and the cheapest". The
// platform can detect every contradiction in a repo and change nothing if staff never looks before
// coding; a perfect graph nobody consults is an expensive lint. This module is what makes the graph
// get consulted.
//
// PURE, and given the graph rather than reading it. The prototype it replaces
// (`mockups/agent-context.mjs`) did two things a distributable tool cannot: it read the graph via
// `__dirname/..`, assuming it lived inside the artifact dir (§10.9's second coupling class), and it
// stripped ONE project's sibling repo prefixes with a hardcoded regex. Both are gone — the graph and
// config are parameters, and repo topology comes from config (§10.8).
import micromatch from "micromatch";
import { stripRepoPrefix, type Config } from "./config";
import type { ConflictFinding, Graph, GraphNode } from "./types";

export interface PackRequirement {
  id: string;
  text: string;
  /** Test node ids proving it. EMPTY IS THE INTERESTING CASE — it means no safety net under this edit. */
  provenBy: string[];
}

export interface ContextPack {
  path: string;
  governedBy: { id: string; title: string; path?: string }[];
  /** Features whose registered path globs claim this file. The SECOND route to ownership, and the one
   *  carrying UI behaviour — reported because otherwise a path claimed only by a feature returns
   *  `halt: false` with an empty `governedBy`, and nothing explains why it did not halt. */
  features: { id: string; title: string }[];
  requirements: PackRequirement[];
  tests: { id: string; title: string; status?: string }[];
  conflicts: { id: string; subject: string; severity: string }[];
  /** True when NOTHING governs this path. Staff must stop and ask the CEO for a requirement (§9b.2). */
  halt: boolean;
  reason?: string;
}

/**
 * Does a `governs:` target cover this path? Targets are authored as globs or as directory/file
 * prefixes, so both are honoured — and a prefix must match on a PATH BOUNDARY, never as a bare string
 * prefix, or `src/checkout` would claim `src/checkout_old.ts`. That is the same boundary rule
 * `repoOf` applies to repo subdirs, for the same reason.
 */
export function targetCovers(path: string, target: string): boolean {
  if (!target) return false;
  const p = path.replace(/\\/g, "/");
  const t = target.replace(/\\/g, "/").replace(/\/+$/, "");
  if (t.includes("*")) return micromatch.isMatch(p, t) || micromatch.isMatch(p, `**/${t}`);
  return p === t || p.startsWith(t + "/") || p.endsWith("/" + t);
}

/**
 * Build the pack for one path.
 *
 * The path is matched BOTH as given and relative to its own repo, because `governs:` targets are
 * authored relative to the doc's own repo while callers hand us a workspace-relative path. Deriving
 * the repo-relative form from config is exactly what the prototype hardcoded.
 */
export function contextPack(graph: Graph, config: Config, path: string): ContextPack {
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const forms = [path, stripRepoPrefix(path, config.repos)].filter((v, i, a) => a.indexOf(v) === i);
  const covers = (target: string) => forms.some((f) => targetCovers(f, target));

  const governedBy = graph.edges
    .filter((e) => e.type === "governs" && covers(e.to))
    .map((e) => byId.get(e.from))
    .filter((n): n is GraphNode => !!n && n.type === "doc")
    .map((n) => ({ id: n.id, title: n.title ?? n.id, path: n.path }));

  // Features whose registered path globs claim this file — a second, equally valid route to the
  // requirements that govern it, and the one that carries UI behaviour.
  const features = graph.nodes.filter((n) => n.type === "feature" && (n.paths ?? []).some((p) => covers(p)));

  const owners = new Set([...governedBy.map((d) => d.id), ...features.map((f) => f.id)]);
  const reqIds = new Set(
    graph.edges.filter((e) => e.type === "specifies" && owners.has(e.from)).map((e) => e.to),
  );

  const provingByReq = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.type !== "covers") continue;
    provingByReq.set(e.to, [...(provingByReq.get(e.to) ?? []), e.from]);
  }

  const requirements: PackRequirement[] = [...reqIds]
    .map((id) => byId.get(id))
    .filter((n): n is GraphNode => !!n && n.type === "requirement")
    .map((n) => ({ id: n.id, text: (n.text ?? n.title ?? "").trim(), provenBy: provingByReq.get(n.id) ?? [] }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const testIds = new Set(requirements.flatMap((r) => r.provenBy));
  const tests = [...testIds]
    .map((id) => byId.get(id))
    .filter((n): n is GraphNode => !!n && n.type === "test")
    .map((n) => ({ id: n.id, title: n.title ?? n.id, status: n.status }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const conflicts = (graph.conflicts ?? [])
    .filter((c: ConflictFinding) => (c.participants ?? []).some((p) => covers(p.ref ?? "")))
    .map((c) => ({ id: c.id, subject: c.subject, severity: c.severity }));

  // HALT is about GOVERNANCE, not gaps. A governed path with an unproven requirement is a warning
  // staff can act on; an ungoverned path has no statement of correct behaviour at all, so anything
  // written there is a guess — and the next person to change it inherits the guess with no way to
  // tell it from a decision. Report-only here would be the `|| echo` failure (§9c).
  const halt = owners.size === 0;
  return {
    path,
    governedBy,
    features: features.map((f) => ({ id: f.id, title: f.title ?? f.id })),
    requirements,
    tests,
    conflicts,
    halt,
    reason: halt
      ? "Nothing governs this path — stop and ask the CEO for a requirement before writing code."
      : undefined,
  };
}
