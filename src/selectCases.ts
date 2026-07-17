import type { Graph } from "./types";

export interface RunnableCase { caseId: string; spec: string; playwrightTitle: string }
const bare = (id: string) => (id.includes(":") ? id.slice(id.indexOf(":") + 1) : id).toLowerCase();

export function casesForScope(g: Graph, flow?: string, caseIds?: string[]): RunnableCase[] {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const wanted = caseIds?.map((c) => c.toLowerCase());
  let tests = g.nodes.filter((n) => n.type === "test" && n.kind === "e2e" && n.spec && n.playwrightTitle);
  if (flow) {
    const flowFeatures = new Set(g.nodes.filter((n) => n.type === "feature" && n.flow === flow).map((n) => n.id));
    const tagged = new Set(g.edges.filter((e) => e.type === "tags" && flowFeatures.has(e.to)).map((e) => e.from));
    tests = tests.filter((t) => tagged.has(t.id));
  }
  if (wanted) tests = tests.filter((t) => wanted.includes(bare(t.id)));
  return tests.map((t) => ({ caseId: bare(t.id), spec: t.spec!, playwrightTitle: t.playwrightTitle! }))
    .sort((a, b) => (a.caseId < b.caseId ? -1 : 1));
}
