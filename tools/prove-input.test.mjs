// proveVisible reads what the ELEMENT shows — an input's value, everything else's text.
//
// The gap this pins (the human, 2026-08-29, on the Tsumiki demo's R1): proveVisible read
// textContent() only, and a form control's text is the empty string however much has been typed
// into it. So the natural assertion for a "When you type X" — prove the box now carries X — could
// not be written at all, and the ACTION a requirement names was never asserted, never ringed, and
// never photographed; only the row it produced was. Everything downstream (the beat's asserted-value
// frames, the schematic scene drawn from the same skeleton) hangs off being able to prove it.
//
// Like tools/base-aggregate.test.mjs, this runs a REAL Playwright suite against the REAL
// spec/_base.ts — the only honest way to test a fixture-bound helper — with no board, no reporter
// and no state guard. Against the old textContent-only reader the first case fails with
// `expected "Water the plants", got ""`, which is exactly the red this was written on.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const TOOLS = dirname(fileURLToPath(import.meta.url))
const ROOT = join(TOOLS, '..')

test('proveVisible proves an input by its value, and still fails on a wrong one', () => {
  const env = { ...process.env, FORCE_COLOR: '0' }
  // no board plumbing may leak in from the caller — this is the bare helper under test
  delete env.BOARD_RECORD; delete env.BOARD_ONE_WINDOW
  delete env.BOARD_NARRATION_PACE; delete env.BOARD_BEAT_LOG; delete env.BOARD_STEP_DELAY_MS
  const r = spawnSync(join(ROOT, 'node_modules', '.bin', 'playwright'),
    ['test', '--config', join(TOOLS, 'prove-input-fixture', 'playwright.config.ts')],
    { env, encoding: 'utf8', timeout: 120000 })
  const out = (r.stdout || '') + (r.stderr || '')
  assert.equal(r.status, 0, 'both cases must pass:\n' + out)
  assert.match(out, /2 passed/, out)
})
