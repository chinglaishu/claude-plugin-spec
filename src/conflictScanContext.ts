import type { CandidatePair } from "./conflictCandidates";
import type { Graph, GraphNode } from "./types";

/** One side of a candidate pair, with the text the adjudicator needs to read. */
export interface ScanSide { kind: "doc" | "code" | "req" | "test"; ref: string; title?: string; text?: string; path?: string; }
export interface ScanItem { pair: CandidatePair; a: ScanSide; b: ScanSide; }

/** Resolve one ref (a node id or a bare code path) into a side, recovering its role from the
 *  node type so the a/b ordering enumerateCandidates produced (sorted, role-agnostic) is lossless. */
function sideOf(ref: string, byId: Map<string, GraphNode>): ScanSide {
  const n = byId.get(ref);
  if (!n) return { kind: "code", ref, path: ref };
  if (n.type === "requirement") return { kind: "req", ref, title: n.title, text: n.text };
  if (n.type === "test") return { kind: "test", ref, title: n.title, text: n.source };
  return { kind: "doc", ref, title: n.title, text: n.body, path: n.path };
}

/** Bundle, for each candidate pair, the two sides' identifying info + the text to compare — the
 *  deterministic context the out-of-platform scan skill adjudicates (the AI reads this, the build
 *  never calls AI). */
export function conflictScanContext(graph: Graph, pairs: CandidatePair[]): ScanItem[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  return pairs.map((pair) => ({ pair, a: sideOf(pair.a, byId), b: sideOf(pair.b, byId) }));
}
