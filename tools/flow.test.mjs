// The Flow player's foundation: two pure functions that turn a recorded test's step data into
// (a) whether it is a unit or a flow, and (b) its ordered chapters — title, screen, seek offset,
// requirement chips, pass/fail. No Playwright, no board, no browser (node --test): the player can
// only be trusted to seek and stop honestly if this derivation is provably right on its own.
//
// The fixtures are REAL step arrays lifted verbatim from a green full-suite run's record
// (spec/_runs.json entry 2026-08-18T03:41:27.341Z — the shape spec/_results-reporter.mjs
// flattenSteps produces), trimmed to the fields used: { label, cat, depth, ok, t }. Two things the
// real data teaches, which these tests pin down:
//   - a cross-screen flow can cross by TAG ALONE: the dispatch-R7 flow proves `dispatch:R7` while
//     standing on /#/board and never navigates to a dispatch route;
//   - the flat array is TREE order, not time order — a sibling step can carry an earlier `t` than
//     the nested steps recorded before it (CROSS below has t 160 after t 545).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveKind, deriveChapters } from './flow.mjs'

// ---------------------------------------------------------------------------
// REAL fixture: the cross-screen flow — board's test "A finished run refreshes the board in place —
// no reload, the panel stays (dispatch R7)". Its committed index record's reqs keys: ['dispatch:R7'].
const CROSS = [
  { label: 'Open /', cat: 'pw:api', depth: 0, ok: true, t: 31 },
  { label: 'Wait for the “.card”', cat: 'pw:api', depth: 0, ok: true, t: 50 },
  { label: 'Open /#/board', cat: 'pw:api', depth: 0, ok: true, t: 82 },
  { label: 'Click the “.dt[data-screen="board"]:not([hidden])”', cat: 'pw:api', depth: 0, ok: true, t: 89 },
  { label: 'Check the “.dt[data-screen="board"]:not([hidden])” is visible', cat: 'expect', depth: 0, ok: true, t: 150 },
  { label: 'Run a script on the page', cat: 'pw:api', depth: 0, ok: true, t: 156 },
  { label: 'proves dispatch:R7', cat: 'test.step', depth: 0, ok: true, t: 157 },
  { label: 'Run a script on the page', cat: 'pw:api', depth: 1, ok: true, t: 158 },
  { label: 'Check the “.dt[data-screen="board"]:not([hidden])” has the expected attribute', cat: 'expect', depth: 1, ok: true, t: 541 },
  { label: 'no reload — the open panel would survive', cat: 'expect', depth: 1, ok: true, t: 545 },
  { label: 'GET request to /board.html', cat: 'pw:api', depth: 0, ok: true, t: 160 },
  { label: 'Run a script on the page', cat: 'pw:api', depth: 0, ok: true, t: 546 }
]

// REAL fixture: a same-screen unit test WITH authored flowStep sentences — board's "Story-step
// evidence renders from the test definition". Note the first sentence STARTS with "Open " — only
// cat 'pw:api' marks a real navigation — and the nav to /#/board sits at depth 1 INSIDE the group.
const STORY = [
  { label: 'Open /', cat: 'pw:api', depth: 0, ok: true, t: 67 },
  { label: 'Wait for the “.card”', cat: 'pw:api', depth: 0, ok: true, t: 88 },
  { label: 'Run a script on the page', cat: 'pw:api', depth: 0, ok: true, t: 120 },
  { label: 'Open the board detail — the two columns are there', cat: 'test.step', depth: 0, ok: true, t: 128 },
  { label: 'Open /#/board', cat: 'pw:api', depth: 1, ok: true, t: 129 },
  { label: 'Click the “.dt[data-screen="board"]:not([hidden])”', cat: 'pw:api', depth: 1, ok: true, t: 131 },
  { label: 'Check the “.dt[data-screen="board"]:not([hidden])” is visible', cat: 'expect', depth: 1, ok: true, t: 169 },
  { label: '▸ proving R10 — A test opens to its full evidence, and can be run — watchably or in the background', cat: 'info', depth: 1, ok: true, t: 172 },
  { label: 'Run a script on the page', cat: 'pw:api', depth: 1, ok: true, t: 172 },
  { label: 'proves R10', cat: 'test.step', depth: 1, ok: true, t: 173 },
  { label: 'Check the “#reqpane” is visible', cat: 'expect', depth: 2, ok: true, t: 174 },
  { label: 'Run a script on the page', cat: 'pw:api', depth: 1, ok: true, t: 204 },
  { label: 'Wait for the page to load', cat: 'pw:api', depth: 0, ok: true, t: 130 },
  { label: 'Run a script on the page', cat: 'pw:api', depth: 0, ok: true, t: 130 },
  { label: 'Run a script on the page', cat: 'pw:api', depth: 0, ok: true, t: 205 },
  { label: 'Run a script on the page', cat: 'pw:api', depth: 0, ok: true, t: 208 },
  { label: 'Announce a golden value on the narration bar', cat: 'test.step', depth: 0, ok: true, t: 210 },
  { label: 'Count the “#home .card”', cat: 'pw:api', depth: 1, ok: true, t: 210 },
  { label: 'cards on the home board — got 4 · expected 4', cat: 'info', depth: 1, ok: true, t: 212 },
  { label: 'Run a script on the page', cat: 'pw:api', depth: 1, ok: true, t: 213 },
  { label: 'cards on the home board', cat: 'expect', depth: 1, ok: true, t: 214 },
  { label: 'Run a script on the page', cat: 'pw:api', depth: 0, ok: true, t: 215 },
  { label: 'Run a script on the page', cat: 'pw:api', depth: 0, ok: true, t: 216 },
  { label: 'Confirm the tests column is present', cat: 'test.step', depth: 0, ok: true, t: 217 },
  { label: 'Check the “#testpane” is visible', cat: 'expect', depth: 1, ok: true, t: 218 },
  { label: 'Run a script on the page', cat: 'pw:api', depth: 0, ok: true, t: 220 }
]

// REAL fixture: a same-screen unit test with NO authored sentences — board's "Home lists every
// screen as a card". Its only test.step is the `proves R1` marker, which is not a stage name.
const PLAIN = [
  { label: 'Open /', cat: 'pw:api', depth: 0, ok: true, t: 31 },
  { label: 'Wait for the “.card”', cat: 'pw:api', depth: 0, ok: true, t: 51 },
  { label: 'Run a script on the page', cat: 'pw:api', depth: 0, ok: true, t: 84 },
  { label: 'proves R1', cat: 'test.step', depth: 0, ok: true, t: 92 },
  { label: 'Check the “#home .card” has the expected number', cat: 'expect', depth: 1, ok: true, t: 93 },
  { label: 'Check the “#home .card” passes not toBeEmpty', cat: 'expect', depth: 1, ok: true, t: 96 },
  { label: 'Check the “#home .card” is visible', cat: 'expect', depth: 1, ok: true, t: 98 },
  { label: 'Check the “#home .card” has the expected number', cat: 'expect', depth: 1, ok: true, t: 103 },
  { label: 'Check the “.cell[data-col], .colhs” has the expected number', cat: 'expect', depth: 1, ok: true, t: 106 },
  { label: 'Run a script on the page', cat: 'pw:api', depth: 0, ok: true, t: 110 },
  { label: 'Take a screenshot', cat: 'pw:api', depth: 0, ok: true, t: 111 }
]

// CRAFTED from CROSS: the same flow with its R7 assertion failing — the proves step and the
// expect inside it carry ok:false, exactly as a failed checkReq records.
const CROSS_FAILED = CROSS.map((s, i) => (i === 6 || i === 8 ? { ...s, ok: false } : s))

// deriveKind ----------------------------------------------------------------
test('a test tagging only its own screen is a unit', () => {
  assert.equal(deriveKind(['board:R13'], 'board'), 'unit')
})

test('a test tagging another screen\'s requirement is a flow — the real dispatch-R7 record', () => {
  // the committed index keeps reqs keys QUALIFIED; this is that record's actual key set
  assert.equal(deriveKind(['dispatch:R7'], 'board'), 'flow')
  assert.equal(deriveKind(['board:R2', 'dispatch:R7'], 'board'), 'flow')
})

test('a bare id qualifies to the test\'s own screen, so it reads unit', () => {
  assert.equal(deriveKind(['R13'], 'board'), 'unit')
})

test('no ids at all is a unit, never a crash', () => {
  assert.equal(deriveKind([], 'board'), 'unit')
  assert.equal(deriveKind(undefined, 'board'), 'unit')
})

// deriveChapters — the cross-screen flow ------------------------------------
test('the real cross-screen flow yields two chapters: board, then dispatch', () => {
  const ch = deriveChapters(CROSS, 'board')
  assert.equal(ch.length, 2)
  assert.deepEqual(ch.map(c => c.screen), ['board', 'dispatch'])
})

test('each chapter carries exactly { title, screen, t, reqs, ok }', () => {
  for (const c of deriveChapters(CROSS, 'board')) {
    assert.deepEqual(Object.keys(c).sort(), ['ok', 'reqs', 'screen', 't', 'title'])
  }
})

test('the bare requirement ids land in the chapter that proves them', () => {
  const ch = deriveChapters(CROSS, 'board')
  assert.deepEqual(ch[0].reqs, [])
  assert.deepEqual(ch[1].reqs, ['R7']) // BARE — the screen: prefix stripped
})

test('a chapter\'s t is its earliest step — the seek point — and chapters ascend in t', () => {
  const ch = deriveChapters(CROSS, 'board')
  assert.equal(ch[0].t, 31)
  // tree order put a t=160 sibling AFTER the t=545 nested step; the chapter still seeks to 157
  assert.equal(ch[1].t, 157)
  for (let i = 1; i < ch.length; i++) assert.ok(ch[i].t >= ch[i - 1].t, 'chapters must ascend in t')
})

test('an untitled chapter is named after its screen', () => {
  const ch = deriveChapters(CROSS, 'board')
  assert.deepEqual(ch.map(c => c.title), ['board', 'dispatch'])
})

test('a failed step fails ITS chapter and no other', () => {
  const ch = deriveChapters(CROSS_FAILED, 'board')
  assert.equal(ch[0].ok, true)
  assert.equal(ch[1].ok, false)
})

// deriveChapters — a unit test with authored stage sentences ----------------
test('a single-screen test chapters by its authored flowStep sentences, in their words', () => {
  const ch = deriveChapters(STORY, 'board')
  assert.deepEqual(ch.map(c => c.title), [
    'Open the board detail — the two columns are there',
    'Announce a golden value on the narration bar',
    'Confirm the tests column is present'
  ])
  assert.deepEqual(ch.map(c => c.screen), ['board', 'board', 'board'])
})

test('the setup before the first sentence folds into the first chapter, so it seeks to the start', () => {
  const ch = deriveChapters(STORY, 'board')
  assert.equal(ch[0].t, 67) // the preamble's Open /, not the sentence's 128
  assert.deepEqual(ch.map(c => c.t), [67, 210, 217])
})

test('a proof nested inside a stage lands in that stage\'s reqs', () => {
  const ch = deriveChapters(STORY, 'board')
  assert.deepEqual(ch.map(c => c.reqs), [['R10'], [], []])
})

test('a sentence that merely STARTS with "Open " is a stage name, not a navigation', () => {
  // 'Open the board detail — …' is cat test.step; only a pw:api Open marks a screen crossing
  const ch = deriveChapters(STORY, 'board')
  assert.equal(ch.length, 3)
  assert.ok(ch.every(c => c.screen === 'board'))
})

// deriveChapters — a unit test with no sentences ----------------------------
test('no authored sentences and no crossing: one chapter spanning the whole test', () => {
  const ch = deriveChapters(PLAIN, 'board')
  assert.equal(ch.length, 1)
  assert.deepEqual(ch[0], { title: 'board', screen: 'board', t: 31, reqs: ['R1'], ok: true })
})

// deriveChapters — edges ----------------------------------------------------
test('empty or missing steps derive no chapters', () => {
  assert.deepEqual(deriveChapters([], 'board'), [])
  assert.deepEqual(deriveChapters(undefined, 'board'), [])
})

test('steps with no proves and no navigation still make one whole-test chapter', () => {
  const ch = deriveChapters([
    { label: 'Click the “.runbtn”', cat: 'pw:api', depth: 0, ok: true, t: 5 },
    { label: 'Check the “#runpanel” is visible', cat: 'expect', depth: 0, ok: true, t: 9 }
  ], 'dispatch')
  assert.deepEqual(ch, [{ title: 'dispatch', screen: 'dispatch', t: 5, reqs: [], ok: true }])
})

test('the same requirement proven twice in one chapter chips once', () => {
  const ch = deriveChapters([
    { label: 'Open /', cat: 'pw:api', depth: 0, ok: true, t: 3 },
    { label: 'proves R5', cat: 'test.step', depth: 0, ok: true, t: 10 },
    { label: 'proves R5', cat: 'test.step', depth: 0, ok: true, t: 20 }
  ], 'board')
  assert.equal(ch.length, 1)
  assert.deepEqual(ch[0].reqs, ['R5'])
})

test('a real navigation to another screen\'s route starts a new chapter there', () => {
  // an authored cross-screen shape: a stage sentence whose group opens the other screen —
  // the stage stays ONE chapter, homed on the screen its navigation lands on
  const ch = deriveChapters([
    { label: 'Open /#/board', cat: 'pw:api', depth: 0, ok: true, t: 2 },
    { label: 'Check the “.dt” is visible', cat: 'expect', depth: 0, ok: true, t: 9 },
    { label: 'Watch the run land on dispatch', cat: 'test.step', depth: 0, ok: true, t: 20 },
    { label: 'Open /#/dispatch', cat: 'pw:api', depth: 1, ok: true, t: 21 },
    { label: 'proves dispatch:R2', cat: 'test.step', depth: 1, ok: true, t: 30 }
  ], 'board')
  assert.equal(ch.length, 2)
  assert.deepEqual(ch.map(c => c.screen), ['board', 'dispatch'])
  assert.equal(ch[1].title, 'Watch the run land on dispatch')
  assert.equal(ch[1].t, 20)
  assert.deepEqual(ch[1].reqs, ['R2'])
})
