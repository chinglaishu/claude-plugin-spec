// The gif-mode FRAME-STEPPER's pure timing math (Task 13 — the human chose the stepper over the
// webp: exact dots need a current frame, and 0.25×–4× speed needs JS-held frames). The stepper
// plays a requirement's harvested frames — before → each asserted-value frame → after — holding
// each for its TRUE relative duration derived from the harvest's timings: the evidence entry's
// window ({from,to}, ms into the recording) anchors the ends, each run frame's `t` anchors the
// middles. Old harvests carry no usable timing (a null window, frames without `t`, or anchors from
// two different recordings that do not line up) — then the stepper falls back to EQUAL holds,
// honest, never invented. tools/board/stepper.js registers globalThis.SBStepper so the SAME bytes
// run in the board page (a verbatim <script>, like client.js) and here under node --test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import '../tools/board/stepper.js'

const { stepperHolds, scaleHold, cameraDur } = globalThis.SBStepper

test('true relative timing: holds are the deltas between anchors, the last frame gets the dwell', () => {
  const r = stepperHolds([0, 500, 2000])
  assert.deepEqual(r.holds, [500, 1500, 1600])
  assert.equal(r.timed, true)
})

test('a real harvest window as the two-frame pair: delta clamped up to the minimum readable hold', () => {
  // board R1's real entry: window {from: 874, to: 951} — a 77ms assert body. True RELATIVE timing
  // at that scale is sub-perceptual, so the floor keeps every frame readable; still `timed`.
  const r = stepperHolds([874, 951])
  assert.deepEqual(r.holds, [350, 1600])
  assert.equal(r.timed, true)
})

test('holds are clamped into [min, max] so one slow beat cannot park the loop', () => {
  const r = stepperHolds([0, 100, 20000])
  assert.deepEqual(r.holds, [350, 6000, 1600])
  assert.equal(r.timed, true)
})

test('non-monotonic anchors (two different recordings mixed) fall back to equal holds', () => {
  const r = stepperHolds([0, 900, 400])
  assert.deepEqual(r.holds, [1200, 1200, 1200])
  assert.equal(r.timed, false)
})

test('a missing anchor (an old harvest: no window, or a frame without t) falls back to equal holds', () => {
  assert.deepEqual(stepperHolds([0, null, 300]), { holds: [1200, 1200, 1200], timed: false })
  assert.deepEqual(stepperHolds([null, null]), { holds: [1200, 1200], timed: false })
})

test('equal anchors are not an order — equal holds, never a zero hold', () => {
  const r = stepperHolds([500, 500])
  assert.deepEqual(r.holds, [1200, 1200])
  assert.equal(r.timed, false)
})

test('one frame is a still: it gets the dwell and no claim of timing', () => {
  assert.deepEqual(stepperHolds([874]), { holds: [1600], timed: false })
})

test('no frames, no holds', () => {
  assert.deepEqual(stepperHolds([]), { holds: [], timed: false })
  assert.deepEqual(stepperHolds(null), { holds: [], timed: false })
})

test('options override the defaults', () => {
  const r = stepperHolds([0, 500], { min: 100, dwell: 900 })
  assert.deepEqual(r.holds, [500, 900])
  const c = stepperHolds([0, 50], { min: 100, dwell: 900 })
  assert.deepEqual(c.holds, [100, 900])
})

test('scaleHold divides a hold by the chosen speed — 0.25× stretches, 4× compresses', () => {
  assert.equal(scaleHold(1200, 4), 300)
  assert.equal(scaleHold(1200, 0.25), 4800)
  assert.equal(scaleHold(1200, 1.5), 800)
})

test('scaleHold floors at 40ms and treats a broken speed as 1×', () => {
  assert.equal(scaleHold(50, 4), 40)
  assert.equal(scaleHold(1200, 0), 1200)
  assert.equal(scaleHold(1200, undefined), 1200)
})

// THE CAMERA GLIDE (the human, 2026-08-31: "make the transition to the next small step smoother").
// cameraDur scales the base ease-duration by the reader's speed — 4× shortens it, 0.25× lengthens
// it — but clamps into [90, 900] so the fastest speed still animates (never a snap that reads as a
// jump) and the slowest never drifts so long it feels stuck.
test('cameraDur scales the glide by speed and clamps it into a readable window', () => {
  assert.equal(cameraDur(420, 1), 420)          // 1× is the base
  assert.equal(cameraDur(420, 0.25), 900)       // 0.25× would be 1680 → clamped to the ceiling
  assert.equal(cameraDur(420, 4), 105)          // 4× compresses, still well above the floor
  assert.equal(cameraDur(420, 8), 90)           // and never below the floor — always an animation
})

test('cameraDur treats a broken base or speed as sane defaults', () => {
  assert.equal(cameraDur(420, 0), 420)          // a broken speed reads as 1×
  assert.equal(cameraDur(undefined, 1), 420)    // no base → the default base
  assert.equal(cameraDur(-5, 1), 420)
})

// ── THE EASED CAMERA (phase 4b, the human 2026-09-03) ────────────────────────────────────────────
// The row's two cells frame ONE region per moment: the ring the assertion painted UNION the chip
// that says what it claimed (a chip framed out of view is a caption on nothing), with generous room
// around it — 45% of the union on every side — and a gentle cap: never more than 1.25× the app's own
// natural size, because a picker blown up to fill a cell loses the header it sits in ("zoomed in a
// bit too much", the human, on the first cut). The scale is ABSOLUTE — page pixels to cell pixels —
// so both cells, which stand on the same page coordinates, are framed identically by construction.
const { frameFor, loupeFit } = globalThis.SBStepper
const VP = { vw: 1440, vh: 900 }

test('a small ring alone takes the cap — 1.25×, never more', () => {
  const v = frameFor({ x: 780, y: 5, w: 132, h: 28 }, null, VP, { w: 450, h: 281 })
  assert.equal(v.scale, 1.25)
  assert.equal(Math.round(v.w), Math.round(450 / 1.25))     // the region is the cell, at that scale
  assert.equal(Math.round(v.h), Math.round(281 / 1.25))
})

test('the frame contains the ring AND the chip, with 45% room around the pair', () => {
  const ring = { x: 780, y: 5, w: 132, h: 28 }
  const chip = { x: 740, y: 45, w: 360, h: 44 }
  const v = frameFor(ring, chip, VP, { w: 450, h: 281 })
  const inside = (b) => b.x >= v.x - 0.5 && b.y >= v.y - 0.5 &&
    b.x + b.w <= v.x + v.w + 0.5 && b.y + b.h <= v.y + v.h + 0.5
  assert.equal(inside(ring), true, 'the ring is in frame')
  assert.equal(inside(chip), true, 'and so is the chip that explains it')
  // the union is 1100−740 = 360 wide; 45% each side wants 360 × 1.9 = 684 page px in a 450px cell
  assert.ok(Math.abs(v.scale - 450 / 684) < 0.001, 'the fit, not the cap: ' + v.scale)
})

test('a chip wider than the ring widens the frame — a caption is never cropped off', () => {
  const ring = { x: 780, y: 5, w: 132, h: 28 }
  const narrow = frameFor(ring, null, VP, { w: 450, h: 281 })
  const wide = frameFor(ring, { x: 700, y: 45, w: 360, h: 44 }, VP, { w: 450, h: 281 })
  assert.ok(wide.scale < narrow.scale, 'the wider pair is framed further back')
  assert.ok(wide.w > narrow.w)
})

test('a target that already spans the page is not "zoomed" — the whole frame, honestly', () => {
  assert.equal(frameFor({ x: 0, y: 0, w: 1440, h: 900 }, null, VP, { w: 450, h: 281 }), null)
  // …and neither is one whose fit lands below the cell's own natural scale (450/1440 = 0.3125)
  assert.equal(frameFor({ x: 20, y: 20, w: 700, h: 700 }, null, VP, { w: 450, h: 281 }), null)
})

test('a ring at the page edge PANS — the frame never shows ground beside the page', () => {
  const v = frameFor({ x: 1380, y: 860, w: 40, h: 30 }, null, VP, { w: 450, h: 281 })
  assert.ok(v.x + v.w <= VP.vw + 0.001, 'clamped at the right edge: ' + JSON.stringify(v))
  assert.ok(v.y + v.h <= VP.vh + 0.001, 'and at the foot')
  assert.ok(v.x >= 0 && v.y >= 0)
})

test('broken inputs frame nothing rather than something invented', () => {
  assert.equal(frameFor(null, null, VP, { w: 450, h: 281 }), null)
  assert.equal(frameFor({ x: 0, y: 0, w: 0, h: 10 }, null, VP, { w: 450, h: 281 }), null)
  assert.equal(frameFor({ x: 0, y: 0, w: 10, h: 10 }, null, { vw: 0, vh: 900 }, { w: 450, h: 281 }), null)
  assert.equal(frameFor({ x: 0, y: 0, w: 10, h: 10 }, null, VP, { w: 0, h: 281 }), null)
})

// ── THE LOUPE (phase 5) — the ringed element ALONE, both sides, ONE scale ────────────────────────
test('the loupe magnifies to 1.6× and reports the box that holds the element', () => {
  const v = loupeFit({ x: 780, y: 5, w: 132, h: 28 }, { w: 400, h: 200 })
  assert.equal(v.scale, 1.6)
  assert.equal(v.x, 780 - 14)                                   // the pad rides in page units
  assert.equal(v.y, 5 - 14)
  assert.equal(Math.round(v.w), Math.round((132 + 28) * 1.6))
  assert.equal(Math.round(v.h), Math.round((28 + 28) * 1.6))
})

test('an element too wide for the cell scales DOWN — both sides equally, never one of them', () => {
  const v = loupeFit({ x: 100, y: 100, w: 600, h: 40 }, { w: 400, h: 200 })
  assert.ok(v.scale < 1.6)
  assert.ok(Math.abs(v.w - 400) < 0.5, 'it fills the cell exactly: ' + v.w)
  assert.equal(loupeFit({ x: 100, y: 100, w: 600, h: 40 }, { w: 400, h: 200 }).scale, v.scale)
})

test('no ring, no loupe', () => {
  assert.equal(loupeFit(null, { w: 400, h: 200 }), null)
  assert.equal(loupeFit({ x: 1, y: 1, w: 0, h: 10 }, { w: 400, h: 200 }), null)
  assert.equal(loupeFit({ x: 1, y: 1, w: 10, h: 10 }, { w: 0, h: 200 }), null)
})
