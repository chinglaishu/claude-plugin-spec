import type { ConflictFinding } from "./types";

export type DecisionStatus = "open" | "dismissed" | "resolved";
/** A user's triage decision for one finding. Mutable runtime overlay — NOT in the deterministic
 *  graph (so `check` stays byte-honest). Keyed by finding id (hash of subject+scope), so a
 *  decision survives a re-scan (REQ-KG-CONF-05 stickiness). */
export interface Decision { status: DecisionStatus; positionId?: string; note?: string; at?: string; }
export type Decisions = Record<string, Decision>;

/** Tolerant parse: null / malformed / non-object → {} (never throws). */
export function readDecisions(json: string | null): Decisions {
  if (!json) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return {}; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as Decisions;
}

/** Immutable update. Resetting to `open` removes the entry so the finding returns to its default. */
export function applyDecision(decisions: Decisions, findingId: string, d: Decision): Decisions {
  const next = { ...decisions };
  if (d.status === "open") delete next[findingId];
  else next[findingId] = d;
  return next;
}

/** Stable, sorted-key serialization so the committed decisions file diffs cleanly. */
export function serializeDecisions(decisions: Decisions): string {
  const sorted: Decisions = {};
  for (const k of Object.keys(decisions).sort()) sorted[k] = decisions[k];
  return JSON.stringify(sorted, null, 2);
}

/** The effective status per current finding: stored decision if its finding still exists, else
 *  `open` by default. A decision whose finding is gone (subject changed / resolved away) is pruned. */
export function decisionsFor(findings: ConflictFinding[], decisions: Decisions): Decisions {
  const live = new Set(findings.map((f) => f.id));
  const out: Decisions = {};
  for (const f of findings) out[f.id] = live.has(f.id) && decisions[f.id] ? decisions[f.id] : { status: "open" };
  return out;
}
