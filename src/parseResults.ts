import type { Graph } from "./types";
import { normalizeResults } from "./resultsFile";

const bareOf = (id: string) => {
  const i = id.indexOf(":");
  return (i >= 0 ? id.slice(i + 1) : id).toLowerCase();
};

export function applyResults(graph: Graph, resultsJson: string | null): Graph {
  if (!resultsJson) return graph;
  const parsed = normalizeResults(resultsJson);
  const nodes = graph.nodes.map((n) => {
    const r = n.type === "test" ? parsed.results[bareOf(n.id)] : undefined;
    if (!r) return n;
    const flaky = r.status === "pass" && r.attempts > 1;
    return {
      ...n, status: r.status, attempts: r.attempts, runAt: r.at,
      ...(r.error ? { lastError: r.error } : {}),      // R2-B: cleaned failure message (failed cases only)
      ...(r.commit ? { runCommit: r.commit } : {}),    // R2-B: short sha this entry was recorded at
      ...(flaky ? { flaky: true } : {}),
      ...(r.suggestedFix ? { suggestedFix: r.suggestedFix } : {}),  // F2b: AI-authored fix suggestion (esc()'d in viewer)
    };
  });
  return { ...graph, nodes, lastRun: { at: parsed.generatedAt, commit: parsed.commit } };
}
