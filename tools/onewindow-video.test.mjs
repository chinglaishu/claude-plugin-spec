// A WATCHED run (the board's "Watch" — headed, BOARD_ONE_WINDOW=1) must still record a playable
// video. It nearly always didn't: the one-window fixture in spec/_base.ts builds its shared browser
// context by hand (browser.newContext()), and a hand-made context does NOT inherit the config's
// `use: { video }` — so page.video() was null and every watched run came back with no video at all
// ("recorded a video but it's not playable"). This test drives the REAL fixture in one-window mode
// and fails if that context stops recording, or the recording stops being attached, or is not a
// valid WebM. It runs headless (the --headed flag is irrelevant to whether recordVideo applies), so
// it needs no display. Slower than the pure tests here because it spawns a real browser run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = join(ROOT, 'spec', '_base.ts')          // the real fixture under test, imported absolutely

test('a one-window (watched) recording produces an attached, valid WebM', () => {
  // The temp spec/config live INSIDE the repo so Node's upward node_modules walk resolves
  // @playwright/test (a sibling tmpdir would not). It never matches the e2e testMatch (spec/*/…),
  // and the finally block removes it.
  const dir = mkdtempSync(join(ROOT, '.ow-video-'))
  try {
    const rec = join(dir, 'rec')
    const report = join(dir, 'report.json')
    // A trivial spec that imports the REAL test fixture and just paints a page — enough to record.
    writeFileSync(join(dir, 'ow.spec.ts'),
      `import { test } from ${JSON.stringify(BASE)}\n` +
      `test('watched records video', async ({ page }) => {\n` +
      `  await page.goto('data:text/html,<body style=background:%234a4>watched</body>')\n` +
      `  await page.waitForTimeout(250)\n` +
      `})\n`)
    writeFileSync(join(dir, 'ow.config.ts'),
      `import { defineConfig } from '@playwright/test'\n` +
      `export default defineConfig({ testDir: ${JSON.stringify(dir)}, testMatch: 'ow.spec.ts', workers: 1,\n` +
      `  outputDir: process.env.BOARD_RECORD, reporter: [['json', { outputFile: ${JSON.stringify(report)} }]],\n` +
      `  use: { video: { mode: 'on', size: { width: 1440, height: 900 } } } })\n`)

    const r = spawnSync('npx', ['playwright', 'test', '-c', join(dir, 'ow.config.ts')], {
      cwd: ROOT, encoding: 'utf8', timeout: 120000,
      // BOARD_ONE_WINDOW selects the hand-made shared-context fixture — the watched-run path.
      // BOARD_RECORD turns recording on, exactly as a board-started run does.
      env: { ...process.env, BOARD_ONE_WINDOW: '1', BOARD_RECORD: rec, FORCE_COLOR: '0' }
    })
    assert.equal(r.status, 0, `playwright run failed:\n${r.stdout}\n${r.stderr}`)
    assert.ok(existsSync(report), 'no report written')

    // The reporter (spec/_results-reporter.mjs) records the case's video from the .webm ATTACHMENT,
    // so the attachment is what the board ultimately plays. Assert one exists.
    const j = JSON.parse(readFileSync(report, 'utf8'))
    const atts = j.suites.flatMap(s => s.specs).flatMap(sp => sp.tests)
      .flatMap(t => t.results).flatMap(x => x.attachments || [])
    const webm = atts.filter(a => /\.webm$/i.test(a.path || ''))
    assert.ok(webm.length >= 1, `watched run attached no .webm (found ${atts.length} attachments)`)

    // And it must be a real WebM (EBML magic 1A 45 DF A3), not an empty/truncated file.
    const file = webm.find(a => existsSync(a.path))?.path ||
      // fall back to any webm in the record dir, in case the path is relative to cwd
      readdirSync(rec, { recursive: true }).map(p => join(rec, String(p))).find(p => /\.webm$/i.test(p) && existsSync(p))
    assert.ok(file && existsSync(file), 'attached .webm file is missing on disk')
    const head = readFileSync(file).subarray(0, 4)
    assert.deepEqual([...head], [0x1a, 0x45, 0xdf, 0xa3], 'attached file is not a valid WebM (bad EBML header)')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
