// tools/behavior.mjs
// The behavior grid's face: a requirement may lead with a Given/When/Then triple. Pure and tiny —
// the PRD format is still a decision we are testing, so the parser has no opinions beyond the three
// labels. Absent or partial → null, and the requirement renders prose-only (unchanged behavior).
const LABEL = k => new RegExp('^\\s*-\\s*\\*\\*' + k + '\\*\\*\\s+(.+?)\\s*$', 'm')

export function parseBehavior (body) {
  const g = String(body || '').match(LABEL('Given'))
  const w = String(body || '').match(LABEL('When'))
  const t = String(body || '').match(LABEL('Then'))
  if (!g || !w || !t) return null
  return { given: g[1].trim(), when: w[1].trim(), then: t[1].trim() }
}
