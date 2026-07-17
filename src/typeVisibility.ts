export type HideableKind = "unit-fe" | "unit-be" | "cache-entry";

export interface TypeVisibility {
  "unit-fe"?: boolean;
  "unit-be"?: boolean;
  "cache-entry"?: boolean;
}

/** Minimal shape the predicate needs — the real GraphNode is a superset. */
export interface VisNode {
  type: string;
  kind?: string;
}

/**
 * Display-gate predicate. Returns false ONLY when:
 *   - the node is a test of kind "unit-fe" and vis["unit-fe"] === false, or
 *   - the node is a test of kind "unit-be" and vis["unit-be"] === false, or
 *   - the node is a "cache-entry" and vis["cache-entry"] === false.
 * Every other node type is ALWAYS visible; an absent/true flag means visible.
 * NEVER used to compute counts — health/coverage counts stay full-graph.
 */
export function isTypeVisible(node: VisNode, vis?: TypeVisibility | null): boolean {
  if (!vis) return true;
  if (node.type === "cache-entry") return vis["cache-entry"] !== false;
  if (node.type === "test") {
    if (node.kind === "unit-fe") return vis["unit-fe"] !== false;
    if (node.kind === "unit-be") return vis["unit-be"] !== false;
  }
  return true;
}
