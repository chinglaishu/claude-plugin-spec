import type { ConflictFinding, ConflictParticipant } from "./types";
import type { Decisions } from "./conflictDecisions";

/** One thing the fix command must change: a participant that dissents from the canonical position. */
export interface FixTarget {
  ref: string;
  kind: ConflictParticipant["kind"];
  via: "doc-edit" | "code-tdd"; // dissenting doc/req/test → text edit; dissenting code → TDD + review
  quote: string;
  span?: string;
}
export interface FixPlan {
  findingId: string;
  subject: string;
  scope: string;
  canonicalStatement: string;
  note?: string;
  targets: FixTarget[];
}

/** Given a finding and the chosen canonical position, every NON-canonical participant is a dissenter
 *  that must be fixed — a doc/req/test by text edit, code via TDD + the review gate (REQ-KG-CONF-06).
 *  The fix direction falls out of the participant kind; the caller never picks it per-participant. */
export function fixPlanFor(finding: ConflictFinding, canonicalPositionId: string, note?: string): FixPlan | null {
  const canon = finding.positions.find((p) => p.id === canonicalPositionId);
  if (!canon) return null;
  const targets: FixTarget[] = finding.participants
    .filter((p) => p.positionId !== canonicalPositionId)
    .map((p) => ({ ref: p.ref, kind: p.kind, via: p.kind === "code" ? "code-tdd" : "doc-edit", quote: p.quote, span: p.span }));
  return { findingId: finding.id, subject: finding.subject, scope: finding.scope, canonicalStatement: canon.statement, note, targets };
}

/** Every resolved finding's fix plan (dismissed / open / position-less resolved are skipped), sorted. */
export function fixPlan(findings: ConflictFinding[], decisions: Decisions): FixPlan[] {
  const byId = new Map(findings.map((f) => [f.id, f] as const));
  const plans: FixPlan[] = [];
  for (const [id, d] of Object.entries(decisions)) {
    if (d.status !== "resolved" || !d.positionId) continue;
    const f = byId.get(id);
    if (!f) continue;
    const p = fixPlanFor(f, d.positionId, d.note);
    if (p) plans.push(p);
  }
  return plans.sort((a, b) => (a.findingId < b.findingId ? -1 : a.findingId > b.findingId ? 1 : 0));
}
