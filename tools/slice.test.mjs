// LIVE ACTION — THE SLICE MATH AND THE READER'S CHOICE OF IT (the human, 2026-09-06: "i expect each
// small step could be gif / live-action (like within a small step, really see the text input being
// change)").
//
// Until this release a strip segment showed a STILL: the frame `proveVisible` photographed at the
// instant it read the value. The gesture that produced it — the typing, the double-click, the tick —
// happened BETWEEN two stills and was never on screen anywhere except the whole-requirement video
// band, which plays the entire requirement and answers no question about one moment.
//
// A moment's SLICE is the span of the recording that ENDS on that moment: from the previous moment's
// anchor (or the beat's window start, which is where the When begins) to its own anchor, plus a short
// settle so the state it produced is readable before the loop restarts. Every number is already
// harvested — the beat's window is its `proves` step's span in the recording, and each value's `at`
// is its offset from that step's start (spec/_base.ts snapValue) — so this is arithmetic on the
// harvest, never a new capture.
//
// Two pure parts, tested here:
//   tools/evidence.mjs  beatSlices / videoSlices — the times, computed at the FOLD and frozen with
//                       the recording they index (the video's own from/to are frozen for exactly the
//                       same reason: a later video-less fold moves the windows and must never re-aim
//                       a recording it did not cut).
//   tools/board/client.js sliceOf — the READER's choice: play this moment's slice, or show its still.
//                       Lifted verbatim out of the shipped bytes (tools/lift-client.mjs), because a
//                       restated rule is free to drift from the one the board runs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { beatSlices, videoSlices, SLICE_SETTLE_MS } from './evidence.mjs'
import { lift } from './lift-client.mjs'

const beat = (over = {}) => ({
  n: 1,
  window: { from: 1000, to: 5000 },
  values: [{ k: 1, at: 800 }, { k: 2, at: 2200 }],
  ...over
})

// ── beatSlices ───────────────────────────────────────────────────────────────────────────────────

test('a value moment\'s slice runs from the previous anchor to its own, plus the settle', () => {
  const s = beatSlices(beat())
  assert.deepEqual(s.values, [
    { k: 1, from: 1000, to: 1800 + SLICE_SETTLE_MS },   // the window start → the first value's anchor
    { k: 2, from: 1800, to: 3200 + SLICE_SETTLE_MS }    // …and each later one from the one before it
  ])
})

test('the beat\'s opening moment holds at the window start; its result runs from the last anchor to the window end', () => {
  const s = beatSlices(beat())
  assert.deepEqual(s.before, { from: 1000, to: 1000 + SLICE_SETTLE_MS })
  assert.deepEqual(s.after, { from: 3200, to: 5000 + SLICE_SETTLE_MS })
})

test('a beat that photographed no values still slices its two ends — the whole window is the action', () => {
  const s = beatSlices(beat({ values: [] }))
  assert.deepEqual(s.values, [])
  assert.deepEqual(s.after, { from: 1000, to: 5000 + SLICE_SETTLE_MS })
})

test('no window, no slices — a beat with nothing to index the recording by says so (never an invented span)', () => {
  assert.equal(beatSlices(beat({ window: null })), null)
  assert.equal(beatSlices(beat({ window: { from: 5000, to: 1000 } })), null)
  assert.equal(beatSlices(null), null)
})

test('one untimed value nulls the whole beat — a chain with a hole cannot be paced honestly', () => {
  assert.equal(beatSlices(beat({ values: [{ k: 1, at: 800 }, { k: 2 }] })), null)
})

test('anchors that go backwards, or land far outside the window, are refused', () => {
  assert.equal(beatSlices(beat({ values: [{ k: 1, at: 2200 }, { k: 2, at: 800 }] })), null)
  assert.equal(beatSlices(beat({ values: [{ k: 1, at: 9000 }] })), null)
  // …but a rounding overshoot inside the tolerance is kept: `d` is rounded to whole ms, so the last
  // value's anchor can sit a hair past the window's own end
  const s = beatSlices(beat({ window: { from: 0, to: 1000 }, values: [{ k: 1, at: 1100 }] }))
  assert.ok(s, 'a 100 ms overshoot is rounding, not disagreement')
  assert.deepEqual(s.values, [{ k: 1, from: 0, to: 1100 + SLICE_SETTLE_MS }])
})

test('the settle is a knob, so a caller can say how long a moment rests', () => {
  const s = beatSlices(beat(), { settle: 0 })
  assert.deepEqual(s.values[0], { k: 1, from: 1000, to: 1800 })
})

// ── videoSlices — the whole entry, frozen beside the recording it indexes ─────────────────────────

test('videoSlices keys each beat by its number and skips a beat it cannot time', () => {
  const out = videoSlices([beat(), beat({ n: 2, window: null }), beat({ n: 3, window: { from: 9000, to: 9500 }, values: [] })])
  assert.deepEqual(Object.keys(out), ['1', '3'])
  assert.deepEqual(out['3'].after, { from: 9000, to: 9500 + SLICE_SETTLE_MS })
  assert.equal(out['2'], undefined, 'an untimeable beat contributes nothing rather than a zero span')
})

test('videoSlices on nothing is an empty index, never a throw', () => {
  assert.deepEqual(videoSlices(null), {})
  assert.deepEqual(videoSlices([]), {})
})

// ── a requirement the screen's PRIMARY recording never covered still has its own ──────────────────
// The primary per screen is the recording covering the MOST of that screen's requirements (T16), and
// a requirement it did not cover used to resolve to NO video at all. That was harmless while only a
// board run recorded — the alternative was nothing. Now that every harvest records (2026-09-06, live
// action), it is the difference between a row that plays its own gestures and a row that cannot: a
// screen proven by a dozen separate tests has a dozen recordings, one of which is the primary. Such a
// requirement rides ITS OWN capture — the same capture its frames, its window and its skeletons come
// from, so the seek indexes exactly the recording being shown. A capture from no recording (a run
// with video off) still carries none.
test('a requirement the primary did not cover rides its own capture\'s recording, not none', async () => {
  const { resolvePrimaryVideo } = await import('./evidence.mjs')
  const A = 'runs/x/big.webm'; const B = 'runs/x/small.webm'
  const cap = v => ({ srcVideo: v, order: [1], beats: { 1: { before: 'b', after: 'a', window: { from: 1, to: 2 } } } })
  const res = resolvePrimaryVideo({
    'board:R1': { caps: { [A]: cap(A) }, latestKey: A },
    'board:R2': { caps: { [A]: cap(A) }, latestKey: A },
    'board:R3': { caps: { [B]: cap(B) }, latestKey: B },
    'board:R4': { caps: { _novideo: cap(null) }, latestKey: '_novideo' }
  })
  assert.equal(res['board:R1'].srcVideo, A, 'the recording covering the most is still the primary')
  assert.equal(res['board:R3'].srcVideo, B, 'and a requirement it missed rides its own, never nothing')
  assert.equal(res['board:R4'].srcVideo, null, 'a capture from no recording carries no video (rule 3)')
})

// ── the READER's own bytes: which moments play, and at what seconds ───────────────────────────────

const SRC = readFileSync(new URL('./board/client.js', import.meta.url), 'utf8')
const sliceOf = new Function(lift(SRC, 'sliceOf') + '; return sliceOf')()

test('sliceOf turns a moment\'s milliseconds into the video element\'s seconds', () => {
  assert.deepEqual(sliceOf({ slice: { from: 1800, to: 3600 } }, 'blob/abc.webm'), { from: 1.8, to: 3.6 })
})

test('sliceOf refuses without a recording — the harvest that has none keeps its still (rule 3)', () => {
  assert.equal(sliceOf({ slice: { from: 1800, to: 3600 } }, ''), null)
  assert.equal(sliceOf({ slice: { from: 1800, to: 3600 } }, null), null)
})

test('sliceOf refuses a moment with no slice, or one whose numbers do not make a span', () => {
  assert.equal(sliceOf({}, 'blob/abc.webm'), null)
  assert.equal(sliceOf({ slice: null }, 'blob/abc.webm'), null)
  assert.equal(sliceOf({ slice: { from: 3600, to: 1800 } }, 'blob/abc.webm'), null)
  assert.equal(sliceOf({ slice: { from: 1800, to: 1800 } }, 'blob/abc.webm'), null)
  assert.equal(sliceOf({ slice: { from: -1, to: 1800 } }, 'blob/abc.webm'), null)
  assert.equal(sliceOf({ slice: { from: 'x', to: 1800 } }, 'blob/abc.webm'), null)
  assert.equal(sliceOf(null, 'blob/abc.webm'), null)
})
