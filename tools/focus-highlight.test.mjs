// The recording must POINT at the value it is proving. On a dense table the narration topbar names a
// number ("Repair & Maintenance growth — got 4.00%") but a viewer cannot tell WHICH cell it means. So
// reveal()/proveVisible() paint a focus overlay into the page — a full-width dim band that lights only
// the asserted row, and a ring on the exact cell (indigo normally, bengara on a failed check — since
// 33049fb the ring wears the schematic callout's own indigo so drawn and real share ONE geometry, R19) — burned
// into the video and shown in the live watch. This test drives the REAL helpers and fails if the
// overlay stops appearing, stops tracking the cell, stops going red on failure, or starts appearing
// when nobody is recording. Headless; the ring geometry is identical headed or not.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = join(ROOT, 'spec', '_base.ts')

// A tiny 3-row table; the middle cell (#t) is the one a step proves. Data URL so no server is needed.
const TABLE = 'data:text/html,' + encodeURIComponent(
  '<table><tr><td>Housekeeping</td><td id="a">1.80%</td></tr>' +
  '<tr><td>Repair</td><td id="t">4.00%</td></tr>' +
  '<tr><td>Advertising</td><td id="b">2.20%</td></tr></table>')

function run (env, grep) {
  const dir = mkdtempSync(join(ROOT, '.focus-'))
  try {
    writeFileSync(join(dir, 'focus.spec.ts'),
      `import { test, expect, proveVisible } from ${JSON.stringify(BASE)}\n` +
      `const TABLE = ${JSON.stringify(TABLE)}\n` +
      `test('ring tracks the asserted cell in indigo', async ({ page }) => {\n` +
      `  await page.goto(TABLE)\n` +
      `  const cell = page.locator('#t')\n` +
      `  await proveVisible(cell, '4.00%', 'R&M growth')\n` +
      `  const ring = page.locator('#__specboard-focus .sb-ring')\n` +
      `  await expect(ring).toBeVisible()\n` +
      `  const rb = await ring.boundingBox(); const cb = await cell.boundingBox()\n` +
      `  expect(Math.abs(rb.x - cb.x) < 8 && Math.abs(rb.y - cb.y) < 8, 'ring should sit on the cell').toBe(true)\n` +
      `  await expect(ring).toHaveCSS('border-top-color', 'rgb(47, 74, 99)')\n` +   // indigo (#2f4a63), not red, on a pass
      `})\n` +
      `test('ring goes bengara when the check fails', async ({ page }) => {\n` +
      `  await page.goto(TABLE)\n` +
      `  let threw = false\n` +
      `  try { await proveVisible(page.locator('#t'), '9.99%', 'R&M growth') } catch { threw = true }\n` +
      `  expect(threw, 'a wrong value must fail the check').toBe(true)\n` +
      `  await expect(page.locator('#__specboard-focus .sb-ring')).toHaveCSS('border-top-color', 'rgb(141, 74, 56)')\n` +  // bengara (#8d4a38, the token)
      `})\n` +
      `test('no overlay when nobody is recording', async ({ page }) => {\n` +
      `  await page.goto(TABLE)\n` +
      `  await proveVisible(page.locator('#t'), '4.00%', 'R&M growth')\n` +
      `  expect(await page.locator('#__specboard-focus').count()).toBe(0)\n` +
      `})\n`)
    writeFileSync(join(dir, 'focus.config.ts'),
      `import { defineConfig } from '@playwright/test'\n` +
      `export default defineConfig({ testDir: ${JSON.stringify(dir)}, testMatch: 'focus.spec.ts', workers: 1,\n` +
      `  outputDir: ${JSON.stringify(join(dir, 'out'))}, use: {} })\n`)
    const r = spawnSync('npx', ['playwright', 'test', '-c', join(dir, 'focus.config.ts'), '-g', grep], {
      cwd: ROOT, encoding: 'utf8', timeout: 120000, env: { ...process.env, FORCE_COLOR: '0', ...env }
    })
    return r
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('reveal paints a focus ring that tracks the cell, reddens on failure, and stays off without a recording', () => {
  // A recording is on (BOARD_RECORD); BOARD_STEP_DELAY_MS=1 keeps the readable hold from slowing the test.
  const rec = run({ BOARD_RECORD: join(ROOT, '.focus-rec-out'), BOARD_STEP_DELAY_MS: '1' }, 'ring')
  rmSync(join(ROOT, '.focus-rec-out'), { recursive: true, force: true })
  assert.equal(rec.status, 0, `recorded run should paint + redden the ring:\n${rec.stdout}\n${rec.stderr}`)

  // No recording → nothing to watch → no overlay.
  const off = run({}, 'no overlay')
  assert.equal(off.status, 0, `non-recorded run should paint no overlay:\n${off.stdout}\n${off.stderr}`)
})
