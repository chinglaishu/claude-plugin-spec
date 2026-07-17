import { normalizeFinding } from "./conflictModel";
import type { ConflictFinding } from "./types";

/** Parse one <scope>.conflicts.json file into validated findings. Scope = the file's `scope`
 *  field, else the filename stem. Malformed JSON / non-object → [] (never throws, matching the
 *  build's tolerate-and-skip idiom). */
export function parseConflicts(input: { path: string; content: string }): ConflictFinding[] {
  let parsed: unknown;
  try { parsed = JSON.parse(input.content); } catch { return []; }
  if (!parsed || typeof parsed !== "object") return [];
  const obj = parsed as Record<string, unknown>;
  const stem = input.path.replace(/\\/g, "/").split("/").pop()!.replace(/\.conflicts\.json$/, "");
  const scope = typeof obj.scope === "string" && obj.scope ? obj.scope : stem;
  const raw = Array.isArray(obj.findings) ? obj.findings : [];
  const out: ConflictFinding[] = [];
  for (const r of raw) {
    const f = normalizeFinding(r, scope);
    if (f) out.push(f);
  }
  return out;
}

/** Dedupe by id (last wins) then sort by id — byte-stable output (REQ-KG-CONF-04). */
export function foldConflicts(findings: ConflictFinding[]): ConflictFinding[] {
  const byId = new Map<string, ConflictFinding>();
  for (const f of findings) byId.set(f.id, f);
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
