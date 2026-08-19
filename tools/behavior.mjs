// tools/behavior.mjs
// The behavior block's face: a requirement may lead with Given + 1..N (When → Then) beats
// (D1, spec 2026-08-20 — the grammar is a strict superset of the old single triple, which parses
// as a 1-beat chain). Pure and tiny — the PRD format is still a decision we are testing, so the
// parser has no opinions beyond the three labels and their order. Label lines are read in DOCUMENT
// ORDER: exactly one Given first, then strictly alternating When, Then, When, Then… with at least
// one complete pair. Any violation — no Given, a second Given, a When without its Then, a Then
// before any When — is null, and the requirement renders prose-only (the same honesty as the old
// partial→null).
const LINE = /^\s*-\s*\*\*(Given|When|Then)\*\*\s+(.+?)\s*$/gm

export function parseBehavior (body) {
  const seq = [...String(body || '').matchAll(LINE)].map(m => ({ label: m[1], text: m[2].trim() }))
  if (!seq.length || seq[0].label !== 'Given') return null
  const rest = seq.slice(1)
  if (!rest.length || rest.length % 2 !== 0) return null
  const beats = []
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i].label !== 'When' || rest[i + 1].label !== 'Then') return null
    beats.push({ when: rest[i].text, then: rest[i + 1].text })
  }
  return { given: seq[0].text, beats }
}

// parseBehavior's complement, for the render side: renderBehavior draws the beats as the shape, so
// the prose renderer must NOT draw those same lines a second time as a bullet list below it.
// Strip every Given/When/Then beat line (the /g matters — a multi-beat block has many), keep the
// prose that follows. A body without them is returned unchanged (a no-op — the caller only strips
// when a full block is present, so a prose-only requirement stays byte-identical). Same
// `- **Label** ` line shape parseBehavior matches above.
const BEAT_LINE = /^\s*-\s*\*\*(?:Given|When|Then)\*\*\s+.*$/gm
export function stripBehaviorLead (body) {
  return String(body || '').replace(BEAT_LINE, '').trimStart()
}
