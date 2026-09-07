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
const { modeHold, scaleHold, filmEnd, REST } = globalThis.SBStepper

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
  assert.equal(modeHold('auto', 500, 1535, 1), globalThis.SBStepper.LEAD + 1535 + REST)
  // …and a moment with a long hold and a short slice keeps its hold
  assert.equal(modeHold('auto', 3000, 400, 1), 3000)
})

// ── THE FILM IS THE APPROACH; THE MOMENT IS THE STILL ────────────────────────────────────────────
// (the human, 2026-09-07: "For auto and semi-auto, it only moving on the actual, but i expect both
// side always sync to be comparable".) Measured on demo/todo R1 beat 1, moment 3 of 6, in semi-auto:
// at ct 6.18 s the ACTUAL was a page scrolled one row off the Expected — the new row it claims is
// not even on screen — while the chip over it still read `ACTUAL ✓ empty`. A moment's slice ENDS on
// the instant the check read the value, so everything before that end is the APPROACH: the app on
// its way to the moment, not the moment. The still beside it IS the moment, and it is the picture
// the Expected replica is the pair of.
//
// So the film stands down when its slice runs out, in every playing mode, and the moment's own
// photograph stands. What differs is only what happens next: semi-auto rests there and replays the
// approach; auto rests there and lets the ROW move on (one clock, still).
test('when the film reaches the end of its slice it stands down — the still IS the moment', () => {
  for (const m of ['auto', 'semi', 'step']) {
    assert.equal(filmEnd(m, 1).show, false, m + ' left the film standing over its own moment')
  }
})

test('SEMI-AUTO rests on the still, then replays the approach — that rest IS the loop’s pause', () => {
  assert.equal(filmEnd('semi', 1).replayIn, REST)
})

test('AUTO never replays: the rest is the row’s clock (modeHold), so a row still has ONE clock', () => {
  assert.equal(filmEnd('auto', 1).replayIn, null)
  assert.equal(filmEnd('step', 1).replayIn, null)
  assert.equal(filmEnd('gif', 1).replayIn, null)     // an unknown mode never starts a replay timer
})

test('the reader’s speed rates the rest, like every other hold', () => {
  assert.equal(filmEnd('semi', 4).replayIn, scaleHold(REST, 4))
  assert.equal(filmEnd('semi', 0.25).replayIn, scaleHold(REST, 0.25))
})

test('the REST is readable — long enough to compare the two columns, not a flash', () => {
  // 200ms (the tail this replaced) is a blink: the still it uncovers is the ONLY frame of the beat
  // the Expected can be compared against, so it has to be readable at 1×.
  assert.ok(REST >= 600, 'the rest on the still is a beat a person can read: ' + REST)
})

test('AUTO holds a moment for its film AND that same rest — never 200ms after the gesture', () => {
  // the still stands from the film's end to the advance, and that gap is the rest at the reader's
  // speed however long the film ran
  assert.ok(modeHold('auto', 500, 1535, 1) - 1535 >= REST)
  assert.ok(modeHold('auto', 500, 1535, 4) - scaleHold(1535, 4) >= scaleHold(REST, 4))
})

test('a moment with no slice advances on its still’s hold alone', () => {
  assert.equal(modeHold('auto', 1200, 0, 1), 1200)
  assert.equal(modeHold('auto', 1200, undefined, 1), 1200)
})

test('the reader’s speed rates BOTH halves of that answer', () => {
  // 4×: the hold and the slice compress together, so a fast reader still sees the whole action
  const LEAD = globalThis.SBStepper.LEAD
  assert.equal(modeHold('auto', 500, 1535, 4), scaleHold(LEAD, 4) + scaleHold(1535, 4) + scaleHold(REST, 4))
  assert.equal(modeHold('auto', 8000, 400, 4), scaleHold(8000, 4))
  // 0.25×: both stretch
  assert.equal(modeHold('auto', 500, 1535, 0.25), scaleHold(LEAD, 0.25) + scaleHold(1535, 0.25) + scaleHold(REST, 0.25))
})

test('a very long slice cannot park the row forever — the auto hold is capped', () => {
  assert.equal(modeHold('auto', 1200, 600000, 1), 15000)
})

// ── ONE MOMENT IS THREE BEATS: LEAD · APPROACH · REST (the human, 2026-09-07, four reports on 0.48.5)
// "Now the expected column never moved"; "semi-auto is not smooth … a small step should only contain
// the action of click the Add button (instead of continue from last small step entirely)"; "the
// explaining text box in semi-auto should same as the one in step"; "be aware of the pause between
// each action to make user able to observe". A playing moment now opens on its START state, held
// for a LEAD both columns share; then the approach runs; then the moment's own still stands for the
// REST. The lead is the pause the human asked for, and it is what lets the Expected MOVE: it shows
// the start state through the lead and the approach, and the moment's own state at rest.
test('a playing mode leads with a pause on the start state; step has nothing to lead into', () => {
  const { filmLead, LEAD } = globalThis.SBStepper
  assert.ok(LEAD >= 500, 'the lead is a pause a person can register: ' + LEAD)
  assert.equal(filmLead('semi', 1), LEAD)
  assert.equal(filmLead('auto', 1), LEAD)
  assert.equal(filmLead('step', 1), null)
  assert.equal(filmLead('gif', 1), null)
})

test('the lead is rated by the reader’s speed like every other hold', () => {
  const { filmLead, LEAD } = globalThis.SBStepper
  assert.equal(filmLead('semi', 4), scaleHold(LEAD, 4))
  assert.equal(filmLead('auto', 0.25), scaleHold(LEAD, 0.25))
})

test('AUTO’s clock spends the LEAD, the approach AND the REST before the row advances', () => {
  const { LEAD } = globalThis.SBStepper
  assert.equal(modeHold('auto', 500, 1535, 1), LEAD + 1535 + REST)
  assert.equal(modeHold('auto', 500, 1535, 4), scaleHold(LEAD, 4) + scaleHold(1535, 4) + scaleHold(REST, 4))
  // a moment with no film has no lead either — its still simply holds
  assert.equal(modeHold('auto', 1200, 0, 1), 1200)
})
