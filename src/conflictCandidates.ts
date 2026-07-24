import type { Graph, GraphNode } from "./types";

/** `code-code` pairs are NOT derived here — they come from the shared-symbol index in
 *  codeCandidates.ts, because a repo with no docs has no edges for this enumerator to walk. */
export interface CandidatePair {
  kind: "doc-doc" | "doc-code" | "req-test" | "code-code";
  a: string;
  b: string;
  /** `code-code` only: the declared names both files share — i.e. WHY this pair exists and what the
   *  adjudicator should be comparing. Absent for doc-anchored pairs, where the edge is the reason. */
  sharedSymbols?: string[];
}

/** Enumerate the comparison surface DETERMINISTICALLY from the graph's own edges — the scan
 *  skill adjudicates only these, never free-hunting the tree (REQ-KG-CONF-02): doc↔doc via
 *  `references`, doc↔code via `governs` (target is a free code-path string), requirement↔test
 *  via `covers`. `scope`, when given, filters doc-anchored pairs to docs whose domain === scope.
 *  (Tier-2 same-scope co-membership of unlinked docs is layered on later, in the 1b scan skill.) */
export function enumerateCandidates(graph: Graph, scope?: string): CandidatePair[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const docInScope = (n: GraphNode | undefined) => !!n && n.type === "doc" && (!scope || n.domain === scope);

  const seen = new Set<string>();
  const pairs: CandidatePair[] = [];
  const add = (kind: CandidatePair["kind"], x: string, y: string) => {
    const [a, b] = x < y ? [x, y] : [y, x];
    const key = `${kind}|${a}|${b}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ kind, a, b });
  };

  for (const e of graph.edges) {
    const from = byId.get(e.from);
    if (e.type === "references" && from?.type === "doc" && byId.get(e.to)?.type === "doc" && docInScope(from) && docInScope(byId.get(e.to)))
      add("doc-doc", e.from, e.to);
    else if (e.type === "governs" && docInScope(from))
      add("doc-code", e.from, e.to); // e.to is a free code-path string
    else if (e.type === "covers")
      add("req-test", e.to, e.from); // covers: test(from) -> requirement(to)
  }

  pairs.sort((p, q) => {
    const kp = `${p.kind}|${p.a}|${p.b}`;
    const kq = `${q.kind}|${q.a}|${q.b}`;
    return kp < kq ? -1 : kp > kq ? 1 : 0;
  });
  return pairs;
}
