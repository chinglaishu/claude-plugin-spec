// tools/reqhash.mjs — the shared requirement-text hash (the human, 2026-08-19).
//
// Three features (Changed-drift, evidence rendering, requirement schematics) all need to know "the
// requirement text moved". They share this ONE pure module, at TWO scopes:
//   meaningText(body)      — the proof/Changed scope: the whole body, dated author-notes excluded.
//   behaviorText(behavior) — the picture-pin scope: just the parsed behavior block (given + beats).
// Pure on purpose: node:crypto is the ONLY import. behaviorText takes an ALREADY-PARSED
// {given, beats} object (the caller passes r.behavior) so this module never imports
// behavior.mjs, fs, or anything stateful.

import crypto from 'node:crypto'

// Collapse ALL runs of whitespace (spaces, tabs, newlines) to a single space, trim.
// '' for null/undefined/empty — so every scope hashes from a stable single-line form.
export function normalize (text) {
  if (text == null || text === '') return ''
  return String(text).replace(/\s+/g, ' ').trim()
}

// Remove the PRD's dated author-notes. A note is a FULLY-ITALIC PARAGRAPH: split on blank lines;
// drop any paragraph whose trimmed text starts with a single `*` (not `**`) and ends with a single
// `*` (not `**`). The paragraph — not the line — is the unit, because real notes span multiple
// lines inside one *…* block. Everything else is kept verbatim (paragraphs rejoined with \n\n).
export function stripNotes (body) {
  if (body == null || body === '') return ''
  const paragraphs = String(body).split(/\n[ \t]*\n/)
  const kept = paragraphs.filter(p => {
    const t = p.trim()
    const startsItalic = t.startsWith('*') && !t.startsWith('**')
    const endsItalic = t.endsWith('*') && !t.endsWith('**')
    return !(startsItalic && endsItalic && t.length >= 2)
  })
  return kept.join('\n\n')
}

// The proof/Changed scope: whole body, notes out, whitespace-normalized.
export function meaningText (body) {
  return normalize(stripNotes(body))
}

// The picture-pin scope: the parsed block (or null → ''). Takes the parsed object, never the raw
// body. Serializes given + every When/Then beat in document order, single-space joined — for a
// 1-beat block this is BYTE-IDENTICAL to the pre-beats `given when then` serialization (pinned in
// tools/reqhash.test.mjs), so a hash stamped before the grammar grew never moves. The legacy flat
// {given, when, then} shape (pre-D1 parses, old fixtures) is tolerated as exactly one beat.
export function behaviorText (behavior) {
  if (behavior == null) return ''
  const beats = behavior.beats || [{ when: behavior.when, then: behavior.then }]
  return normalize([behavior.given, ...beats.flatMap(b => [b.when, b.then])].join(' '))
}

// Stable short digest of text AS GIVEN — callers pass meaningText(...) / behaviorText(...).
// First 16 hex chars of sha256: short, stable, collision-safe enough for text-pinning.
export function reqHash (text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
}

// stamp is a previously stored reqHash hex string; stale means the text no longer matches it.
export function isStale (stamp, text) {
  return reqHash(text) !== stamp
}

// Changed — board R4's fifth word (the human, 2026-08-19): a test proved this requirement before,
// but its TEXT has moved since that proof. A MODIFIER ON PASSED ONLY — Failed / Not-reached /
// Untested keep their word; a requirement with no pin was never proven, so it cannot be Changed.
// `status` is the four-word fold (deriveReqStatus), `provenHash` the pin stamped at the last
// passing fold, `currentBody` the requirement's body as it reads now (notes excluded via
// meaningText, so a dated provenance edit never flips it). Pure, so spec-store's derivation is
// unit-testable without a tree (tools/reqhash.test.mjs).
export function isChanged (status, provenHash, currentBody) {
  return status === 'passed' && provenHash != null && isStale(provenHash, meaningText(currentBody))
}
