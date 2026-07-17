import micromatch from "micromatch";
import type { GraphEdge, GraphNode } from "./types";

/** Feature ids whose path globs match the given file path. A file matching several = cross-cuts. */
export function matchingFeatures(path: string, features: GraphNode[]): string[] {
  const p = (path ?? "").replace(/\\/g, "/");
  return features
    .filter((f) => f.type === "feature" && (f.paths?.length ?? 0) > 0 && micromatch.isMatch(p, f.paths!))
    .map((f) => f.id);
}

/**
 * Derive `tags` edges (unit-test → feature) by matching each unit-test node's file
 * path against the feature registry globs. E2E tests are NOT derived here — they
 * carry explicit `features:` in their `*.cases.yaml`.
 */
export function deriveUnitTagEdges(nodes: GraphNode[]): GraphEdge[] {
  const features = nodes.filter((n) => n.type === "feature");
  const edges: GraphEdge[] = [];
  for (const n of nodes) {
    if (n.type !== "test" || (n.kind !== "unit-fe" && n.kind !== "unit-be") || !n.path) continue;
    for (const to of matchingFeatures(n.path, features)) edges.push({ from: n.id, to, type: "tags", source: "derived" });
  }
  return edges;
}
