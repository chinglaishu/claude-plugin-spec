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
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const TOOLS = dirname(fileURLToPath(import.meta.url))
const ROOT = join(TOOLS, '..')

test('proveVisible proves an input by its value, and still fails on a wrong one', () => {
  const mark = join(tmpdir(), 'sb-prove-input-soft-' + process.pid)
  rmSync(mark, { force: true })
  const report = join(tmpdir(), 'sb-prove-input-report-' + process.pid + '.json')
  rmSync(report, { force: true })
  // the fixture has no fold reporter, so adding the json one here replaces nothing that matters —
  // it is the only way to read an EXPECTED failure's error (the list reporter prints none)
  const env = { ...process.env, FORCE_COLOR: '0', SOFT_MARK: mark, PLAYWRIGHT_JSON_OUTPUT_NAME: report }
  // no board plumbing may leak in from the caller — this is the bare helper under test
  delete env.BOARD_RECORD; delete env.BOARD_ONE_WINDOW
  delete env.BOARD_NARRATION_PACE; delete env.BOARD_BEAT_LOG; delete env.BOARD_STEP_DELAY_MS
  const r = spawnSync(join(ROOT, 'node_modules', '.bin', 'playwright'),
    ['test', '--config', join(TOOLS, 'prove-input-fixture', 'playwright.config.ts'), '--reporter=list,json'],
    { env, encoding: 'utf8', timeout: 120000 })
  const out = (r.stdout || '') + (r.stderr || '')
  assert.equal(r.status, 0, 'every case must pass (the soft-claim one is EXPECTED to fail):\n' + out)
  assert.match(out, /3 passed/, out)
  // the soft-claim beat ran to its end: the third claim wrote the marker after two red ones
  assert.ok(existsSync(mark), 'the third soft claim was reached after two failed ones')
  const said = readFileSync(mark, 'utf8')
  rmSync(mark, { force: true })
  assert.match(said, /reached the third claim/)
  assert.match(said, /\(missing\)/, 'a missing element reads as (missing), never as an empty string')
  // …and the aggregate named BOTH failures, not just the first — read off the json report, since
  // the list reporter prints nothing for a failure the test declared expected
  const j = JSON.parse(readFileSync(report, 'utf8'))
  rmSync(report, { force: true })
  const errs = []
  const walk = su => { for (const sp of su.specs || []) for (const t of sp.tests || []) for (const r of t.results || []) for (const e of r.errors || []) errs.push(String(e.message || '')); for (const c of su.suites || []) walk(c) }
  for (const su of j.suites || []) walk(su)
  // …and the missing element's layout skeleton carries the flag the drawing needs (a removed element
  // is found by its expected text, never by the ring's box) — read off the run's own attachments
  const atts = []
  const walkA = su => { for (const sp of su.specs || []) for (const t of sp.tests || []) for (const r of t.results || []) for (const a of r.attachments || []) atts.push(a); for (const c of su.suites || []) walkA(c) }
  for (const su of j.suites || []) walkA(su)
  const v2 = atts.find(a => /layout R1#1 v2/.test(a.name || ''))
  assert.ok(v2 && v2.path && existsSync(v2.path), 'the second claim filed a layout skeleton: ' + atts.map(a => a.name).join(', '))
  const lay = JSON.parse(readFileSync(v2.path, 'utf8'))
  assert.deepEqual(lay.claim, { expected: 'Undo', got: '(missing)', ok: false, missing: true }, 'the skeleton says the element was missing')
  const agg = errs.find(m => /claims failed/.test(m)) || ''
  assert.match(agg, /2 claims failed/, 'the proves step fails once with the whole list:\n' + errs.join('\n---\n'))
  assert.match(agg, /first — deliberately wrong/)
  assert.match(agg, /second — nothing there at all/)
  assert.match(agg, /\(missing\)/, 'and says the missing element was missing')
})
