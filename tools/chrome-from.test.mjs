// Phase 7 — A SCREEN WITH NO UI BORROWS A SIBLING'S CHROME.
//
// A screen nobody has tested yet has no harvest, so it has no replica: its Expected cell is the
// archetype SKETCH drawn from the sentence. Shown on bare paper that sketch reads as a diagram from
// another product; shown inside a SIBLING screen's captured page — the app's own header and sidebar
// around it — it reads as this product's screen, not yet built. Two derivations make that possible,
// and both are pure and pinned here:
//
//   chromeFrom(screen, screens)  — WHOSE chrome. Same area first, then the screen with the most
//                                  requirements, then by name; only a screen that actually has a
//                                  captured Before page can lend one.
//   contentRect(layout)          — WHERE the sketch goes in it: the page minus the shell bands the
//                                  harvest measured (a full-width header, a full-height rail).
//
// Both are read at build time by tools/build-board.mjs and baked as data-ev-chrome; the client only
// renders what they decided.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromeFrom } from './spec-store.mjs'
import { contentRect } from './evidence.mjs'

const S = (name, area, nreqs, lends = true) => ({
  name,
  area,
  title: name[0].toUpperCase() + name.slice(1),
  reqs: Array.from({ length: nreqs }, (_, i) => ({ id: 'R' + (i + 1) })),
  chrome: lends ? { replica: `spec/${name}/evidence/R1.b1.before.expected.html`, vw: 1440, vh: 900, content: { x: 0, y: 60, w: 1440, h: 840 } } : null
})

test('chromeFrom prefers a screen in the same area', () => {
  const me = { name: 'newone', area: 'Core' }
  const got = chromeFrom(me, [S('board', 'Core', 3), S('dispatch', 'Running', 90), me])
  assert.equal(got.screen, 'board')
  assert.equal(got.title, 'Board')
  assert.equal(got.replica, 'spec/board/evidence/R1.b1.before.expected.html')
})

test('chromeFrom takes the screen with the most requirements inside that area', () => {
  const me = { name: 'newone', area: 'Core' }
  const got = chromeFrom(me, [S('conflicts', 'Core', 5), S('board', 'Core', 24), S('init', 'Setup', 40)])
  assert.equal(got.screen, 'board')
})

test('chromeFrom falls back to any screen when the area has no other', () => {
  const me = { name: 'newone', area: 'Nowhere' }
  const got = chromeFrom(me, [S('conflicts', 'Core', 5), S('init', 'Setup', 9)])
  assert.equal(got.screen, 'init')
})

test('chromeFrom is deterministic on a tie — by name', () => {
  const me = { name: 'newone', area: 'Core' }
  const a = chromeFrom(me, [S('zeta', 'Core', 4), S('alpha', 'Core', 4)])
  const b = chromeFrom(me, [S('alpha', 'Core', 4), S('zeta', 'Core', 4)])
  assert.equal(a.screen, 'alpha')
  assert.equal(b.screen, 'alpha')
})

test('chromeFrom never lends a screen that has no captured page, and never itself', () => {
  const me = { name: 'newone', area: 'Core' }
  assert.equal(chromeFrom(me, [S('board', 'Core', 20, false)]), null)
  assert.equal(chromeFrom(me, [{ ...S('newone', 'Core', 20), name: 'newone' }]), null)
  assert.equal(chromeFrom(me, []), null)
  assert.equal(chromeFrom(null, [S('board', 'Core', 3)]), null)
})

// ── contentRect: the hole in the shell ────────────────────────────────────────────────────────
const lay = els => ({ w: 1440, h: 900, els })
const BOX = (x, y, w, h, extra = {}) => ({ x, y, w, h, bg: '244,241,234', ...extra })

test('contentRect subtracts a full-width header and a full-height rail', () => {
  const got = contentRect(lay([
    BOX(0, 0, 1440, 1915),        // the page itself — never a band
    BOX(0, 0, 1440, 60),          // the header
    BOX(0, 60, 240, 1855),        // the sidebar (taller than the viewport)
    BOX(240, 60, 1200, 800)       // the content — neither hugs two edges at full span
  ]))
  assert.deepEqual(got, { x: 240, y: 60, w: 1200, h: 840 })
})

test('contentRect ignores an unpainted band — a plate is a painted box', () => {
  const got = contentRect(lay([
    { x: 0, y: 0, w: 1440, h: 60 },   // no bg: nothing is drawn there
    BOX(0, 0, 1440, 40)
  ]))
  assert.deepEqual(got, { x: 0, y: 40, w: 1440, h: 860 })
})

test('contentRect is the whole page when the harvest measured no shell at all', () => {
  assert.deepEqual(contentRect(lay([BOX(0, 0, 1440, 1915)])), { x: 0, y: 0, w: 1440, h: 900 })
  assert.deepEqual(contentRect(lay([])), { x: 0, y: 0, w: 1440, h: 900 })
})

test('contentRect refuses to shrink the page to nothing', () => {
  // two rails that would leave a sliver: the shell is not readable as a frame, so the page stands
  const got = contentRect(lay([BOX(0, 0, 700, 1915), BOX(740, 0, 700, 1915)]))
  assert.deepEqual(got, { x: 0, y: 0, w: 1440, h: 900 })
})

test('contentRect needs a viewport', () => {
  assert.equal(contentRect(null), null)
  assert.equal(contentRect({ w: 0, h: 0, els: [] }), null)
})

// ── I1 (fix round 1): the FOLD IS NOT THE PAGE'S BOTTOM EDGE ──────────────────────────────────
// Every Before replica is a scrolling DOCUMENT — the board's own is `data-replica-region="0 0 1440
// 1904"` measured in a 1440×900 viewport — so "a wide box whose bottom reaches vh" is not a footer,
// it is whatever content happens to cross the fold. On the one real lender this repo has, that is
// the home page's last area card (1318×273 at y=814, reaching 1087), and the hole came back 86 px
// short with the lender's own card showing under a caption that says the row is a sketch.
// Two rules changed: the page's bottom is the DOCUMENT's, and a band must HUG the axis it spans.
const BOARD_ELS = [
  { x: 0, y: 0, w: 1440, h: 61, bg: '253,252,249' },        // the top bar — a real header
  { x: 61, y: 89, w: 1318, h: 42, bg: '244,241,234' },      // …and three centred cards, none of them a band
  { x: 61, y: 294, w: 1318, h: 506, bg: '244,241,234' },
  { x: 61, y: 814, w: 1318, h: 273, bg: '244,241,234' }     // this one crosses the fold and used to read as a footer
]
test('contentRect: the board lender\'s own numbers — a card that crosses the fold is not a footer', () => {
  assert.deepEqual(contentRect({ w: 1440, h: 900, els: BOARD_ELS }, 1904), { x: 0, y: 61, w: 1440, h: 839 })
})

test('contentRect: a band must hug the axis it spans, so a centred wide card is content', () => {
  // same card, on a page that really does end at the fold: still not a band, because it starts 61px
  // in and stops 61px short — a header or footer runs edge to edge
  assert.deepEqual(contentRect({ w: 1440, h: 900, els: [{ x: 61, y: 700, w: 1318, h: 200, bg: '1,1,1' }] }, 900),
    { x: 0, y: 0, w: 1440, h: 900 })
})

test('contentRect: a real footer on a page that ENDS at the fold is still subtracted', () => {
  assert.deepEqual(contentRect({ w: 1440, h: 900, els: [{ x: 0, y: 840, w: 1440, h: 60, bg: '1,1,1' }] }, 900),
    { x: 0, y: 0, w: 1440, h: 840 })
})

test('contentRect: a footer at the bottom of a LONG document never shrinks the visible hole', () => {
  // it sits at y=1844 in a 1904px document — a thousand pixels below anything the cell shows
  assert.deepEqual(contentRect({ w: 1440, h: 900, els: [{ x: 0, y: 1844, w: 1440, h: 60, bg: '1,1,1' }] }, 1904),
    { x: 0, y: 0, w: 1440, h: 900 })
})

test('contentRect: with no document height it falls back to the viewport, as before', () => {
  assert.deepEqual(contentRect({ w: 1440, h: 900, els: [{ x: 0, y: 840, w: 1440, h: 60, bg: '1,1,1' }] }),
    { x: 0, y: 0, w: 1440, h: 840 })
})
