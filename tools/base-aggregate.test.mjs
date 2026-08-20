// The failure aggregate travels WITH the extended `test` object into every spec file — exit
// honesty (Task 16, the human's 2026-08-21 ratification: a green `npm run e2e` must mean what it
// says).
//
// The bug this pins: spec/_base.ts once registered its STEP_FAILURES aggregate as a module-scope
// `test.afterEach(...)`. Playwright binds a hook call to the file suite loading when the call
// runs, and under workers:1 a worker caches modules — so the shared module executed (and the hook
// registered) only for the FIRST spec file loaded ('_modes', since '_' < 'b'). Every later file
// (board, conflicts, dispatch, init) ran with NO aggregate: checkReq's continue-on-failure catch
// pushed to STEP_FAILURES, nothing threw, the test reported "passed", the suite exited 0 over
// failed proves-steps. Only the folded index stayed honest.
//
// This test runs a real two-file Playwright suite (tools/base-aggregate-fixture/) that imports
// the REAL spec/_base.ts, where the LATER-loaded file swallows a deliberately failing checkReq.
// It must exit non-zero, attribute the failure to that file's test, keep the aggregate's message
// shape, and leave the first file green. Against the old afterEach shape this run reports
// "2 passed" and the assertions below go red — watched red exactly so before the fixture fix.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const TOOLS = dirname(fileURLToPath(import.meta.url))
const ROOT = join(TOOLS, '..')

test('a swallowed checkReq failure in a later-loaded spec file fails the run', () => {
  const env = { ...process.env, FORCE_COLOR: '0' }
  // the aggregate must not need any board plumbing — make sure none leaks in from the caller
  delete env.BOARD_RECORD; delete env.BOARD_ONE_WINDOW
  delete env.BOARD_NARRATION_PACE; delete env.BOARD_BEAT_LOG
  const r = spawnSync(join(ROOT, 'node_modules', '.bin', 'playwright'),
    ['test', '--config', join(TOOLS, 'base-aggregate-fixture', 'playwright.config.ts')],
    { env, encoding: 'utf8', timeout: 120000 })
  const out = (r.stdout || '') + (r.stderr || '')
  // the run's exit code is the whole point: a swallowed failure must not exit 0
  assert.notEqual(r.status, 0, 'the run must exit non-zero — a green here is the exit-0 lie:\n' + out)
  // attributed to the RIGHT test — the later-loaded file's, not the first-loaded one's
  assert.match(out, /1 failed/, 'exactly the one poisoned test fails:\n' + out)
  assert.match(out, /b-later\.spec\.ts.*must fail on a swallowed checkReq failure/s, out)
  assert.match(out, /1 passed/, 'the first-loaded honest file stays green:\n' + out)
  // the aggregate's message shape is preserved (same error the afterEach threw)
  assert.match(out, /1 step\(s\) failed:/, out)
  assert.match(out, /✗ "R1[^"]*": deliberate red/, out)
})
