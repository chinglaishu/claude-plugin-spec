import { test } from 'node:test'
import assert from 'node:assert/strict'
import { passStale, runStale } from './spec-store.mjs'

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

// CONTENT-AWARE staleness (the CI false positive, 2026-08-30). mtime is a PROXY for "the source
// moved"; a clean checkout stamps every file with checkout time, so on CI every committed proof
// read stale against a tree byte-identical to the fold that produced it — every requirement
// untested, board R4's "some proven rows exist" precondition dead and R12's derived next action a
// different sentence. The mtime stays as the cheap first gate; the FINGERPRINT the fold recorded
// beside the run (`srcHashes`, one hash per screen's sources) decides. Both must say moved.
const ms = { board: 100, dispatch: 300 }
const srcMs = s => ms[s]
const pinned = { board: 'B', dispatch: 'D' }        // what the fold recorded at run time
const same = s => pinned[s]                          // the tree still hashes to it
const moved = s => (s === 'dispatch' ? 'D2' : 'B')   // dispatch's sources really changed

test('a fresh checkout does NOT stale a pass: mtime is newer, the content fingerprint is identical', () => {
  const e = { status: 'pass', ranAt: 200, screen: 'board', srcHashes: pinned }
  // every source's mtime is now (a checkout) — the old rule called this stale, and was wrong
  const checkoutMs = () => Date.now()
  assert.equal(passStale(e, 'dispatch', checkoutMs, same), false)
  assert.equal(passStale(e, 'board', checkoutMs, same), false)
})

test('REAL drift still stales the pass — newer mtime AND a fingerprint that no longer matches', () => {
  const e = { status: 'pass', ranAt: 200, screen: 'board', srcHashes: pinned }
  assert.equal(passStale(e, 'dispatch', srcMs, moved), true)     // the requirement's own screen moved
  // and from the other side: the test file's screen moved instead
  const e2 = { status: 'pass', ranAt: 200, screen: 'dispatch', srcHashes: pinned }
  assert.equal(passStale(e2, 'board', srcMs, moved), true)
  // a fail is still never stale
  assert.equal(passStale({ ...e, status: 'fail' }, 'dispatch', srcMs, moved), false)
})

test('an unchanged fingerprint cannot revive a pass whose mtime gate never fired the other way', () => {
  // the gate is AND, so nothing newer than the run is not stale however the hashes read
  const e = { status: 'pass', ranAt: 400, screen: 'board', srcHashes: pinned }
  assert.equal(passStale(e, 'dispatch', srcMs, moved), false)
})

test('a record with no fingerprint keeps the OLD mtime answer — a pre-fix fold is never trusted blindly', () => {
  // rule 3: no evidence of the content is not evidence of sameness. A fold written before this
  // change carries no srcHashes; it must stay stale-by-mtime, not silently become current.
  const legacy = { status: 'pass', ranAt: 200, screen: 'board' }
  assert.equal(passStale(legacy, 'dispatch', srcMs, same), true)
  // …and a screen missing from an otherwise-present snapshot (a screen created after that fold)
  const partial = { status: 'pass', ranAt: 200, screen: 'board', srcHashes: { board: 'B' } }
  assert.equal(passStale(partial, 'dispatch', srcMs, same), true)
})

// The whole-RUN twin, readScreen's `ranstale` e2e cell: same two-part rule, one screen.
test('runStale reads the same way — the checkout is current, a real edit is ranstale', () => {
  const run = { ranAt: 200, srcHashes: pinned }
  assert.equal(runStale(run, 'dispatch', () => Date.now(), same), false)   // checkout
  assert.equal(runStale(run, 'dispatch', srcMs, moved), true)              // real edit
  assert.equal(runStale(run, 'board', srcMs, moved), false)                // board untouched
  assert.equal(runStale({ ranAt: 200 }, 'dispatch', srcMs, same), true)    // legacy: mtime rules
  assert.equal(runStale(undefined, 'dispatch', srcMs, same), false)        // never run
})
