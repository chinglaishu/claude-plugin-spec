import type { Graph } from "./types";
import { countIssuesByKind } from "./check";

export interface Delta {
  added: { type: string; ids: string[] }[];
  removed: { type: string; ids: string[] }[];
  newlyFailing: string[];
  newlyPassing: string[];
  issueDeltas: { kind: string; before: number; after: number }[];
}

function groupByType(ids: string[], lookup: Map<string, string>): { type: string; ids: string[] }[] {
  const by: Record<string, string[]> = {};
  for (const id of ids) (by[lookup.get(id) ?? "?"] ??= []).push(id);
  return Object.entries(by).sort().map(([type, ids]) => ({ type, ids: ids.sort() }));
}

export function computeDelta(oldGraph: Graph | null, newGraph: Graph): Delta | null {
  if (!oldGraph) return null;
  const oldById = new Map(oldGraph.nodes.map((n) => [n.id, n]));
  const newById = new Map(newGraph.nodes.map((n) => [n.id, n]));
  const types = new Map([...oldGraph.nodes, ...newGraph.nodes].map((n) => [n.id, n.type]));
  const addedIds = newGraph.nodes.filter((n) => !oldById.has(n.id)).map((n) => n.id);
  const removedIds = oldGraph.nodes.filter((n) => !newById.has(n.id)).map((n) => n.id);
  const newlyFailing: string[] = [], newlyPassing: string[] = [];
  for (const n of newGraph.nodes) {
    if (n.type !== "test") continue;
    const prev = oldById.get(n.id);
    if (!prev) continue;
    if (n.status === "fail" && prev.status !== "fail") newlyFailing.push(n.id);
    if (n.status === "pass" && prev.status === "fail") newlyPassing.push(n.id);
  }
  const before = countIssuesByKind(oldGraph.issues), after = countIssuesByKind(newGraph.issues);
  const issueDeltas = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    .filter((k) => (before[k] ?? 0) !== (after[k] ?? 0))
    .map((kind) => ({ kind, before: before[kind] ?? 0, after: after[kind] ?? 0 }));
  return { added: groupByType(addedIds, types), removed: groupByType(removedIds, types), newlyFailing: newlyFailing.sort(), newlyPassing: newlyPassing.sort(), issueDeltas };
}

export function formatDelta(d: Delta | null): string[] {
  if (!d) return ["first sync — no previous graph to compare against"];
  const lines: string[] = [];
  for (const g of d.added) lines.push(`+${g.ids.length} ${g.type} (${g.ids.join(", ")})`);
  for (const g of d.removed) lines.push(`-${g.ids.length} ${g.type} (${g.ids.join(", ")})`);
  if (d.newlyFailing.length) lines.push(`newly failing: ${d.newlyFailing.join(", ")}`);
  if (d.newlyPassing.length) lines.push(`newly passing: ${d.newlyPassing.join(", ")}`);
  for (const i of d.issueDeltas) lines.push(`${i.kind} ${i.before} → ${i.after} ${i.after < i.before ? "✓" : "⚠"}`);
  if (!lines.length) lines.push("no changes since last sync");
  return lines;
}
