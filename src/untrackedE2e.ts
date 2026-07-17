import type { Graph, Issue } from "./types";

const QUALIFYING = new Set(["verifies", "covers", "tags"] as const);

/**
 * Emit an `untracked-e2e` issue for every `*.spec.ts` file that has NO linked
 * `*.cases.yaml` entry carrying at least one `verifies` / `covers` / `features`
 * link. This is the fork-② rule from the feeding-and-freshness design: new e2e
 * tests are useful by construction — a bare test node is not allowed.
 *
 * @param specFiles Repo-relative paths of all `e2e/**\/*.spec.ts` files.
 * @param graph The assembled graph (looks at e2e test nodes + their outbound edges).
 */
export function detectUntrackedE2e(specFiles: string[], graph: Graph): Issue[] {
  // Bucket qualifying edges by their originating test id, once (O(nodes+edges)).
  const linked = new Set<string>();
  for (const e of graph.edges) if (QUALIFYING.has(e.type as never)) linked.add(e.from);

  // Map each e2e test node's spec filename → whether that spec is "tracked".
  const trackedSpecs = new Set<string>();
  const knownSpecs = new Set<string>();
  for (const n of graph.nodes) {
    if (n.type !== "test" || n.kind !== "e2e" || !n.spec) continue;
    knownSpecs.add(n.spec);
    if (linked.has(n.id)) trackedSpecs.add(n.spec);
  }

  const issues: Issue[] = [];
  for (const rel of specFiles) {
    // Case entries record `spec:` as a bare filename; discovery yields relative paths.
    const bare = rel.split("/").pop() ?? rel;
    if (trackedSpecs.has(bare)) continue;
    const detail = knownSpecs.has(bare)
      ? `${rel} — case entry exists but has no verifies/covers/features link`
      : `${rel} — no linked case entry (verifies/covers/features required)`;
    issues.push({ kind: "untracked-e2e", detail });
  }
  return issues;
}
