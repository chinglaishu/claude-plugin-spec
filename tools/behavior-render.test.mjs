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
