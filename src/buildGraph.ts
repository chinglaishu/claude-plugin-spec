import type { Graph, GraphEdge, GraphNode, Issue, ParseResult } from "./types";

const NODE_TARGET: ReadonlySet<GraphEdge["type"]> = new Set(["references", "verifies", "specifies", "covers", "imports", "triggers", "tags"]);

export function assemble(parts: ParseResult, now: string, registries?: Record<string, string>): Graph {
  const byId = new Map<string, GraphNode>();
  const issues: Issue[] = [];
  // Sort nodes by (id, path) before deduplication so duplicate resolution is deterministic
  const sortedNodes = [...parts.nodes].sort((a, b) => {
    const idCmp = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    if (idCmp !== 0) return idCmp;
    return (a.path ?? "") < (b.path ?? "") ? -1 : (a.path ?? "") > (b.path ?? "") ? 1 : 0;
  });
  for (const n of sortedNodes) {
    if (byId.has(n.id)) { issues.push({ kind: "duplicate-id", node: n.id, detail: `id '${n.id}' declared more than once` }); continue; }
    byId.set(n.id, n);
  }
  const ids = new Set(byId.keys());

  // index: bare slug -> [namespaced ids]. Bare slug = id after the "<repo>:" prefix (or the whole id if unprefixed, e.g. REQ-*).
  const bareOf = (id: string) => { const i = id.indexOf(":"); return i >= 0 ? id.slice(i + 1) : id; };
  const slugIndex = new Map<string, string[]>();
  for (const id of ids) { const b = bareOf(id); (slugIndex.get(b) ?? slugIndex.set(b, []).get(b)!).push(id); }

  const edges = parts.edges.map((e) => ({ ...e }));
  for (const e of edges) {
    if (!NODE_TARGET.has(e.type)) continue;
    if (ids.has(e.to)) continue;                      // already a valid node id (e.g. REQ-*)
    const matches = slugIndex.get(e.to) ?? [];
    if (matches.length === 1) { e.to = matches[0]; continue; }   // resolve bare -> namespaced
    if (matches.length > 1) { issues.push({ kind: "ambiguous-link", from: e.from, to: e.to, detail: `${e.type} target '${e.to}' matches ${matches.length} nodes: ${matches.join(", ")}` }); continue; }
    issues.push({ kind: "broken-link", from: e.from, to: e.to, detail: `${e.type} target '${e.to}' is not a node` });
  }

  const inbound = (to: string, types: GraphEdge["type"][]) => edges.some((e) => e.to === to && types.includes(e.type));

  // A requirement is proven if a test `covers` it, or an authored `provenBy` slug resolves
  // to a real test node (mirrors the viewer's provingTests — so CI and the UI never disagree).
  const resolvesToTest = (s: string) =>
    (byId.has(s) ? [s] : slugIndex.get(s) ?? []).some((id) => byId.get(id)?.type === "test");
  const provenByTest = (r: GraphNode) => (r.provenBy ?? []).some(resolvesToTest);
  const isProvenRequirement = (id: string) => {
    const r = byId.get(id);
    return !!r && r.type === "requirement" && (inbound(id, ["covers"]) || provenByTest(r));
  };

  for (const n of byId.values()) {
    if (n.type === "requirement" && !isProvenRequirement(n.id))
      issues.push({ kind: "uncovered-requirement", node: n.id, detail: "no test covers this requirement" });
    // An edge's TARGET has always been validated (broken-link, REQ-KG-CORE-01); a requirement's
    // cited PROOF was not. `provenBy` — where a doc's `covers:` frontmatter lands — kept whatever
    // resolved and silently discarded the rest, so a requirement could cite four proofs, have three
    // name files that do not exist, and still read as fully proven. Reported PER CITATION and
    // independently of coverage: a dead path masked by a live sibling is exactly how the wrong
    // citation survives a rename (REQ-KG-CORE-06).
    if (n.type === "requirement")
      for (const s of n.provenBy ?? [])
        if (!resolvesToTest(s))
          issues.push({ kind: "broken-proof", node: n.id, detail: `cited proof '${s}' is not a test node` });
    if (n.type === "doc" && !n.entrypoint && !inbound(n.id, ["references", "imports"]))
      issues.push({ kind: "orphan-doc", node: n.id, detail: "no inbound references/imports" });
    if (n.type === "doc" && !inbound(n.id, ["verifies"])) {
      // Soft escape hatch: a doc with no test directly `verifies`-ing it as a whole is still
      // honestly "proven" if it `specifies` at least one requirement AND every one of those
      // requirements is independently proven (covers/provenBy resolving to a real test node).
      // This only ever helps a doc whose EVERY claim already traces to a real test — it can
      // never launder a doc that has zero requirements or any unproven one (see buildGraph.test.ts).
      const specifiedReqs = edges.filter((e) => e.from === n.id && e.type === "specifies").map((e) => e.to);
      const selfProven = specifiedReqs.length > 0 && specifiedReqs.every(isProvenRequirement);
      if (!selfProven) issues.push({ kind: "unverified-doc", node: n.id, detail: "no test verifies this doc (soft)" });
    }
  }

  const nodes = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  edges.sort((a, b) => { const ka = a.from + a.type + a.to; const kb = b.from + b.type + b.to; return ka < kb ? -1 : ka > kb ? 1 : 0; });
  issues.sort((a, b) => {
    const ka = [a.kind, a.node ?? "", a.from ?? "", a.to ?? "", a.detail].join("\x00");
    const kb = [b.kind, b.node ?? "", b.from ?? "", b.to ?? "", b.detail].join("\x00");
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  // graph.registries — viewer-only payload (features.yaml basename → raw text) for the
  // in-viewer registry document page. Re-inserted in sorted key order so JSON.stringify
  // (which preserves insertion order) is deterministic across builds; omitted entirely
  // when there is nothing to carry so graphs without registries don't churn.
  const sortedRegistries =
    registries && Object.keys(registries).length > 0
      ? Object.fromEntries(Object.entries(registries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : undefined;

  return { generatedAt: now, nodes, edges, issues, ...(sortedRegistries ? { registries: sortedRegistries } : {}) };
}
