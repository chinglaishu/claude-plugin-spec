// tools/play-modes.test.mjs — THE READER'S THREE PLAY MODES (the human, 2026-09-07, their own words:
// "actually need 3 modes: (it will equally apply on expected and actual column) 1. Auto (all small
// steps auto run, small step 1 played -> small step 2) 2. Semi-auto (step auto run and loop, like now
// in small step 1, it will loop play on small step 1, user control to go to next step) 3. Step
// (totally still and user control to go to next step)" — plus the bug that came with it: "now it's
// buggy that the actual column always playing".
//
// The rules these pin, all four of them shipped bytes rather than a restatement:
//   • `normMode` — the three stops and what an unknown one falls back to (SEMI-AUTO is the default,
//     the behaviour the human called "like now");
//   • `livePlan` — WHAT THE MOVING PICTURE DOES in each mode. This is the bug: the live layer read
//     no mode at all, so a reader held in step showed a still Expected beside an Actual that kept
//     looping. Step now shows no film; semi loops the moment; auto plays it once and holds.
//   • `sliceMsOf` — a moment's own span of the recording in ms, or 0 where it has none;
//   • `SBStepper.modeHold` — the ROW'S ONE CLOCK: only auto is wound, and it advances when the moment
//     is DONE (the longer of the still's hold and the slice, at the reader's speed).
//
// client.js is browser code with no module boundary, so its three helpers are LIFTED out of the
// shipped source (tools/lift-client.mjs) and run here as themselves; stepper.js registers
// globalThis.SBStepper, so the board and this file execute the same bytes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { lift } from './lift-client.mjs'
import './board/stepper.js'

const SRC = readFileSync(new URL('./board/client.js', import.meta.url), 'utf8')
const modes = (() => {
  const at = SRC.indexOf('const MODES = ')
  assert.ok(at >= 0, 'no const MODES in client.js — the play-mode list moved')
  const line = SRC.slice(at, SRC.indexOf('\n', at))
  const body = [line, lift(SRC, 'normMode'), lift(SRC, 'livePlan'), lift(SRC, 'sliceMsOf')].join('\n')
  // eslint-disable-next-line no-new-func
  return new Function(body + '; return { MODES, normMode, livePlan, sliceMsOf }')()
})()
const { MODES, normMode, livePlan, sliceMsOf } = modes
const { modeHold, scaleHold } = globalThis.SBStepper

// ── the three stops ──────────────────────────────────────────────────────────────────────────────

test('there are exactly three modes, in the human’s own order: auto, semi-auto, step', () => {
  assert.deepEqual(MODES, ['auto', 'semi', 'step'])
})

test('each stop names itself; anything else falls back to semi-auto — the "like now" default', () => {
  assert.equal(normMode('auto'), 'auto')
  assert.equal(normMode('semi'), 'semi')
  assert.equal(normMode('step'), 'step')
  // the retired two-mode world's values, a typo, a missing one — none of them may become a fourth
  // state, and none of them may silently become `auto`, which would start every reader playing
  assert.equal(normMode('gif'), 'semi')
  assert.equal(normMode(''), 'semi')
  assert.equal(normMode(undefined), 'semi')
  assert.equal(normMode(null), 'semi')
})

test('the shipped default IS semi-auto — the reader opens looping the moment it holds', () => {
  const at = SRC.indexOf('let PLAY_MODE = ')
  assert.ok(at >= 0, 'no PLAY_MODE state in client.js')
  assert.equal(SRC.slice(at, SRC.indexOf('\n', at)).trim(), "let PLAY_MODE = 'semi'")
})

// ── the bug: the moving picture must obey the mode ───────────────────────────────────────────────

test('STEP is totally still: no film shows and none plays, in either column', () => {
  assert.deepEqual(livePlan('step', true), { show: false, play: false, loop: false })
})

test('SEMI-AUTO loops the moment on show — and only that moment', () => {
  assert.deepEqual(livePlan('semi', true), { show: true, play: true, loop: true })
})

test('AUTO plays the moment’s action ONCE — the advance is the row’s stepper, not a loop', () => {
  assert.deepEqual(livePlan('auto', true), { show: true, play: true, loop: false })
})

test('a moment with no slice shows no film in ANY mode — nothing is invented', () => {
  for (const m of ['auto', 'semi', 'step']) {
    assert.deepEqual(livePlan(m, false), { show: false, play: false, loop: false },
      m + ' invented a film for a moment the harvest never sliced')
  }
})

// ── a moment's own span of the recording ─────────────────────────────────────────────────────────

test('a moment’s slice is its span in ms', () => {
  assert.equal(sliceMsOf({ slice: { from: 4585, to: 6120 } }), 1535)
})

test('a moment with no honest slice measures 0, never a guess', () => {
  assert.equal(sliceMsOf(null), 0)
  assert.equal(sliceMsOf({}), 0)
  assert.equal(sliceMsOf({ slice: null }), 0)
  assert.equal(sliceMsOf({ slice: { from: 900, to: 900 } }), 0)   // empty span
  assert.equal(sliceMsOf({ slice: { from: 900, to: 400 } }), 0)   // backwards
  assert.equal(sliceMsOf({ slice: { from: -5, to: 400 } }), 0)    // before the recording began
  assert.equal(sliceMsOf({ slice: { from: 0, to: 'x' } }), 0)     // not a number
})

// ── the row's one clock ──────────────────────────────────────────────────────────────────────────

test('only AUTO is wound: semi-auto and step schedule nothing at all', () => {
  assert.equal(modeHold('semi', 1200, 1500, 1), null)
  assert.equal(modeHold('step', 1200, 1500, 1), null)
  assert.equal(modeHold('gif', 1200, 1500, 1), null)      // an unknown mode never starts a timer
})

test('AUTO waits for the LONGER of the still’s hold and the moment’s own action', () => {
  // a 1535ms slice under a 500ms hold: cutting at 500 would chop the gesture mid-type
  assert.equal(modeHold('auto', 500, 1535, 1), 1535 + 200)
  // …and a moment with a long hold and a short slice keeps its hold
  assert.equal(modeHold('auto', 3000, 400, 1), 3000)
})

test('a moment with no slice advances on its still’s hold alone', () => {
  assert.equal(modeHold('auto', 1200, 0, 1), 1200)
  assert.equal(modeHold('auto', 1200, undefined, 1), 1200)
})

test('the reader’s speed rates BOTH halves of that answer', () => {
  // 4×: the hold and the slice compress together, so a fast reader still sees the whole action
  assert.equal(modeHold('auto', 500, 1535, 4), scaleHold(1535, 4) + scaleHold(200, 4))
  assert.equal(modeHold('auto', 8000, 400, 4), scaleHold(8000, 4))
  // 0.25×: both stretch
  assert.equal(modeHold('auto', 500, 1535, 0.25), scaleHold(1535, 0.25) + scaleHold(200, 0.25))
})

test('a very long slice cannot park the row forever — the auto hold is capped', () => {
  assert.equal(modeHold('auto', 1200, 600000, 1), 15000)
})
