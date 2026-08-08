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

test('under BOARD_RECORD the HUD is a band that pushes the site down; without it the page is untouched', () => {
  const recDir = join(ROOT, '.pace-rec-out')
  const spec = (dir) =>
    `import { test, expect, flowStep } from ${JSON.stringify(BASE)}\n` +
    `import { writeFileSync } from 'node:fs'\n` +
    `const TABLE = ${JSON.stringify(TABLE)}\n` +
    `test('band layout', async ({ page }) => {\n` +
    `  await page.goto(TABLE)\n` +
    `  await flowStep('Paint the bar', async () => { await expect(page.locator('#t')).toHaveText('4.00%') })\n` +
    `  writeFileSync(${JSON.stringify(join(dir, 'side.json'))}, JSON.stringify(await page.evaluate(() => {\n` +
    `    const hud = document.getElementById('__specboard-hud')\n` +
    `    return {\n` +
    `      parent: hud && hud.parentElement ? hud.parentElement.tagName : null,\n` +
    `      height: hud ? hud.getBoundingClientRect().height : null,\n` +
    `      bodyTransform: getComputedStyle(document.body).transform,\n` +
    `      tableTop: document.querySelector('table').getBoundingClientRect().top\n` +
    `    }\n` +
    `  })))\n` +
    `})\n`
  const rec = run(spec, { BOARD_RECORD: recDir, BOARD_STEP_DELAY_MS: '1' }, 'band layout')
  rmSync(recDir, { recursive: true, force: true })
  assert.equal(rec.status, 0, `recorded band run should pass:\n${rec.stdout}\n${rec.stderr}`)
  const s = rec.side
  assert.ok(s, 'the spec wrote its observations')
  assert.equal(s.parent, 'HTML', 'the HUD hangs off <html>, outside the shifted body')
  assert.equal(Math.round(s.height), 118, 'the HUD is a fixed-height band')
  assert.match(String(s.bodyTransform), /matrix\(1, 0, 0, 1, 0, 118\)/, 'the body is shifted down by the band height')
  assert.ok(s.tableTop >= 118, `page content starts below the band (top ${s.tableTop})`)

  const off = run(spec, {}, 'band layout')
  assert.equal(off.status, 0, `plain run should pass:\n${off.stdout}\n${off.stderr}`)
  assert.equal(String(off.side.bodyTransform), 'none', 'no recording → the page is never shifted')
})
