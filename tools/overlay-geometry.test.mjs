// THE ONE GEOMETRY, PINNED.
//
// The burn-in (spec/_base.ts renderOverlay) and the drawn schematic (tools/viz.mjs) are supposed to
// be the same picture — "identical except mock vs real". They drifted anyway, because each carried
// its own copy of the numbers: an audit of the demo's R1 beat cells found the drawn ring reading
// ~12 page px out from the element box where the burned one reads ~5, which on a thin target (a row
// title, a stamp) is a drawn ring twice the height of the photographed one. This module is the fix:
// ONE source for the ring's inset and the callout's placement, imported by both. These tests pin
// the burn-in's own CSS arithmetic, because the burn-in is the reference — it is what the
// photograph actually shows, and the drawing is what has to agree with it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RING, CARD, WASH, ringBox, ringRect, ringOuter, calloutSpot, calloutRect } from './overlay-geometry.mjs'
import { readFileSync } from 'node:fs'
import { paperCssOf } from './build-board.mjs'
import { designCss } from './spec-store.mjs'
import { calloutBoxHeight } from './callout-text.mjs'

const BOX = { x: 312, y: 126, width: 452, height: 46 }
const PAGE = { vw: 1440, vh: 900 }

test('the ring numbers are the burn-in\'s own CSS, not a second opinion', () => {
  // renderOverlay: left/top = box - 4, width/height = box + 8, `2px solid`, radius 6,
  // box-shadow 0 0 0 3px paper
  assert.equal(RING.inset, 4)
  assert.equal(RING.stroke, 2)
  assert.equal(RING.radius, 6)
  assert.equal(RING.halo, 3)
})

test('ringBox is the element the burn-in positions: box - inset, box + 2·inset', () => {
  assert.deepEqual(ringBox(BOX), { x: 308, y: 122, w: 460, h: 54 })
  // the w/h spelling of a box is accepted too — a layout skeleton records it that way
  assert.deepEqual(ringBox({ x: 312, y: 126, w: 452, h: 46 }), { x: 308, y: 122, w: 460, h: 54 })
})

test('ringRect is where a STROKE is drawn: the border\'s centreline, box ± (inset + stroke/2)', () => {
  // a CSS border sits OUTSIDE the element box, so its centreline is 5px out from the target
  assert.deepEqual(ringRect(BOX), { x: 307, y: 121, w: 462, h: 56 })
  assert.equal(ringRect(BOX).x, BOX.x - (RING.inset + RING.stroke / 2))
})

test('ringOuter is the last hard mark: the paper halo\'s outer edge, box ± 9', () => {
  // border box ends at box - 6; `0 0 0 3px` spreads three more
  assert.deepEqual(ringOuter(BOX), { x: 303, y: 117, w: 470, h: 64 })
  assert.equal(ringOuter(BOX).x, BOX.x - (RING.inset + RING.stroke + RING.halo))
})

test('the card is 360 page px (sized up 2026-09-02 from 300), and its notch reaches from a 12px square rotated 45°', () => {
  assert.equal(CARD.width, 360)
  assert.equal(CARD.radius, 12)
  assert.equal(CARD.padX, 18)
  assert.equal(CARD.padY, 14)
  assert.equal(CARD.gap, 12)
  assert.equal(CARD.margin, 12)
  assert.equal(CARD.notch, 12)
  assert.ok(Math.abs(CARD.reach - 12 / Math.SQRT2) < 1e-9, 'half-base and tip reach are both side/√2')
})

test('BELOW first — attached under the target, centred on it', () => {
  const s = calloutSpot({ box: BOX, ...PAGE, cw: CARD.width, ch: 142 })
  assert.equal(s.side, 'below')
  assert.equal(s.top, BOX.y + BOX.height + CARD.gap)
  assert.equal(s.left, BOX.x + BOX.width / 2 - CARD.width / 2)
})

test('ABOVE when below would fall off the page — never a card half off screen', () => {
  const low = { x: 321, y: 740, width: 553, height: 22 }
  const s = calloutSpot({ box: low, ...PAGE, cw: CARD.width, ch: 142 })
  assert.equal(s.side, 'above')
  assert.equal(s.top, low.y - CARD.gap - 142)
  assert.equal(s.left, low.x + low.width / 2 - CARD.width / 2)
})

test('BESIDE when neither vertical placement fits, and the card never covers the target', () => {
  // a tall narrow target: below and above both run off the page, right has room
  const tall = { x: 40, y: 20, width: 60, height: 860 }
  const s = calloutSpot({ box: tall, ...PAGE, cw: CARD.width, ch: 200 })
  assert.equal(s.side, 'right')
  assert.equal(s.left, tall.x + tall.width + CARD.gap)
  const covers = s.left + CARD.width <= tall.x || s.left >= tall.x + tall.width
  assert.ok(covers, 'the card is clear of the box it points at')
})

test('a candidate that would sit ON the target is refused, however well it fits', () => {
  // a target filling the middle of the page: `below` is in view but overlaps nothing…
  const wide = { x: 20, y: 20, width: 1400, height: 500 }
  const s = calloutSpot({ box: wide, ...PAGE, cw: CARD.width, ch: 120 })
  assert.notEqual(s.side, 'none')
  assert.ok(!(s.left + CARD.width > wide.x && s.left < wide.x + wide.width &&
    s.top + 120 > wide.y && s.top < wide.y + wide.height), 'never over the target')
})

test('nothing fits: the roomiest side, clamped into view, and NO notch (side "none")', () => {
  // a target as big as the page — every placement would overlap or fall out
  const huge = { x: 0, y: 0, width: 1440, height: 900 }
  const s = calloutSpot({ box: huge, ...PAGE, cw: CARD.width, ch: 400 })
  assert.equal(s.side, 'none', 'an honest float beats a notch aimed at a box the card sits on')
  assert.ok(s.left >= CARD.margin && s.left + CARD.width <= PAGE.vw - CARD.margin)
  assert.ok(s.top >= CARD.margin && s.top + 400 <= PAGE.vh - CARD.margin)
})

test('the horizontal placement is clamped to the viewport, so an edge target keeps its whole card', () => {
  const edge = { x: 1330, y: 300, width: 90, height: 40 }
  const s = calloutSpot({ box: edge, ...PAGE, cw: CARD.width, ch: 120 })
  assert.ok(s.left + CARD.width <= PAGE.vw - CARD.margin, 'clamped in: ' + s.left)
  assert.ok(s.left >= CARD.margin)
})

// ── THE WHOLE CARD IS ALWAYS IN THE PAGE (the human, 2026-08-30: never crop the explaining text box)
// The burned card is what the proof photograph shows; a card placed past the viewport edge is burned
// off the frame and its last line is lost — exactly demo R2's clipped "edited just now". So for a
// three-line card (calloutBoxHeight(3)) against a ring near each edge, the WHOLE card rect must fall
// inside [0,vw]×[0,vh]. This is the capture-time guarantee renderOverlay leans on.
const CH3 = calloutBoxHeight(3)
const inPage = (r, vw, vh) => r.x >= 0 && r.y >= 0 && r.x + r.w <= vw && r.y + r.h <= vh
test('a ring at the BOTTOM edge keeps its whole card on the page — it flips above rather than off', () => {
  // demo R2's real geometry: a wide row near the page bottom, a three-line THEN below it would clip
  const box = { x: 321, y: 764, width: 553, height: 17 }
  const r = calloutRect({ box, ...PAGE, cw: CARD.width, ch: CH3 })
  assert.ok(inPage(r, PAGE.vw, PAGE.vh), 'the card is fully on the page: ' + JSON.stringify(r))
  assert.equal(r.side, 'above', 'below would overflow the bottom, so it sits above')
})
test('a ring at the TOP edge keeps its whole card on the page', () => {
  const box = { x: 321, y: 6, width: 553, height: 17 }
  const r = calloutRect({ box, ...PAGE, cw: CARD.width, ch: CH3 })
  assert.ok(inPage(r, PAGE.vw, PAGE.vh), 'the card is fully on the page: ' + JSON.stringify(r))
})
test('a ring at the RIGHT edge keeps its whole card on the page — x is clamped in', () => {
  const box = { x: 1360, y: 300, width: 70, height: 40 }
  const r = calloutRect({ box, ...PAGE, cw: CARD.width, ch: CH3 })
  assert.ok(inPage(r, PAGE.vw, PAGE.vh), 'the card is fully on the page: ' + JSON.stringify(r))
})

test('calloutSpot is pure — the same inputs always answer the same', () => {
  const a = calloutSpot({ box: BOX, ...PAGE, cw: CARD.width, ch: 142 })
  const b = calloutSpot({ box: { ...BOX }, ...PAGE, cw: CARD.width, ch: 142 })
  assert.deepEqual(a, b)
})

// ── THE TWO WASHES (2026-09-04, the review's I3) ─────────────────────────────────────────────────
// The veil and the paper halo are `rgba()` of design-system inks, which spec/_design.css has no
// token for — so they live in THIS module beside every other number the overlay is written with, and
// both sides read them from here. They were a second, hardcoded copy in tools/build-board.mjs's
// paperCssOf, sitting beside the very import that exists to stop exactly that; the review caught it
// before a change to the burn-in's wash could desync the two pictures of a row with nothing failing.
test('the two washes are stated once, and both sides read THIS module', () => {
  assert.match(WASH.veil, /^rgba\(/)
  assert.match(WASH.halo, /^rgba\(/)
  // the BURN-IN: spec/_base.ts hands them into the page inside ringCss and writes no literal itself
  const base = readFileSync(new URL('../spec/_base.ts', import.meta.url), 'utf8')
  assert.ok(base.includes('veil: WASH.veil, haloInk: WASH.halo'), 'the burn-in reads them from here')
  assert.ok(!base.includes(WASH.veil), 'and states neither of them itself: ' + WASH.veil)
  assert.ok(!base.includes(WASH.halo), 'and states neither of them itself: ' + WASH.halo)
  // the BOARD's replica page: paperCssOf hands the client the same two values
  const p = paperCssOf(designCss())
  assert.equal(p.veil, WASH.veil, 'the replica page dims with the burn-in\'s own wash')
  assert.equal(p.halo, WASH.halo, '…and rings with the burn-in\'s own halo')
  const bb = readFileSync(new URL('./build-board.mjs', import.meta.url), 'utf8')
  assert.ok(!bb.includes("'rgba(28,27,24,.12)'"), 'the builder states no copy of the veil')
  assert.ok(!bb.includes("'rgba(253,252,249,.92)'"), 'nor of the halo')
})
