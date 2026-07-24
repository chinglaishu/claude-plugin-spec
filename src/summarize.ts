import type { Graph, GraphNode, Health, HealthFlow } from "./types";

/**
 * Flow keys come from the PROJECT's own `*.features.yaml`, so their display names belong to the
 * project too — a flow renders under whatever key it declared.
 *
 * This used to be a lookup table of one particular project's eight product surfaces, which every
 * installed copy then rendered as its own flow taxonomy. REQ-0's grep never caught it because it
 * names no project — the assumption survived without the name, which is precisely the gap §12.14
 * predicted.
 *
 * `other` stays: it is the tool's OWN bucket for features that declare no flow, not a borrowed one.
 */
export const FLOW_LABELS: Record<string, string> = { other: "Platform & docs" };

export const KIND_LABELS: Record<string, string> = {
  "uncovered-requirement": "promise without a test",
  "unverified-doc": "no test proves this document",
  "orphan-doc": "document not referenced anywhere",
  "untracked-e2e": "test not registered in the catalog",
  "broken-link": "broken reference",
  "ambiguous-link": "ambiguous reference",
  "duplicate-id": "duplicate name",
};

const bare = (id: string) => (id.includes(":") ? id.slice(id.indexOf(":") + 1) : id).toLowerCase();

/** Requirement id → sorted, deduped array of proving test nodes (covers-edge tests + provenBy-resolved tests). */
export function provingTestsOf(g: Graph): Map<string, GraphNode[]> {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const bareIx = new Map<string, GraphNode[]>();
  for (const n of g.nodes) (bareIx.get(bare(n.id)) ?? bareIx.set(bare(n.id), []).get(bare(n.id))!).push(n);
  const result = new Map<string, Map<string, GraphNode>>();
  const add = (reqId: string, t: GraphNode) => {
    const m = result.get(reqId) ?? result.set(reqId, new Map()).get(reqId)!;
    m.set(t.id, t);
  };
  for (const e of g.edges) {
    if (e.type !== "covers") continue;
    const t = byId.get(e.from);
    if (t?.type === "test") add(e.to, t);
  }
  for (const r of g.nodes) {
    if (r.type !== "requirement") continue;
    for (const s of r.provenBy ?? []) {
      for (const n of bareIx.get(s.toLowerCase()) ?? []) {
        if (n.type === "test") add(r.id, n);
      }
    }
  }
  const out = new Map<string, GraphNode[]>();
  for (const [reqId, m] of result) out.set(reqId, [...m.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
  return out;
}

/** Requirement id → flow (specifies-edge source: feature.flow, else "other"); last-edge-wins semantics. */
export function reqFlowOf(g: Graph): Map<string, string> {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const reqFlow = new Map<string, string>();
  for (const e of g.edges) {
    if (e.type !== "specifies") continue;
    const src = byId.get(e.from);
    reqFlow.set(e.to, src?.type === "feature" && src.flow ? src.flow : "other");
  }
  return reqFlow;
}

export function healthForGraph(g: Graph): Health {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const features = g.nodes.filter((n) => n.type === "feature");
  const reqs = g.nodes.filter((n) => n.type === "requirement");
  const tagsTo = new Map<string, GraphNode[]>();       // featureId -> test nodes
  for (const e of g.edges) {
    if (e.type !== "tags") continue;
    const t = byId.get(e.from);
    if (t?.type === "test") (tagsTo.get(e.to) ?? tagsTo.set(e.to, []).get(e.to)!).push(t);
  }
  // proven = covers edge from an existing test, or a provenBy slug resolving to a test (mirrors viewer provingTests)
  const proving = provingTestsOf(g);
  const isProven = (r: GraphNode) => (proving.get(r.id)?.length ?? 0) > 0;
  // flow of a requirement = flow of the feature that specifies it; doc-specified → "other"
  const reqFlow = reqFlowOf(g);

  const flowIds = [...new Set([...features.map((f) => f.flow ?? "other"), ...reqs.map((r) => reqFlow.get(r.id) ?? "other")])].sort();
  const flows: HealthFlow[] = flowIds.map((flow) => {
    const feats = features.filter((f) => (f.flow ?? "other") === flow);
    const testsOf = (f: GraphNode) => tagsTo.get(f.id) ?? [];
    const flowTests = [...new Map(feats.flatMap(testsOf).map((t) => [t.id, t])).values()];
    const flowReqs = reqs.filter((r) => (reqFlow.get(r.id) ?? "other") === flow);
    const e2eRunAts = flowTests.filter((t) => t.kind === "e2e" && t.runAt).map((t) => t.runAt!).sort();
    return {
      flow, label: FLOW_LABELS[flow] ?? flow,
      capabilities: feats.length,
      tested: feats.filter((f) => testsOf(f).length > 0).length,
      untested: feats.filter((f) => testsOf(f).length === 0).map((f) => f.title).sort(),
      failing: flowTests.filter((t) => t.status === "fail").map((t) => ({ id: t.id, title: t.title })).sort((a, b) => (a.id < b.id ? -1 : 1)),
      flaky: flowTests.filter((t) => t.flaky).map((t) => ({ id: t.id, title: t.title })).sort((a, b) => (a.id < b.id ? -1 : 1)),
      reqTotal: flowReqs.length,
      reqProven: flowReqs.filter(isProven).length,
      unproven: flowReqs.filter((r) => !isProven(r)).map((r) => r.text ?? r.title).sort(),
      lastVerified: e2eRunAts[0] ?? null,
    };
  });
  return {
    flows,
    totals: {
      features: features.length,
      tested: flows.reduce((a, f) => a + f.tested, 0),
      reqTotal: reqs.length,
      reqProven: flows.reduce((a, f) => a + f.reqProven, 0),
      failing: new Set(flows.flatMap((f) => f.failing.map((t) => t.id))).size,
      flaky: new Set(flows.flatMap((f) => f.flaky.map((t) => t.id))).size,
    },
  };
}
