// The reporter records only tests that actually RAN. Playwright invokes custom reporters in
// `--list` mode too (onBegin/onEnd with the full suite and zero results), and a test that never
// ran has outcome 'skipped' — which the fold read as ok:false, so a bare LISTING recorded every
// case as failed-in-0ms and folded board-wide fail over the whole real index (observed 2026-08-21:
// a `--list` at 17:02Z poisoned _results-index.json + _runs.json, board.html rebuilt with every
// test fail/tagless, and the next real suite run failed 8 board reqs against the poisoned page).
// An unattempted case is NOT a failed case (rule 3 — never fake a red any more than a green): it
// must leave no record at all, so the fold keeps whatever honest state stood before.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attempted } from '../spec/_results-reporter.mjs'

test('a test with no results was never attempted — not recordable', () => {
  assert.equal(attempted({ results: [] }), false)
  assert.equal(attempted({}), false)
})

test('a test with any result (pass or fail) was attempted — recordable', () => {
  assert.equal(attempted({ results: [{ duration: 12 }] }), true)
  assert.equal(attempted({ results: [{ duration: 0, error: { message: 'x' } }] }), true)
})
