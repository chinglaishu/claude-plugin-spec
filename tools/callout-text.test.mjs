// THE CALLOUT'S WORDS, PINNED — one sentence per scene, and the SAME one on both sides.
//
// The card anchored to the ring is drawn twice: burned into the recording by spec/_base.ts
// (renderOverlay) and drawn into the schematic by tools/viz.mjs. Until 2026-08-30 each side chose
// its own words and they disagreed mid-beat — the drawing said the When alone while the burn-in
// already claimed the Then, one scene before that Then existed. And both stacked the requirement
// TITLE, the When AND the Then onto every card, which is a paragraph floating over the app.
//
// The human, 2026-08-30: "only have to include the text for current small step (as less text as
// possible) — and both the schematic and proof need to have exact same text."
//
// So the rule lives here, once, exactly as the geometry does (tools/overlay-geometry.mjs, 8eab487),
// and both sides import it. These tests pin the rule itself; tools/viz.test.mjs pins that the
// DRAWING obeys it and spec/board/test.spec.ts (board R10/R19) pins that the BURN-IN does.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calloutText, sceneDone, CALLOUT_TYPE, calloutLines, calloutLabelWidth, calloutColWidth } from './callout-text.mjs'

const BEAT = {
  id: 'R5',
  when: 'you type "Water the plants" and press Add',
  then: 'a new row reads Water the plants and the counter reads 3 to do'
}

test('a scene mid-beat says the WHEN alone — the action, not its result', () => {
  const c = calloutText({ ...BEAT, done: false })
  assert.equal(c.label, 'When')
  assert.equal(c.text, BEAT.when)
  assert.equal(c.id, 'R5')
  assert.equal(c.empty, false)
})

test('the scene the beat comes to rest on says the THEN alone', () => {
  const c = calloutText({ ...BEAT, done: true })
  assert.equal(c.label, 'Then')
  assert.equal(c.text, BEAT.then)
})

test('ONE sentence, never both — neither line ever carries the other', () => {
  for (const done of [false, true]) {
    const c = calloutText({ ...BEAT, done })
    assert.equal(typeof c.text, 'string')
    assert.ok(!c.text.includes(done ? BEAT.when : BEAT.then),
      'the ' + (done ? 'Then' : 'When') + ' scene must not carry the other line')
  }
})

test('the requirement TITLE is not part of the card at all — the id chip is the whole tag', () => {
  const c = calloutText({ ...BEAT, title: 'The remaining counter recounts', done: true })
  assert.equal(c.text, BEAT.then)
  assert.ok(!('title' in c), 'a title a caller passes is simply not carried through')
  assert.ok(!c.text.includes('remaining counter'))
})

test('both sides asking the same question get byte-identical words', () => {
  // the burn-in asks with the beat it is proving; the drawing asks with the beat it is drawing —
  // same beat, same scene, so the two calls must be indistinguishable
  const burned = calloutText({ id: 'R5', when: BEAT.when, then: BEAT.then, done: false })
  const drawn = calloutText({ id: 'R5', when: BEAT.when, then: BEAT.then, done: false })
  assert.deepEqual(burned, drawn)
})

test('an empty half falls back to the half that exists rather than showing a blank card', () => {
  // rule 3 in miniature: a card that says nothing is worse than a card saying the only line there is
  assert.deepEqual(calloutText({ id: 'R1', when: 'you click Save', then: '', done: true }),
    { id: 'R1', label: 'When', text: 'you click Save', empty: false })
  assert.deepEqual(calloutText({ id: 'R1', when: '', then: 'it saves', done: false }),
    { id: 'R1', label: 'Then', text: 'it saves', empty: false })
  const none = calloutText({ id: 'R1', when: '', then: '', done: false })
  assert.equal(none.empty, true)
  assert.equal(none.text, '')
})

test('whitespace is trimmed and a missing id degrades to the empty chip, never "undefined"', () => {
  const c = calloutText({ when: '  you open the board  ', then: 'x', done: false })
  assert.equal(c.text, 'you open the board')
  assert.equal(c.id, '')
})

test('sceneDone: within a beat\'s scene list only the LAST scene is the result', () => {
  // a beat's loop is before → each asserted value → after; the drawing parks on the same list
  assert.deepEqual([0, 1, 2, 3].map(j => sceneDone(j, 4)), [false, false, false, true])
  assert.equal(sceneDone(0, 1), true)      // a one-scene beat rests immediately
  assert.equal(sceneDone(0, 0), false)     // nothing to rest on
})

test('the card\'s ONE line has one type, stated once for both sides', () => {
  // the burn-in writes these px into the page; viz.mjs converts them by its one ratio. Two copies is
  // exactly how the ring drifted, so there is one.
  assert.equal(typeof CALLOUT_TYPE.line, 'number')
  assert.equal(typeof CALLOUT_TYPE.lab, 'number')
  assert.equal(typeof CALLOUT_TYPE.id, 'number')
})

// ── THE WRAP IS ONE SOURCE, SO BOTH CARDS SHOW THE SAME LINES (the human, 2026-08-30/31) ──────────
// The drawn card once capped its sentence at TWO lines with an ellipsis while the burned one wrapped
// the whole sentence — so demo R2's THEN read "…its stamp flips to…" on the schematic and the full
// three lines on the proof: the two cells disagreed on the very text they are meant to share. The
// wrap now lives here, once, and BOTH sides consume it (tools/viz.mjs measureCard/cardRegionBox and
// spec/_base.ts renderOverlay). These pin the rule; tools/viz.test.mjs pins that the drawing obeys it.

// R2's real THEN (quotes dropped so the assertion reads the words, not the escaping) — the case that
// used to truncate. It must wrap to MORE than two lines and lose not a single word.
const LONG_THEN = 'the same row reads the new text in place and its stamp flips to edited just now'

test('calloutLines wraps the WHOLE sentence — a normal Then is never cut to two lines, never ellipsised', () => {
  const lines = calloutLines(LONG_THEN)
  assert.ok(lines.length >= 3, 'R2\'s Then wraps past two lines: got ' + lines.length + ' — ' + JSON.stringify(lines))
  assert.ok(!lines.some(l => l.includes('…')), 'no ellipsis anywhere — the whole sentence is shown')
  assert.equal(lines.join(' ').replace(/\s+/g, ' ').trim(), LONG_THEN, 'every word survives, in order')
})

test('calloutLines is pure and scale-invariant — the same words always break the same way', () => {
  assert.deepEqual(calloutLines(LONG_THEN), calloutLines(LONG_THEN))
  assert.deepEqual(calloutLines(''), [])
  assert.deepEqual(calloutLines('  short  clause  '), ['short clause'])
})

test('the label gutter and text column are one shared measurement, used by both cards', () => {
  const inner = 300 - 2 * 15   // CARD.width - 2·padX
  assert.ok(calloutLabelWidth() > 0, 'a WHEN/THEN gutter is reserved')
  // the column is the card inner width less that gutter, so a wrapped line sits under line 0's text
  assert.ok(calloutColWidth() > 0 && calloutColWidth() < inner, 'the column is narrower than the card inner')
})
