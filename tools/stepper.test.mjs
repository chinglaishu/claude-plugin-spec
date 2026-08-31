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
