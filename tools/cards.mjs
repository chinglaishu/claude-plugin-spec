// The requirement framework's card layer (the human 2026-09-07): the five FIXED buckets, the four
// example slots, each rule card's derived state, and the screen counter. Pure and Playwright-free —
// the one thing this product cannot get wrong is derivation, so it is unit-tested directly
// (tools/cards.test.mjs) and the renderer only DRAWS what this returns. NO state is stored: a
// bucket's/family's state is its cards', a card's state is its stamps + slots + the Conflicts page,
// all read on every build. No new status field, no gate, no draft/guess flag (init R3, board R8).

// The tool OWNS the bucket names and default glosses; a prd's bucket line may override only the gloss.
export const BUCKETS = [
  { key: '①', name: "The main thing's life", gloss: 'create it, change it, finish it, remove it — the screen’s main noun' },
  { key: '②', name: 'Every derived number', gloss: 'anything the app computes: counts, rings, roll-ups, effective rates' },
  { key: '③', name: 'Every view & chip', gloss: 'each view shows the right rows, every badge and chip agrees' },
  { key: '④', name: 'Survival', gloss: 'what outlives a reload, a sign-out, a publish, a navigation' },
  { key: '⑤', name: 'The mistake path', gloss: 'the slip is safe: undo, confirm, refuse, nothing lost' }
]
export const BUCKET_NAME = Object.fromEntries(BUCKETS.map(b => [b.key, b.name]))
// All four are NEEDED unless the card declares one Not needed; a needed-but-unfilled slot is a gap.
export const NEEDED_SLOTS = ['happy', 'boundary', 'absence', 'mistake']

// Group a screen's reqs+families into the fixed five buckets (always all five, in order) plus a
// leading "unbucketed" group for anything before the first bucket line. Placement is by each
// req/family's own `bucket` field; a bucket line's gloss overrides the default.
export function bucketGroups (screen) {
  const reqs = screen.reqs || []
  const families = screen.families || []
  const glossOf = k => (screen.buckets || []).find(b => b.key === k)?.gloss || ''
  const groupFor = bucketKey => {
    const famGroups = families.filter(f => f.bucket === bucketKey)
      .map(f => ({ family: f, reqs: f.ids.map(id => reqs.find(r => r.id === id)).filter(Boolean) }))
      .filter(g => g.reqs.length)
    const loose = reqs.filter(r => r.bucket === bucketKey && r.family == null)
    return { famGroups, loose }
  }
  const buckets = BUCKETS.map(b => {
    const { famGroups, loose } = groupFor(b.key)
    const g = glossOf(b.key)
    return { bucket: { ...b, gloss: g || b.gloss }, families: famGroups, loose, empty: !famGroups.length && !loose.length }
  })
  const u = groupFor(null)
  return { unbucketed: { families: u.famGroups, loose: u.loose, has: !!(u.famGroups.length || u.loose.length) }, buckets }
}

// The slots a card actually covers: its beats' tags (via slots.filled) plus any declared not-needed.
export const filledSlots = req =>
  [...new Set([...(req.slots?.filled || []), ...Object.keys(req.notNeeded || {})])]

// A rule card's gaps: needed slots nobody filled. Question cards have no slots and no gaps.
export const cardGaps = req =>
  req.kind === 'question' ? [] : NEEDED_SLOTS.filter(s => !filledSlots(req).includes(s))

// The req ids on `screen` named as a side of an OPEN finding. A side's source is
// `spec/<screen>/prd.md · R<n>`; the a/b pair is today's shape, `sides` the Part-B shape (both read).
export function conflictReqIds (open, screen) {
  const ids = new Set()
  const re = new RegExp(`spec/${screen}/prd\\.md\\s*·\\s*(\\S+)`)
  const pick = side => { const m = String(side?.source || '').match(re); if (m) ids.add(m[1]) }
  for (const f of open || []) { pick(f.a); pick(f.b); for (const s of f.sides || []) pick(s) }
  return ids
}

// The single badge, in the order the human works them. Precedence conflict > mismatch > agreed; a
// gap is a SLOT-level annotation (a card can be agreed with gaps), not a badge state, and `changed`
// keeps its own indigo chip (orthogonal to this). Question cards are their own state.
export function cardState (req, conflictIds) {
  if (req.kind === 'question') return 'question'
  if (conflictIds && conflictIds.has(req.id)) return 'conflict'
  if (req.status === 'failed' || req.status === 'not-reached') return 'mismatch'
  return 'agreed'
}

// The screen head's counter: rule cards by state, and the total unfilled needed slots. Questions are
// counted nowhere here (they are their own object). Pure — reads open findings, stores nothing.
export function screenCounter (screen, open) {
  const ids = conflictReqIds(open, screen.name)
  let conflicts = 0, gaps = 0, mismatches = 0, agreed = 0
  for (const r of screen.reqs || []) {
    if (r.kind === 'question') continue
    const st = cardState(r, ids)
    if (st === 'conflict') conflicts++
    else if (st === 'mismatch') mismatches++
    else agreed++
    gaps += cardGaps(r).length
  }
  return { conflicts, gaps, mismatches, agreed }
}
