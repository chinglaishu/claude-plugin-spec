// The flow composer's PURE logic (task 5, D4 + its two 2026-08-21 amendments), proven as plain
// functions (node --test; no server, no fs, no DOM):
//
//   parseBeats     — the per-screen steps.ts metadata (GIVEN + BEATS), read statically like
//                    parseTestPlan reads a spec: a light, tolerant scan, never an execution.
//   deriveLibrary  — the composer's nodes derive from BEHAVIOR BLOCKS + TESTS ONLY (the human,
//                    2026-08-21): a beat function whose requirement is passed ⇒ composable; a
//                    passed requirement with no beat ⇒ inline (Claude-path, marked); a behavior
//                    block with no covering test ⇒ outline ("first proof" framing); a requirement
//                    with NEITHER a behavior block NOR a tagging test ⇒ NO node at all.
//   validateChain  — beat N's Then must satisfy node N+1's Given: needs/gives joint tokens.
//   composeCheck   — the deterministic path's refusals: every reason the emitter must NOT write.
//   emitFlow       — chain → the composed spec/<start>/test.spec.ts (imports merged, coverReqs
//                    qualified + deduped, the fixture Given once, each beat call inside its
//                    checkReq, state threaded). Pure: text in, text out — the server writes.
//   composePrompt  — the Claude-path prompt (the manual-copy fallback shows the same contract).
//   flowLanded     — "did the flow test actually land in the file" (the agent job's changed()).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseBeats, deriveLibrary, validateChain, fillerFor, composable, validFlowName, mergeImports,
  composeCheck, emitFlow, composePrompt, flowLanded
} from './compose.mjs'

// ── fixtures ──────────────────────────────────────────────────────────────

const STEPS_SRC = `
import { expect } from '../_base'
import type { Page } from '@playwright/test'
export type FlowState = Record<string, any>

export const GIVEN = {
  fn: 'boardGiven',
  text: 'the served board, a fresh page',
  gives: ['board']
}

export const BEATS = [
  { fn: 'openBoardReader', proves: 'R10', name: 'Open the board detail — the reader is there',
    needs: ['board'], gives: ['reader-open'] },
  { fn: 'goldenCardCount', proves: 'R10', name: 'Announce a golden value on the narration bar',
    needs: ['board'], gives: ['counted'] }
]

export async function boardGiven (page: Page): Promise<FlowState> { return { cards: 4 } }
export async function openBoardReader (page: Page, state: FlowState) {}
export async function goldenCardCount (page: Page, state: FlowState) {}
`

const DISPATCH_STEPS_SRC = `
export const GIVEN = { fn: 'dispatchGiven', text: 'the served board', gives: ['board'] }
export const BEATS = [
  { fn: 'refreshInPlace', proves: 'R7', name: 'A finished run refreshes the board in place',
    needs: ['reader-open'], gives: ['refreshed'] }
]
`

// screens in the shape spec-store hands over: reqs carry status/behavior/tests; steps is parseBeats'
const screensFix = () => ([
  {
    name: 'board',
    steps: parseBeats(STEPS_SRC),
    reqs: [
      { id: 'R10', title: 'The recording explains itself', status: 'passed', behavior: null, tests: [{ title: 'x' }] },
      // passed, tagged by a test, NO beat function → inline (Claude-path only, marked)
      { id: 'R9', title: 'Search narrows the board', status: 'passed', behavior: { given: 'g', beats: [{ when: 'w', then: 't' }] }, tests: [{ title: 'y' }] },
      // a behavior block, NO tagging test → outline ("first proof" framing)
      { id: 'R20', title: 'A drafted behaviour', status: 'untested', behavior: { given: 'g', beats: [{ when: 'w', then: 't' }] }, tests: [] },
      // NEITHER a behavior block NOR a tagging test → NO node (the honesty rule)
      { id: 'R21', title: 'Prose only, untested', status: 'untested', behavior: null, tests: [] }
    ]
  },
  {
    name: 'dispatch',
    steps: parseBeats(DISPATCH_STEPS_SRC),
    reqs: [
      { id: 'R7', title: 'The panel stays', status: 'passed', behavior: null, tests: [{ title: 'z' }] }
    ]
  }
])

const lib = () => deriveLibrary(screensFix())
const byId = (l, id) => l.nodes.find(n => n.id === id)

// ── parseBeats ────────────────────────────────────────────────────────────

test('parseBeats reads GIVEN and every BEATS entry, with needs/gives arrays', () => {
  const s = parseBeats(STEPS_SRC)
  assert.deepEqual(s.given, { fn: 'boardGiven', text: 'the served board, a fresh page', gives: ['board'] })
  assert.equal(s.beats.length, 2)
  assert.deepEqual(s.beats[0], {
    fn: 'openBoardReader',
    proves: 'R10',
    name: 'Open the board detail — the reader is there',
    needs: ['board'],
    gives: ['reader-open']
  })
})

test('parseBeats degrades, never throws: no BEATS → empty; an entry missing fn/proves/name is skipped', () => {
  assert.deepEqual(parseBeats('const x = 1'), { given: null, beats: [] })
  const s = parseBeats(`export const BEATS = [
    { fn: 'ok', proves: 'R1', name: 'a beat', needs: [], gives: [] },
    { proves: 'R2', name: 'no fn — not callable, not a beat' }
  ]`)
  assert.equal(s.beats.length, 1)
  assert.equal(s.beats[0].fn, 'ok')
})

// ── deriveLibrary — the honesty table ─────────────────────────────────────

test('a beat function whose requirement is passed derives a COMPOSABLE node', () => {
  const n = byId(lib(), 'b:board:openBoardReader')
  assert.ok(n)
  assert.equal(n.kind, 'beat')
  assert.equal(n.proven, true)
  assert.equal(n.fn, 'openBoardReader')
  assert.deepEqual(n.needs, ['board'])
  assert.deepEqual(n.gives, ['reader-open'])
})

test('a passed requirement with no beat function derives an INLINE node — Claude-path only', () => {
  const n = byId(lib(), 'i:board:R9')
  assert.ok(n)
  assert.equal(n.kind, 'inline')
  assert.equal(n.proven, true)
  assert.equal(n.fn, null)
})

test('a behavior block with no tagging test derives an OUTLINE node — unproven, first proof', () => {
  const n = byId(lib(), 'o:board:R20')
  assert.ok(n)
  assert.equal(n.kind, 'outline')
  assert.equal(n.proven, false)
})

test('THE HONESTY RULE — a requirement with neither behavior block nor tagging test derives NO node', () => {
  const l = lib()
  assert.equal(l.nodes.some(n => n.proves === 'R21' && n.screen === 'board'), false)
})

test('a requirement a test TAGS IN SOURCE (a plan cover) but that has never folded still derives an INLINE node — cross-screen too', () => {
  // "a node exists only where a behavior block or a test does" — the test EXISTS the moment it is
  // written (parseTestPlan reads its checkReq tags off the source); the fold only says whether it
  // passed. A never-run tagging test ⇒ an inline node, proven:false; a bare plan tag is this screen,
  // a qualified one (`dispatch:R7` in the board spec) lands on the other screen.
  const screens = screensFix()
  screens[0].reqs.push({ id: 'R22', title: 'Tagged, never run', status: 'untested', behavior: null, tests: [] })
  screens[1].reqs.push({ id: 'R8', title: 'Other screen, tagged from board', status: 'untested', behavior: null, tests: [] })
  screens[0].plans = [{ title: 'a new test', steps: [], covers: ['R22', 'dispatch:R8'] }]
  const l = deriveLibrary(screens)
  const n = byId(l, 'i:board:R22')
  assert.ok(n, 'a source-tagged requirement derives an inline node')
  assert.equal(n.proven, false)
  const x = byId(l, 'i:dispatch:R8')
  assert.ok(x, 'a qualified plan tag derives the other screen\'s inline node')
  assert.equal(x.proven, false)
})

test('a beat covering a requirement suppresses that requirement\'s inline duplicate', () => {
  const l = lib()
  assert.equal(byId(l, 'i:board:R10'), undefined)  // R10 is beat-covered; no second node
})

test('a beat whose requirement is NOT passed is not composable (proven:false)', () => {
  const screens = screensFix()
  screens[0].reqs[0].status = 'changed'   // proven before, text moved — must re-verify first
  const n = byId(deriveLibrary(screens), 'b:board:openBoardReader')
  assert.equal(n.proven, false)
})

test('givens carry per screen; a screen without steps has null', () => {
  const l = lib()
  assert.equal(l.givens.board.fn, 'boardGiven')
  const noSteps = deriveLibrary([{ name: 'bare', steps: null, reqs: [] }])
  assert.equal(noSteps.givens.bare, null)
})

// ── validateChain — the joint check ───────────────────────────────────────

test('a chain whose every needs is met by the given + earlier gives has no gap', () => {
  const l = lib()
  const v = validateChain(l.nodes, ['b:board:openBoardReader', 'b:dispatch:refreshInPlace'], ['board'])
  assert.deepEqual(v.map(x => x.missing), [[], []])
})

test('a beat whose needs no earlier Then gives reads a GAP naming the missing token', () => {
  const l = lib()
  const v = validateChain(l.nodes, ['b:board:goldenCardCount', 'b:dispatch:refreshInPlace'], ['board'])
  assert.deepEqual(v[1].missing, ['reader-open'])
})

test('fillerFor finds a node whose gives covers the missing token', () => {
  const l = lib()
  const f = fillerFor(l.nodes, ['reader-open'])
  assert.equal(f.id, 'b:board:openBoardReader')
  assert.equal(fillerFor(l.nodes, ['no-such-token']), null)
})

test('composable — every chained node function-shaped AND proven; the blockers are named', () => {
  const l = lib()
  assert.equal(composable(l.nodes, ['b:board:openBoardReader', 'b:dispatch:refreshInPlace']).ok, true)
  const c = composable(l.nodes, ['b:board:openBoardReader', 'i:board:R9', 'o:board:R20'])
  assert.equal(c.ok, false)
  assert.deepEqual(c.blocking.map(n => n.proves), ['R9', 'R20'])
  assert.equal(composable(l.nodes, []).ok, false)   // an empty chain composes nothing
})

// ── composeCheck — every refusal the deterministic path owes ──────────────

const okArgs = () => {
  const l = lib()
  return {
    nodes: l.nodes,
    givens: l.givens,
    chain: ['b:board:openBoardReader', 'b:dispatch:refreshInPlace'],
    name: 'Reader to refresh round trip',
    existing: "import { test } from '../_base'\ntest('unrelated', async () => {})\n"
  }
}

test('composeCheck accepts a valid all-beat chain and names start + covers (qualified, deduped)', () => {
  const c = composeCheck(okArgs())
  assert.equal(c.ok, true)
  assert.equal(c.start, 'board')
  assert.deepEqual(c.covers, ['R10', 'dispatch:R7'])
})

test('composeCheck refuses: empty chain · unknown id · a non-composable beat (named) · a gap (token named) · no GIVEN · empty name · duplicate test name', () => {
  const a = okArgs()
  assert.match(composeCheck({ ...a, chain: [] }).error, /chain at least one beat/i)
  assert.match(composeCheck({ ...a, chain: ['nope'] }).error, /no such beat/i)
  const c1 = composeCheck({ ...a, chain: ['b:board:openBoardReader', 'i:board:R9'] })
  assert.equal(c1.ok, false)
  assert.match(c1.error, /R9/)
  assert.match(c1.error, /Claude/i)
  const c2 = composeCheck({ ...a, chain: ['b:board:goldenCardCount', 'b:dispatch:refreshInPlace'] })
  assert.equal(c2.ok, false)
  assert.match(c2.error, /reader-open/)
  const noGiven = { ...a, givens: { ...a.givens, board: null } }
  assert.match(composeCheck(noGiven).error, /GIVEN/)
  assert.match(composeCheck({ ...a, name: '   ' }).error, /name/i)
  const dup = { ...a, existing: "test('Reader to refresh round trip', async () => {})" }
  assert.match(composeCheck(dup).error, /already exists/i)
})

// ── emitFlow — the composed file ──────────────────────────────────────────

test('emitFlow appends the composed test: imports merged, coverReqs qualified+deduped, the Given once, each beat inside its checkReq, state threaded', () => {
  const a = okArgs()
  a.chain = ['b:board:openBoardReader', 'b:board:goldenCardCount', 'b:dispatch:refreshInPlace']
  const out = emitFlow(a)
  assert.equal(out.path, 'spec/board/test.spec.ts')
  assert.equal(out.testTitle, 'Reader to refresh round trip')
  const t = out.text
  // the existing content survives, whole
  assert.ok(t.includes("test('unrelated', async () => {})"))
  // imports: same-screen beats + the given from './steps'; the cross-screen beat from '../dispatch/steps'
  assert.match(t, /import \{ boardGiven, openBoardReader, goldenCardCount \} from '\.\/steps'/)
  assert.match(t, /import \{ refreshInPlace \} from '\.\.\/dispatch\/steps'/)
  // coverReqs: chain order, deduped (R10 once), the cross-screen tag qualified
  assert.ok(t.includes("await coverReqs('R10', 'dispatch:R7')"))
  // the fixture Given exactly once, threading state
  assert.equal(t.split('const state = await boardGiven(page)').length, 2)
  // each beat call inside its checkReq inside its flowStep, in chain order, state threaded
  const i1 = t.indexOf("await checkReq('R10', async () => { await openBoardReader(page, state) })")
  const i2 = t.indexOf("await checkReq('R10', async () => { await goldenCardCount(page, state) })")
  const i3 = t.indexOf("await checkReq('dispatch:R7', async () => { await refreshInPlace(page, state) })")
  assert.ok(i1 > -1 && i2 > i1 && i3 > i2)
  assert.ok(t.includes("await flowStep('Open the board detail — the reader is there', async () => {"))
  // the provenance note names the rule that makes a composed flow valid
  assert.match(t, /rule 1 addendum/i)
})

test('emitFlow merges into an EXISTING import line rather than duplicating the binding', () => {
  const a = okArgs()
  a.chain = ['b:board:openBoardReader']
  a.existing = "import { test, checkReq, coverReqs, flowStep } from '../_base'\n" +
    "import { boardGiven } from './steps'\n\ntest('unrelated', async () => {})\n"
  const t = emitFlow(a).text
  // ONE import of './steps', now carrying both names — never a second (duplicate-binding) line
  assert.equal(t.match(/from '\.\/steps'/g).length, 1)
  assert.match(t, /import \{ boardGiven, openBoardReader \} from '\.\/steps'/)
})

test('emitFlow with no existing file emits a whole file importing the harness from ../_base', () => {
  const a = okArgs()
  a.chain = ['b:board:openBoardReader']
  a.existing = null
  const t = emitFlow(a).text
  assert.match(t, /import \{ test, checkReq, coverReqs, flowStep \} from '\.\.\/_base'/)
})

test('emitFlow escapes quotes in the flow name and beat names', () => {
  const a = okArgs()
  a.name = "the human's flow"
  a.chain = ['b:board:openBoardReader']
  const t = emitFlow(a).text
  assert.ok(t.includes("test('the human\\'s flow'"))
})

// ── composePrompt — the Claude-path contract ──────────────────────────────

test('composePrompt names the file, the test name, the qualified cover set, every beat, and the kg-e2e discipline', () => {
  const a = okArgs()
  a.chain = ['b:board:openBoardReader', 'o:board:R20', 'b:dispatch:refreshInPlace']
  const p = composePrompt(a)
  assert.match(p, /spec\/board\/test\.spec\.ts/)
  assert.match(p, /Reader to refresh round trip/)
  assert.match(p, /coverReqs\('R10', 'R20', 'dispatch:R7'\)/)
  assert.match(p, /beat 1 — Open the board detail/)
  assert.match(p, /R20.*UNPROVEN/i)                      // an outline beat is this flow's FIRST proof
  assert.match(p, /failing test FIRST/i)
  assert.match(p, /checkReq/)
})

// ── flowLanded — the agent job's disk check ───────────────────────────────

test('flowLanded is true only when a test with exactly that title exists in the source', () => {
  assert.equal(flowLanded("test('My flow', async ({ page }) => {})", 'My flow'), true)
  assert.equal(flowLanded("test('My flow extended', () => {})", 'My flow'), false)
  assert.equal(flowLanded('', 'My flow'), false)
  assert.equal(flowLanded("test('the human\\'s flow', () => {})", "the human's flow"), true)
})

// ── fix round 1 (task-5 review, 2026-08-22) ───────────────────────────────
test('B-1: emitting into an EXISTING file that lacks the harness names merges them into its ../_base import', () => {
  const a = okArgs()
  a.chain = ['b:board:openBoardReader']
  a.existing = "import { test, expect } from '../_base'\n\ntest('unrelated', async () => {})\n"
  const t = emitFlow(a).text
  assert.equal(t.match(/from '\.\.\/_base'/g).length, 1)
  assert.match(t, /import \{ test, expect, checkReq, coverReqs, flowStep \} from '\.\.\/_base'/)
})

test('B-2: a flow name with a line terminator, a control character or over 200 chars is refused — never emitted', () => {
  for (const bad of ['a\nb', 'a\rb', 'x y', 'x y', 'tab\there', 'nul ', 'del', 'y'.repeat(201)]) {
    const a = okArgs(); a.name = bad
    const chk = composeCheck(a)
    assert.equal(chk.ok, false, JSON.stringify(bad))
    assert.match(chk.error, /flow name/i)
    assert.throws(() => emitFlow(a))
  }
  assert.equal(validFlowName('Home to the List — composed'), true)
  assert.equal(validFlowName('y'.repeat(200)), true)
})

test('B-4: flowLanded matches a test() call only at the start of a line — never one quoted in a string or comment', () => {
  assert.equal(flowLanded("// test('X')\nconst s = \"test('X')\"\n", 'X'), false)
  assert.equal(flowLanded("  test('X', async () => {})\n", 'X'), true)
  assert.equal(flowLanded("test('X', async () => {})", 'X'), true)
})

test('B-6: parseBeats skips an entry whose fn is not a plain identifier (it is interpolated as a call)', () => {
  const src = `export const BEATS = [
  { fn: 'good_1', proves: 'R1', name: 'ok', needs: [], gives: [] },
  { fn: 'evil(); x', proves: 'R2', name: 'bad', needs: [], gives: [] },
  { fn: '1abc', proves: 'R3', name: 'bad', needs: [], gives: [] }
]
export const GIVEN = { fn: 'seed()', text: 't', gives: [] }`
  const p = parseBeats(src)
  assert.deepEqual(p.beats.map(b => b.fn), ['good_1'])
  assert.equal(p.given, null)
})

test('B-7: mergeImports adds a new module after the LEADING import block, not after a mid-file import', () => {
  const src = "import { test } from '../_base'\nimport { a } from './steps'\n\ntest('x', async () => {})\n" +
    "import { late } from 'node:fs'\nconst s = `\nimport { fake } from \"nowhere\"\n`\n"
  const out = mergeImports(src, '../dispatch/steps', ['r'])
  const lines = out.split('\n')
  assert.equal(lines[2], "import { r } from '../dispatch/steps'")
  assert.equal(out.match(/from '\.\.\/dispatch\/steps'/g).length, 1)
})

// ── final review m2 / m5 ──────────────────────────────────────────────────
test('m2: a beat whose proof is PASSED-BUT-STALE (its source moved since the fold) reads stale:true, and composeCheck says so — "run first", not the cryptic not-proven', () => {
  const screens = screensFix()
  // the spec-store shape: status falls to untested once every pass is stale by source; the stale
  // pass itself is still on the requirement's tests
  screens[0].reqs[0].status = 'untested'
  screens[0].reqs[0].tests = [{ title: 'x', status: 'pass', stale: true }]
  const l = deriveLibrary(screens)
  const n = byId(l, 'b:board:openBoardReader')
  assert.equal(n.proven, false)
  assert.equal(n.stale, true)
  // a beat never passed is NOT stale
  assert.equal(byId(l, 'o:board:R20').stale, false)
  const c = composeCheck({ nodes: l.nodes, givens: l.givens, chain: ['b:board:openBoardReader'], name: 'x', existing: null })
  assert.equal(c.ok, false)
  assert.match(c.error, /R10 .*proven, but stale by source — run spec\/board first/)
  assert.doesNotMatch(c.error, /not function-shaped/)
  // a NEVER-proven beat keeps the not-proven wording (the two reasons are distinguished)
  screens[0].reqs[0].tests = []
  const l2 = deriveLibrary(screens)
  const c2 = composeCheck({ nodes: l2.nodes, givens: l2.givens, chain: ['b:board:openBoardReader'], name: 'x', existing: null })
  assert.match(c2.error, /R10 is not function-shaped \+ proven/)
})

test('m5: parseBeats refuses a QUALIFIED proves (the convention is a bare id — a qualified one would mis-qualify in the cover set)', () => {
  const s = parseBeats(`export const BEATS = [
    { fn: 'ok', proves: 'R1', name: 'a beat', needs: [], gives: [] },
    { fn: 'bad', proves: 'x:R3', name: 'qualified — skipped', needs: [], gives: [] },
    { fn: 'bad2', proves: 'R 3', name: 'not an id — skipped', needs: [], gives: [] }
  ]`)
  assert.deepEqual(s.beats.map(b => b.fn), ['ok'])
})

// ── Task 7 (2026-08-22): a beat's wall-clock BUDGET rides the chain into the composed test ──
// The first cross-screen compose that chained dispatch's run beats (a nested board run, 147 s
// measured) would have died at Playwright's 60 s default — a composition defect by rule 1's
// addendum (fix the composition, never the beat). So a BEATS entry may declare `ms`, the emitter
// sums the chain's budgets (an undeclared beat counts 60 s, the harness default; the fixture the
// same) and emits ONE test.setTimeout(total) before the Given — and a short chain still carries
// the default-sized budget, so the emitted file never waits longer than it asked to.
test('parseBeats reads an optional numeric ms budget per beat (absent → not carried)', () => {
  const s = parseBeats(`export const BEATS = [
    { fn: 'slow', proves: 'R1', name: 'a nested run', needs: [], gives: [], ms: 230000 },
    { fn: 'quick', proves: 'R2', name: 'a click', needs: [], gives: [] }
  ]`)
  assert.equal(s.beats[0].ms, 230000)
  assert.equal('ms' in s.beats[1], false)
})

test('emitFlow sets ONE test timeout = the fixture default + every chained beat\'s budget (undeclared = 60 s)', () => {
  const screens = screensFix()
  screens[1].steps = parseBeats(`
export const GIVEN = { fn: 'dispatchGiven', text: 'the served board', gives: ['board'] }
export const BEATS = [
  { fn: 'refreshInPlace', proves: 'R7', name: 'A finished run refreshes the board in place',
    needs: ['reader-open'], gives: ['refreshed'], ms: 230000 }
]`)
  const { nodes, givens } = deriveLibrary(screens)
  assert.equal(byId({ nodes }, 'b:dispatch:refreshInPlace').ms, 230000)
  const a = okArgs()
  a.nodes = nodes; a.givens = givens
  a.chain = ['b:board:openBoardReader', 'b:dispatch:refreshInPlace']
  const t = emitFlow(a).text
  // 60000 (fixture) + 60000 (undeclared beat) + 230000 (declared)
  assert.equal(t.match(/test\.setTimeout\(/g).length, 1)
  assert.ok(t.includes('  test.setTimeout(350000)'))
  // before the Given — the budget must be set before any waiting starts
  assert.ok(t.indexOf('test.setTimeout(350000)') < t.indexOf('const state = await boardGiven(page)'))
})

// Task 7 review A5-a: `ms: 150_000` — the numeric-separator style this repo uses for every
// test.setTimeout — parsed as 150 ms, so the budget silently collapsed to the default + 150 ms
test('parseBeats reads an ms budget written with numeric separators (150_000 → 150000)', () => {
  const s = parseBeats(`export const BEATS = [
    { fn: 'slow', proves: 'R1', name: 'a nested run', needs: [], gives: [], ms: 150_000 }
  ]`)
  assert.equal(s.beats[0].ms, 150000)
})
