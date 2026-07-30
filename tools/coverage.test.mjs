// The coverage foundation: a test proves requirements by tagging them (many-to-many, by qualified
// id) and asserting each one. These pure functions turn what a run recorded — the `proves <id>`
// steps it ran and the `covers` tags it declared — into per-requirement pass / fail / not-reached,
// then roll that up into a requirement's proven / unproven state. No Playwright, no
// board, no browser (node --test), because the single thing this product cannot get wrong is the
// derivation of whether a requirement is actually proven.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coverageFromTest, aggregateCoverage, deriveReqState, qualify } from './coverage.mjs'

// qualify -------------------------------------------------------------------
test('a bare id is qualified with the test\'s own screen; a qualified id is left alone', () => {
  assert.equal(qualify('R4', 'board'), 'board:R4')
  assert.equal(qualify('asset-plan:R5', 'board'), 'asset-plan:R5')
})

// coverageFromTest ----------------------------------------------------------
const step = (title, error = null, steps = []) => ({ title, category: 'test.step', error, steps })

test('a passing "proves" step marks that requirement passed, qualified to the screen', () => {
  const cov = coverageFromTest({ screen: 'board', steps: [step('proves R4')], annotations: [] })
  assert.deepEqual(cov, { 'board:R4': 'pass' })
})

test('a failing "proves" step marks that requirement failed — never a silent pass', () => {
  const cov = coverageFromTest({ screen: 'board', steps: [step('proves R4', { message: 'x' })], annotations: [] })
  assert.deepEqual(cov, { 'board:R4': 'fail' })
})

test('a cross-screen tag keeps its qualifier — a flow can prove another screen\'s requirement', () => {
  const cov = coverageFromTest({ screen: 'board', steps: [step('proves asset-plan:R5')], annotations: [] })
  assert.deepEqual(cov, { 'asset-plan:R5': 'pass' })
})

test('a declared tag never reached by the flow is not-reached — not green, not red', () => {
  // covers declares two; the flow only reached the first (the second checkReq never ran because the
  // first threw). The unreached one must read as honestly unproven, distinct from pass and fail.
  const cov = coverageFromTest({
    screen: 'board',
    steps: [step('proves R4', { message: 'boom' })],
    annotations: [{ type: 'covers', description: 'R4 R9' }]
  })
  assert.deepEqual(cov, { 'board:R4': 'fail', 'board:R9': 'not-reached' })
})

test('a proven step overrides a not-reached declaration for the same id', () => {
  const cov = coverageFromTest({
    screen: 'board',
    steps: [step('proves R4')],
    annotations: [{ type: 'covers', description: 'R4' }]
  })
  assert.deepEqual(cov, { 'board:R4': 'pass' })
})

test('nested "proves" steps are found, not only top-level ones', () => {
  const cov = coverageFromTest({
    screen: 'board',
    steps: [step('open the plan', null, [step('proves R6')])],
    annotations: []
  })
  assert.deepEqual(cov, { 'board:R6': 'pass' })
})

test('a step that is not a "proves" step is ignored', () => {
  const cov = coverageFromTest({ screen: 'board', steps: [step('click the button')], annotations: [] })
  assert.deepEqual(cov, {})
})

// aggregateCoverage ---------------------------------------------------------
test('coverage is aggregated across screens by qualified id — a requirement lists every test', () => {
  const index = {
    board: { ranAt: 100, tests: [{ title: 'home renders', ok: true, reqs: { 'board:R1': 'pass' } }] },
    'asset-plan': {
      ranAt: 200,
      tests: [
        { title: 'edit reflects in tenancy', ok: true, reqs: { 'asset-plan:R5': 'pass', 'tenancy:R3': 'pass' } }
      ]
    }
  }
  const agg = aggregateCoverage(index)
  assert.deepEqual(agg['tenancy:R3'], [
    { title: 'edit reflects in tenancy', screen: 'asset-plan', status: 'pass', ok: true, ranAt: 200 }
  ])
  assert.equal(agg['board:R1'].length, 1)
  assert.equal(agg['asset-plan:R5'][0].screen, 'asset-plan')
})

test('a test with no reqs contributes nothing to the aggregate', () => {
  const agg = aggregateCoverage({ board: { ranAt: 1, tests: [{ title: 't', ok: true }] } })
  assert.deepEqual(agg, {})
})

// deriveReqState ------------------------------------------------------------
// No acceptance gate (board R8): state is just proven / unproven, computed from the tests.
test('a current passing proof makes a requirement proven', () => {
  assert.equal(deriveReqState({ hasCurrentPass: true }), 'proven')
})

test('no current passing proof leaves a requirement unproven — fail, not-reached and stale all count', () => {
  assert.equal(deriveReqState({ hasCurrentPass: false }), 'unproven')
})
