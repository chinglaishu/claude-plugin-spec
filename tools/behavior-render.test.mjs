// renderBehavior turns a parsed Given/When/Then triple (tools/behavior.mjs) into the structured block
// that LEADS a requirement's detail, above its prose. A prose-only requirement (parseBehavior → null)
// must render NOTHING extra — the empty-string contract, so the board is byte-for-byte unchanged for
// every requirement that does not carry the triple. Pure function: no board, no browser (node --test).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderBehavior } from './build-board.mjs'

test('a Given/When/Then triple renders as a .behavior block with three .brow rows carrying the text', () => {
  const h = renderBehavior({ given: 'a list with items', when: 'you clear', then: 'the list is empty' })
  assert.match(h, /class="behavior"/)                          // wrapped in the block
  assert.equal([...h.matchAll(/class="brow/g)].length, 3)      // exactly three rows — Given/When/Then
  assert.match(h, /a list with items/)                         // …each carrying its own text
  assert.match(h, /you clear/)
  assert.match(h, /the list is empty/)
})

test('null (a prose-only requirement) renders exactly the empty string — no wrapper, no empty block', () => {
  assert.equal(renderBehavior(null), '')   // the no-empty-block contract: nothing extra for prose-only
})

test('the three values are HTML-escaped — a PRD is untrusted text authored by anyone', () => {
  const h = renderBehavior({ given: 'a <script>x</script>', when: 'b & c', then: 'd' })
  assert.doesNotMatch(h, /<script>/)       // the only tags in the output are the ones this function emits
  assert.match(h, /&lt;script&gt;/)
})

// ── beats (D1, spec 2026-08-20) ─────────────────────────────────────────────
// Captured VERBATIM from renderBehavior BEFORE the beats change (task 12) — the byte-identity pin:
// a 1-beat block must emit exactly what the flat triple emitted, so board.html (whose five behavior
// blocks are all 1-beat) has zero churn. If this fixture ever needs editing, that IS the defect.
const ONE_BEAT_FIXTURE = '<div class="behavior"><div class="brow bgiven"><span class="blab">Given</span><span class="btxt">a list with items</span></div><div class="brow bwhen"><span class="blab">When</span><span class="btxt">you clear</span></div><div class="brow bthen"><span class="blab">Then</span><span class="btxt">the list is empty</span></div></div>'

test('PIN: a 1-beat block renders byte-identical to the pre-beats triple markup', () => {
  const h = renderBehavior({ given: 'a list with items', beats: [{ when: 'you clear', then: 'the list is empty' }] })
  assert.equal(h, ONE_BEAT_FIXTURE)
})

test('N beats render as 1 + 2N .brow rows, in beat order', () => {
  const h = renderBehavior({ given: 'g', beats: [{ when: 'w1', then: 't1' }, { when: 'w2', then: 't2' }] })
  assert.equal([...h.matchAll(/class="brow/g)].length, 5)     // Given + (When,Then) × 2
  const order = [...h.matchAll(/class="brow b(\w+)[^"]*"/g)].map(m => m[1])   // [^"]* — a row may carry a modifier (beatstart)
  assert.deepEqual(order, ['given', 'when', 'then', 'when', 'then'])
  for (const s of ['w1', 't1', 'w2', 't2']) assert.match(h, new RegExp(s))
  // Task 8 (the frozen mockup's behavior table) marked every beat after the first `beatstart` — the
  // heavier rule between beats — and numbered the labels `When¹ · Then¹ · When² …`. The SUPERSCRIPTS
  // ARE GONE (the human, 2026-09-02: "hard to read and not intuitive"): a label is plain `When` /
  // `Then` at every beat count, and the reader says which beat you are on with the storyline row's
  // own eyebrow (`.sbeye` — `2` `of 3`, a ringed numeral beside the sentence). This assertion was the
  // superscripts' pin; it is now their absence, because a stray `¹` in the baked markup is exactly
  // what would put them back on the page (rule 6 — the fixture moved, and here is why).
  assert.doesNotMatch(h, /<sup/)
  assert.match(h, /<span class="blab">When<\/span>/)
  assert.match(h, /<span class="blab">Then<\/span>/)
  assert.equal([...h.matchAll(/beatstart/g)].length, 1)
  assert.match(h, /class="brow bwhen beatstart"/)
})
