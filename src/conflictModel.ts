import { conflictId } from "./conflictId";
import type { ConflictAxis, ConflictFinding, ConflictParticipant, ConflictPosition } from "./types";

const KINDS = new Set(["doc", "code", "req", "test"]);
const SEVERITIES = new Set(["high", "med", "low"]);

/** doc/req/test all read as the "doc" side; only `code` participants pull toward code. */
export function deriveAxis(participants: ConflictParticipant[]): ConflictAxis {
  const hasCode = participants.some((p) => p.kind === "code");
  const hasDoc = participants.some((p) => p.kind !== "code");
  return hasCode && hasDoc ? "mixed" : hasCode ? "code" : "doc";
}

/** Validate a raw finding against the cluster invariant (REQ-KG-CONF-01), stamp its stable id
 *  (REQ-KG-CONF-05) and derived axis, or return null (the caller skips it). A valid finding has
 *  a subject, at least two participants and two positions, and every participant's positionId
 *  references a declared position. */
export function normalizeFinding(raw: unknown, scope: string): ConflictFinding | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const subject = typeof r.subject === "string" ? r.subject.trim() : "";
  if (!subject) return null;

  const positions = Array.isArray(r.positions) ? (r.positions as ConflictPosition[]) : [];
  const participants = Array.isArray(r.participants) ? (r.participants as ConflictParticipant[]) : [];
  if (participants.length < 2 || positions.length < 2) return null;

  const positionIds = new Set(positions.map((p) => p?.id));
  for (const p of participants) {
    if (!p || !KINDS.has(p.kind) || typeof p.ref !== "string" || typeof p.quote !== "string") return null;
    if (!positionIds.has(p.positionId)) return null; // dangling camp reference
  }

  const severity = SEVERITIES.has(String(r.severity)) ? (String(r.severity) as ConflictFinding["severity"]) : "med";
  return {
    id: conflictId(subject, scope),
    subject,
    scope,
    category: typeof r.category === "string" && r.category ? r.category : "uncategorized",
    severity,
    axis: deriveAxis(participants),
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    why: typeof r.why === "string" ? r.why : "",
    participants,
    positions,
  };
}
