import { test } from 'node:test'
import assert from 'node:assert/strict'
import { passStale } from './spec-store.mjs'

// fix round 1 (task-5 review B-3): a pass is stale against the NEWEST source of EITHER screen — the
// one whose test file produced it, or the requirement's own (its steps.ts carries the beat's
// assertion body; a cross-screen beat like dispatch:R7 is proven only from the board's file).
test('a pass goes stale when the REQUIREMENT\'s own screen source moves, not only the test file\'s screen', () => {
  const ms = { board: 100, dispatch: 300 }
  const srcMs = s => ms[s]
  // run at 200: board (the test file) unchanged since, but dispatch/steps.ts moved at 300
  assert.equal(passStale({ status: 'pass', ranAt: 200, screen: 'board' }, 'dispatch', srcMs), true)
  assert.equal(passStale({ status: 'pass', ranAt: 400, screen: 'board' }, 'dispatch', srcMs), false)
  // the test file's own screen still counts
  assert.equal(passStale({ status: 'pass', ranAt: 200, screen: 'dispatch' }, 'board', srcMs), true)
  // a fail is never stale
  assert.equal(passStale({ status: 'fail', ranAt: 1, screen: 'board' }, 'dispatch', srcMs), false)
})
