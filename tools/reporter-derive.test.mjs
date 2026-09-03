// tools/reporter-derive.test.mjs — DERIVE THE SCHEMATICS AT EVERY FOLD (2026-09-02).
//
// The defect this pins: nothing derived the drawings automatically. The reporter folded the harvest
// and serve-board rebuilt board.html, but `node tools/viz-derive.mjs` was a by-hand command — so
// after every run the committed schematics were drawn from the PREVIOUS harvest's geometry: the ring
// and the callout came out of the drawing (their cardspots empty, which un-frames the callout on the
// proof side too) and nobody could see why. A drawing derived from a harvest is a by-product of that
// harvest, so it lands with it.
//
// It is a by-product, which means it can NEVER fail a run (rule 3 is about the proof, and a drawing
// is not proof): a derive that throws is logged and swallowed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveSchematics } from '../spec/_results-reporter.mjs'

const spy = (throws = false) => {
  const calls = []
  const fn = (...args) => { calls.push(args); if (throws) throw new Error('derive blew up') }
  fn.calls = calls
  return fn
}

test('the fold derives the screens it folded — this node, the real viz-derive, those screen names', () => {
  const exec = spy()
  assert.equal(deriveSchematics(['board', 'todo'], exec), true)
  assert.equal(exec.calls.length, 1, 'ONE pass for the whole fold, not one per screen')
  const [bin, args, opts] = exec.calls[0]
  assert.equal(bin, process.execPath, 'the node running the reporter, never a bare "node" off PATH')
  assert.match(args[0], /tools\/viz-derive\.mjs$/, 'the viz pass\'s own shell')
  assert.deepEqual(args.slice(1), ['board', 'todo'], 'and only the screens this run folded')
  assert.ok(opts && opts.timeout > 0, 'bounded — a hung derive can never hold the run open')
})

test('a `_`-prefixed pseudo-screen is not a row, so it is never derived', () => {
  const exec = spy()
  deriveSchematics(['_setup', 'board', 'board'], exec)
  assert.deepEqual(exec.calls[0][1].slice(1), ['board'], 'de-duplicated, and the setup file dropped')
})

test('nothing folded → nothing spawned', () => {
  const exec = spy()
  assert.equal(deriveSchematics([], exec), false)
  assert.equal(deriveSchematics(['_setup'], exec), false)
  assert.equal(exec.calls.length, 0)
})

test('a derive that throws is swallowed — a drawing is a by-product, never a red run', () => {
  const exec = spy(true)
  assert.doesNotThrow(() => assert.equal(deriveSchematics(['board'], exec), false))
  assert.equal(exec.calls.length, 1, 'it really was attempted')
})

// ── 2026-09-03: WHICH screens the fold must draw. A COMPOSED FLOW crosses screens — the init flow
// tags board:R1 and board:R9 — so one run of `spec/init/test.spec.ts` lands FRESH evidence on the
// board screen while byScreen (keyed by the test FILE's screen) names only init. The board's
// drawings were then a harvest behind their own skeletons on every such run, and `npm run proof
// mirror` went red with "the layout pin has moved: the harvest is newer than the drawing" — found
// by running exactly that one file (rule 4: the guard was right, the reporter was wrong).
// The screens to draw are the test files' screens UNION the screens the evidence actually landed on.
import { screensToDraw } from '../spec/_results-reporter.mjs'

test('a cross-screen tag makes the OTHER screen a screen to draw', () => {
  assert.deepEqual(
    screensToDraw({ init: {} }, { 'init:R1': {}, 'board:R1': {}, 'board:R9': {} }).sort(),
    ['board', 'init'], 'the board harvested fresh skeletons, so the board must be redrawn')
})
test('a screen that ran but harvested nothing is still drawn, and nothing is invented', () => {
  assert.deepEqual(screensToDraw({ init: {}, board: {} }, {}).sort(), ['board', 'init'])
  assert.deepEqual(screensToDraw({}, {}), [])
  assert.deepEqual(screensToDraw({ init: {} }, { R1: {} }), ['init'], 'an unqualified id names no screen')
})
