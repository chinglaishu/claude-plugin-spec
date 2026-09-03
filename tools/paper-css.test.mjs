// tools/paper-css.test.mjs — the replica's PAPER PAGE reads its colours from the one design system.
//
// The Expected cell renders the app's own markup inside an `<iframe sandbox srcdoc>`. That document
// is its own: it inherits no stylesheet from board.html, so the paper under the replica, the ring on
// it and the tint on a claimed element cannot be CSS vars — they have to be literal values in the
// srcdoc. The design system is non-negotiable (CLAUDE.md), so they are READ OUT of spec/_design.css
// at build time and handed to the client on the JSON island, exactly as parseScale already reads the
// --scale knob. That is what these pin: no raw hex in client.js, and a token that moves moves both.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseToken, paperCssOf } from './build-board.mjs'
import { designCss } from './spec-store.mjs'

test('parseToken reads a hex token out of the design system', () => {
  const css = ':root {\n  --paper:#fdfcf9;  --card:#fdfcf9;\n  --ai:#2f4a63; --acc:#2f4a63;\n}'
  assert.equal(parseToken(css, 'paper'), '#fdfcf9')
  assert.equal(parseToken(css, 'ai'), '#2f4a63')
})
test('parseToken reads a function-valued token, and says nothing about one that is not there', () => {
  assert.equal(parseToken('--veil: rgba(28,27,24,.12);', 'veil'), 'rgba(28,27,24,.12)')
  assert.equal(parseToken('--paper:#fff;', 'nosuch'), '', 'never a guessed colour')
})
test('parseToken does not answer with a NEIGHBOUR token that merely ends the same way', () => {
  // --ai and --ai-tint sit two lines apart; a loose match would hand the ring its own tint
  const css = '--ai:#2f4a63;\n--ai-tint:#e6eaee;\n'
  assert.equal(parseToken(css, 'ai'), '#2f4a63')
  assert.equal(parseToken(css, 'ai-tint'), '#e6eaee')
})

test('paperCssOf is the replica page\'s whole palette, and every colour of it comes from _design.css', () => {
  const css = designCss()
  const p = paperCssOf(css)
  assert.deepEqual(Object.keys(p).sort(),
    ['hair', 'halo', 'paper', 'plate', 'ring', 'ringFail', 'tintFixed', 'tintOk', 'veil'])
  for (const [k, v] of Object.entries(p)) {
    assert.ok(v, k + ' resolved to nothing — the token was renamed or removed')
    assert.ok(/^#[0-9a-f]{3,8}$/i.test(v) || /^rgba?\(/.test(v), k + ' is not a colour: ' + v)
    // the two the overlay states literally (spec/_base.ts renderOverlay) rather than by token
    if (k !== 'veil' && k !== 'halo') assert.ok(css.includes(v), k + ' (' + v + ') is not a value _design.css declares')
  }
  // the ring is the overlay's OWN ring colour, and its failed variant the overlay's own red, so the
  // replica's ring and the burned one in the photograph beside it can never be two different inks
  assert.equal(p.ring, parseToken(css, 'ai'))
  assert.equal(p.ringFail, parseToken(css, 'bengara'))
  // and the two claim tints are the system's passing and re-look dyes, never a new colour (a new
  // status colour needs the human's sign-off — CLAUDE.md)
  assert.equal(p.tintOk, parseToken(css, 'koke'))
  assert.equal(p.tintFixed, parseToken(css, 'bengara'))
})
