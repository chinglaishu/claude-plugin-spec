// The PRD detail column renders requirement prose as light markdown. This proves the renderer so a
// PRD carrying a list, a code span, bold, or an author's <!-- note --> reads as formatted text
// rather than raw markup — the failure the board showed when a crawled PRD landed with <!-- --> in
// the middle of every sentence and **bold** as literal asterisks. Pure function: no board, no
// browser (node --test).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderBody } from './build-board.mjs'

test('bold renders as <strong>, never literal asterisks', () => {
  const h = renderBody('nesting is **bounded** to a chain')
  assert.match(h, /<strong>bounded<\/strong>/)
  assert.doesNotMatch(h, /\*\*/)
})

test('inline code renders as <code>, never literal backticks', () => {
  const h = renderBody('the `AssetPlanCFCompareChart` is plotted')
  assert.match(h, /<code>AssetPlanCFCompareChart<\/code>/)
  assert.doesNotMatch(h, /`/)
})

test('single asterisks still render as <em>', () => {
  const h = renderBody('*Corrected 2026-07-28: it changed*')
  assert.match(h, /<em>Corrected 2026-07-28: it changed<\/em>/)
})

test('a dash list renders as <ul><li>, never literal dashes', () => {
  const h = renderBody('what it shows:\n\n- Base always\n- Plan after a run')
  assert.match(h, /<ul>/)
  assert.equal([...h.matchAll(/<li>/g)].length, 2)
  assert.match(h, /<li>Base always<\/li>/)
  assert.doesNotMatch(h, /- Base always/)
})

test('an HTML author-note is muted, never shown as raw <!-- -->', () => {
  const h = renderBody('run the plan <!-- label "Run plan" then "Re-run plan" --> to recompute')
  assert.doesNotMatch(h, /<!--/)         // no raw comment delimiter reaches the page
  assert.match(h, /class="cmt"/)         // rendered as a muted note
  assert.match(h, /Run plan/)            // the hint text is kept, not silently dropped
})

test('a comment spanning a blank line does not shatter the paragraphs around it', () => {
  const h = renderBody('before\n\n<!-- a\n\nmultiline note -->\n\nafter')
  assert.doesNotMatch(h, /<!--/)
  assert.match(h, /before/)
  assert.match(h, /after/)
})

test('HTML in prose is escaped — a PRD is untrusted text authored by anyone', () => {
  const h = renderBody('a <script>alert(1)</script> tag')
  assert.doesNotMatch(h, /<script>/)
  assert.match(h, /&lt;script&gt;/)
})

test('blank lines separate paragraphs', () => {
  const h = renderBody('first para\n\nsecond para')
  assert.equal([...h.matchAll(/<p>/g)].length, 2)
})
