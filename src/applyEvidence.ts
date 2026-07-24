import type { Graph } from "./types";

/** Contract 3 shape (<e2eDir>/kg-evidence-index.json). */
export interface EvidenceIndex {
  branch: string;
  updatedAt: string;
  cases: Record<string, { sha: string; shots: Record<string, string> }>;
}

const bareOf = (id: string) => {
  const i = id.indexOf(":");
  return (i >= 0 ? id.slice(i + 1) : id).toLowerCase();
};

/**
 * Keep only REFERENCES. A shot entry must be a non-empty string that is not an inline `data:` URI
 * (REQ-KG-05).
 *
 * The graph is a pure function of the tree and is committed on every build, so an inline image would
 * put base64 megabytes into `knowledge-graph.json` — and, worse than the size, would put the actual
 * content of a screenshot into version control. Storing evidence out of band exists precisely to
 * prevent that, and a guarantee nothing enforces is not a guarantee.
 */
function referencesOnly(shots: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(shots))
    if (typeof value === "string" && value && !/^\s*data:/i.test(value)) out[name] = value;
  return out;
}

/**
 * Ingest `kg-evidence-index.json` (contract 3) the same way `applyResults` ingests
 * `kg-test-results.json`: read like a file, `.catch(null)` upstream, and fold in here.
 * Deterministic (file content in, graph out) so the `check` freshness gate holds.
 * Attaches `evidence` only onto `test` nodes with `kind: "e2e"`, matched by bare id
 * (case-insensitive, same convention as the rest of the graph).
 */
export function applyEvidence(graph: Graph, indexJson: string | null): Graph {
  if (!indexJson) return graph;
  let parsed: EvidenceIndex;
  try {
    parsed = JSON.parse(indexJson) as EvidenceIndex;
  } catch {
    return graph;
  }
  const cases = parsed?.cases;
  if (!cases || typeof cases !== "object") return graph;
  const byBareId = new Map(Object.entries(cases).map(([id, v]) => [id.toLowerCase(), v]));

  const nodes = graph.nodes.map((n) => {
    if (n.type !== "test" || n.kind !== "e2e") return n;
    const entry = byBareId.get(bareOf(n.id));
    if (!entry?.shots) return n;
    const evidence = referencesOnly(entry.shots);
    if (!Object.keys(evidence).length) return n;
    return { ...n, evidence };
  });
  return { ...graph, nodes };
}
