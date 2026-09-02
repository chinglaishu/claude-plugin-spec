// The topbar must never outrun the voice. A narrated recording synthesizes its lines from the
// screen's narration pack BEFORE the run, so each line's duration is known — the pace file
// (BOARD_NARRATION_PACE) hands those durations to the run, and _base holds each beat until the
// previous line has finished speaking. Sync by construction: the bar cannot advance while its
// sentence is still in the air. Also proves the recorded band layout: under BOARD_RECORD the HUD
// is a FIXED-HEIGHT BAND that pushes the whole site down (nothing covered — the app's own fixed
// chrome shifts too, because the body transform re-roots it), and without a recording the page is
// left exactly alone.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = join(ROOT, 'spec', '_base.ts')

const TABLE = 'data:text/html,' + encodeURIComponent(
  '<table><tr><td>Repair</td><td id="t">4.00%</td></tr></table>')

function run (spec, env, grep) {
  const dir = mkdtempSync(join(ROOT, '.pace-'))
  try {
    writeFileSync(join(dir, 'pace.spec.ts'), spec(dir))
    writeFileSync(join(dir, 'pace.config.ts'),
      `import { defineConfig } from '@playwright/test'\n` +
      `export default defineConfig({ testDir: ${JSON.stringify(dir)}, testMatch: 'pace.spec.ts', workers: 1,\n` +
      `  outputDir: ${JSON.stringify(join(dir, 'out'))}, use: {} })\n`)
    const r = spawnSync('npx', ['playwright', 'test', '-c', join(dir, 'pace.config.ts'), '-g', grep], {
      cwd: ROOT, encoding: 'utf8', timeout: 120000, env: { ...process.env, FORCE_COLOR: '0', ...env }
    })
    r.side = existsSync(join(dir, 'side.json')) ? JSON.parse(readFileSync(join(dir, 'side.json'), 'utf8')) : null
    r.beats = existsSync(join(dir, 'beats.jsonl'))
      ? readFileSync(join(dir, 'beats.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
      : []
    return r
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('pace file + beat log: the second step waits out the failed first step’s line', () => {
  const paceFile = join(ROOT, '.pace-rules.json')
  const beatFile = join(ROOT, '.pace-beats.jsonl')
  writeFileSync(paceFile, JSON.stringify({
    gap: 100,
    cues: [
      { on: 'step', match: '^1\\.', ms: 1200 },
      { on: 'step-done', match: '^✗ 1\\.', ms: 1500 }
    ]
  }))
  rmSync(beatFile, { force: true })
  const r = run(() =>
    `import { test, expect, checkReq, coverReqs, flowStep } from ${JSON.stringify(BASE)}\n` +
    `const TABLE = ${JSON.stringify(TABLE)}\n` +
    `test('paced beats live', async ({ page }) => {\n` +
    `  coverReqs('R1')\n` +
    `  await page.goto(TABLE)\n` +
    `  await flowStep('A step that fails fast', async () => {\n` +
    `    await checkReq('R1', async () => { expect('a', 'forced').toBe('b') })\n` +
    `  })\n` +
    `  await flowStep('The step after it', async () => { await expect(page.locator('#t')).toHaveText('4.00%') })\n` +
    `})\n`,
  { BOARD_NARRATION_PACE: paceFile, BOARD_BEAT_LOG: beatFile }, 'paced beats live')
  const beats = existsSync(beatFile)
    ? readFileSync(beatFile, 'utf8').trim().split('\n').map(l => JSON.parse(l))
    : []
  rmSync(paceFile, { force: true }); rmSync(beatFile, { force: true })
  const at = (kind, rx) => beats.find(b => b.kind === kind && new RegExp(rx).test(b.label))?.t
  const step1 = at('step', '^1\\.')
  const fail1 = at('step-done', '^✗ 1\\.')
  const step2 = at('step', '^2\\.')
  assert.ok(step1 && fail1 && step2, `all three beats recorded:\n${r.stdout}\n${r.stderr}`)
  assert.ok(fail1 - step1 >= 1200, `the failed step held for its opening line (${fail1 - step1}ms >= 1200)`)
  assert.ok(step2 - fail1 >= 1500, `the next step waited out the fail line (${step2 - fail1}ms >= 1500)`)
})

test('introMs reserves the intro line at test start — the first step waits it out', () => {
  const paceFile = join(ROOT, '.pace-intro.json')
  const beatFile = join(ROOT, '.pace-intro-beats.jsonl')
  writeFileSync(paceFile, JSON.stringify({ gap: 100, introMs: 1500, cues: [] }))
  rmSync(beatFile, { force: true })
  const r = run((dir) =>
    `import { test, expect, flowStep } from ${JSON.stringify(BASE)}\n` +
    `import { writeFileSync } from 'node:fs'\n` +
    `const TABLE = ${JSON.stringify(TABLE)}\n` +
    `test('intro reserved', async ({ page }) => {\n` +
    `  const t0 = Date.now()\n` +
    `  await page.goto(TABLE)\n` +
    `  await flowStep('First step', async () => { await expect(page.locator('#t')).toHaveText('4.00%') })\n` +
    `  writeFileSync(${JSON.stringify(join(dir, 'side.json'))}, JSON.stringify({ t0 }))\n` +
    `})\n`,
  { BOARD_NARRATION_PACE: paceFile, BOARD_BEAT_LOG: beatFile }, 'intro reserved')
  const beats = existsSync(beatFile)
    ? readFileSync(beatFile, 'utf8').trim().split('\n').map(l => JSON.parse(l))
    : []
  rmSync(paceFile, { force: true }); rmSync(beatFile, { force: true })
  assert.equal(r.status, 0, `intro run should pass:\n${r.stdout}\n${r.stderr}`)
  const step1 = beats.find(b => b.kind === 'step')
  assert.ok(step1 && r.side, 'beat + start time recorded')
  assert.ok(step1.t - r.side.t0 >= 1200,
    `the first step waited out the intro (${step1.t - r.side.t0}ms >= ~1500 reserved before the test body began)`)
})

test('the narration is a callout overlay that never shifts the page — on a recorded run and on a plain one alike', () => {
  // The top BANNER (a band that pushed the body down by 142px) was retired 2026-08-28 for the
  // tour CALLOUT anchored to the ringed element (#__specboard-focus, spec/_base.ts renderOverlay).
  // The layout contract inverted with it: the page is NEVER shifted, recording or not — the
  // overlay floats above the app. Since 2026-09-02 a plain run paints the SAME overlay (the human:
  // no gap between schematic and proof, ever — a recording-gated ring let a terminal run harvest
  // ringless frames over the board's ringed ones); only the video stays recording-only.
  const recDir = join(ROOT, '.pace-rec-out')
  const spec = (dir) =>
    `import { test, expect, checkReq, proveVisible } from ${JSON.stringify(BASE)}\n` +
    `import { writeFileSync } from 'node:fs'\n` +
    `const TABLE = ${JSON.stringify(TABLE)}\n` +
    `test('band layout', async ({ page }) => {\n` +
    `  await page.goto(TABLE)\n` +
    `  await checkReq('R1', async () => { await proveVisible(page.locator('#t'), '4.00%', 'the cell') })\n` +
    `  writeFileSync(${JSON.stringify(join(dir, 'side.json'))}, JSON.stringify(await page.evaluate(() => {\n` +
    `    const ov = document.getElementById('__specboard-focus')\n` +
    `    const call = ov ? ov.querySelector('.sb-call') : null\n` +
    `    const ring = ov ? ov.querySelector('.sb-ring') : null\n` +
    `    const cell = document.getElementById('t').getBoundingClientRect()\n` +
    `    const callBox = call && call.style.display !== 'none' ? call.getBoundingClientRect() : null\n` +
    `    return {\n` +
    `      parent: ov && ov.parentElement ? ov.parentElement.tagName : null,\n` +
    `      hasCall: !!callBox, hasRing: !!(ring && ring.style.display !== 'none'),\n` +
    `      callText: call ? call.textContent : null,\n` +
    `      overlaps: callBox ? !(callBox.right < cell.left || callBox.left > cell.right || callBox.bottom < cell.top || callBox.top > cell.bottom) : null,\n` +
    `      bodyTransform: getComputedStyle(document.body).transform,\n` +
    `      tableTop: document.querySelector('table').getBoundingClientRect().top\n` +
    `    }\n` +
    `  })))\n` +
    `})\n`
  const rec = run(spec, { BOARD_RECORD: recDir, BOARD_STEP_DELAY_MS: '1' }, 'band layout')
  rmSync(recDir, { recursive: true, force: true })
  assert.equal(rec.status, 0, `recorded callout run should pass:\n${rec.stdout}\n${rec.stderr}`)
  const s = rec.side
  assert.ok(s, 'the spec wrote its observations')
  assert.equal(s.parent, 'HTML', 'the overlay hangs off <html>, outside the app\'s stacking contexts')
  assert.ok(s.hasRing, 'the proven cell is ringed')
  assert.ok(s.hasCall, 'the callout card is shown beside it')
  assert.match(String(s.callText), /R1/, 'the callout names the requirement')
  assert.equal(s.overlaps, false, 'the callout never covers the ringed cell')
  assert.equal(String(s.bodyTransform), 'none', 'the page is never shifted — the overlay floats above it')
  assert.ok(s.tableTop < 142, `page content stays where the app put it (top ${s.tableTop})`)

  const off = run(spec, {}, 'band layout')
  assert.equal(off.status, 0, `plain run should pass:\n${off.stdout}\n${off.stderr}`)
  assert.equal(off.side.parent, 'HTML', 'no recording → the same overlay, hung off <html>')
  assert.ok(off.side.hasRing && off.side.hasCall, 'no recording → the ring and the card still paint')
  assert.equal(off.side.overlaps, false, 'and the card still never covers the ringed cell')
  assert.equal(String(off.side.bodyTransform), 'none', 'no recording → the page is never shifted either')
})
