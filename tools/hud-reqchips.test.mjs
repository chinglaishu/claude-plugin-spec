// The topbar must say WHICH requirement the recording is proving, the whole time. A watcher of a
// five-requirement flow sees values ringed and narrated, but nothing on screen ties the current beat
// to R1…R5 or shows how far the proof has come. So the HUD carries a REQUIREMENT CHIP STRIP: one
// chip per id the flow declared (coverReqs), each wearing a mark for its state — pending (no mark),
// ▸ while its checkReq runs, ✓ once it passed, ✕ on bengara once it failed. Hue never carries the
// state alone (the design rule): every state change also changes the mark. And when BOARD_BEAT_LOG
// names a file, every flowStep / checkReq / narration appends a wall-clock JSONL line — the timeline
// a voice-over or subtitle track is cut against. This test drives the REAL helpers and fails if the
// chips stop appearing, stop advancing pending → active → passed, stop going bengara on a failure,
// or the beat log stops recording the timeline.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = join(ROOT, 'spec', '_base.ts')

// The same tiny table the focus test proves against; #t is the cell the flow reads.
const TABLE = 'data:text/html,' + encodeURIComponent(
  '<table><tr><td>Housekeeping</td><td id="a">1.80%</td></tr>' +
  '<tr><td>Repair</td><td id="t">4.00%</td></tr>' +
  '<tr><td>Advertising</td><td id="b">2.20%</td></tr></table>')

function run (spec, env, grep) {
  const dir = mkdtempSync(join(ROOT, '.chips-'))
  try {
    writeFileSync(join(dir, 'chips.spec.ts'), spec(dir))
    writeFileSync(join(dir, 'chips.config.ts'),
      `import { defineConfig } from '@playwright/test'\n` +
      `export default defineConfig({ testDir: ${JSON.stringify(dir)}, testMatch: 'chips.spec.ts', workers: 1,\n` +
      `  outputDir: ${JSON.stringify(join(dir, 'out'))}, use: {} })\n`)
    const r = spawnSync('npx', ['playwright', 'test', '-c', join(dir, 'chips.config.ts'), '-g', grep], {
      cwd: ROOT, encoding: 'utf8', timeout: 120000, env: { ...process.env, FORCE_COLOR: '0', ...env }
    })
    r.readSide = (name) => existsSync(join(dir, name)) ? JSON.parse(readFileSync(join(dir, name), 'utf8')) : null
    r.beats = () => existsSync(join(dir, 'beats.jsonl'))
      ? readFileSync(join(dir, 'beats.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
      : []
    return r
  } finally {
    // the sidecar reads above happen before this returns via the closures binding `dir`… which rmSync
    // would break — so snapshot them eagerly instead.
    const side = existsSync(join(dir, 'side.json')) ? JSON.parse(readFileSync(join(dir, 'side.json'), 'utf8')) : null
    const beats = existsSync(join(dir, 'beats.jsonl'))
      ? readFileSync(join(dir, 'beats.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
      : []
    rmSync(dir, { recursive: true, force: true })
    LAST.side = side
    LAST.beats = beats
  }
}
const LAST = { side: null, beats: [] }

test('the chip strip advances pending → active → passed, and the beat log records the timeline', () => {
  const r = run((dir) =>
    `import { test, expect, checkReq, coverReqs, flowStep } from ${JSON.stringify(BASE)}\n` +
    `import { writeFileSync } from 'node:fs'\n` +
    `const TABLE = ${JSON.stringify(TABLE)}\n` +
    `test('chips advance', async ({ page }) => {\n` +
    `  coverReqs('R1', 'R2')\n` +
    `  await page.goto(TABLE)\n` +
    `  const states: any = {}\n` +
    `  await flowStep('Read the table', async () => {\n` +
    `    await checkReq('R1', async () => {\n` +
    `      states.duringR1 = await page.locator('[data-req="R1"]').textContent()\n` +
    `      states.provingDuring = await page.locator('#__specboard-hud-proving').textContent()\n` +
    `      await expect(page.locator('#t')).toHaveText('4.00%')\n` +
    `    })\n` +
    `  })\n` +
    `  states.chipCount = await page.locator('#__specboard-hud-reqs [data-req]').count()\n` +
    `  states.afterR1 = await page.locator('[data-req="R1"]').textContent()\n` +
    `  states.pendingR2 = await page.locator('[data-req="R2"]').textContent()\n` +
    `  states.head = await page.locator('#__specboard-hud-head').textContent()\n` +
    `  states.provingAfter = await page.locator('#__specboard-hud-proving').textContent()\n` +
    `  writeFileSync(${JSON.stringify(join(dir, 'side.json'))}, JSON.stringify(states))\n` +
    `})\n`,
  {}, 'chips advance')
  assert.equal(r.status, 0, `the chip flow should pass:\n${r.stdout}\n${r.stderr}`)
  const s = LAST.side
  assert.ok(s, 'the spec wrote its observations')
  assert.equal(s.chipCount, 2, 'one chip per declared requirement')
  assert.match(String(s.duringR1), /▸/, 'the chip is marked active while its checkReq runs')
  assert.match(String(s.afterR1), /✓/, 'the chip is marked passed once its checkReq passed')
  assert.ok(!/[✓✕▸]/.test(String(s.pendingR2)), 'an untouched chip stays pending, with no mark')
  // Requirements are the ONLY numbering system a watcher sees: the head is the step's plain
  // action description with NO number (a "1." beside an "R5" is how the first cut got misread),
  // while the proving line and the chips carry the R#s — one system, labeled.
  assert.match(String(s.head), /✓ Read the table/, 'the head is the action, unnumbered')
  assert.ok(!/\b[Ss]tep\s*\d|^\d+[.·]/.test(String(s.head)), 'no step number for a watcher to confuse with an R#')
  assert.match(String(s.provingDuring), /▸ proving R1/, 'the proving line names the requirement while it runs')
  assert.match(String(s.provingAfter), /✓ R1 proven/, 'the proving line reports the verdict after the check')
})

test('the claim line shows expected vs got as two values, and got reddens on a mismatch', () => {
  const r = run((dir) =>
    `import { test, expect, hudCheck } from ${JSON.stringify(BASE)}\n` +
    `import { writeFileSync } from 'node:fs'\n` +
    `const TABLE = ${JSON.stringify(TABLE)}\n` +
    `test('claim', async ({ page }) => {\n` +
    `  await page.goto(TABLE)\n` +
    `  await hudCheck('R&M growth', '4.00%', '4.00%')\n` +
    `  const okColor = await page.locator('#__specboard-hud-got').evaluate((el: any) => getComputedStyle(el).color)\n` +
    `  const okGot = await page.locator('#__specboard-hud-got').textContent()\n` +
    `  const exp = await page.locator('#__specboard-hud-exp').textContent()\n` +
    `  let threw = false\n` +
    `  try { await hudCheck('R&M growth', '4.00%', '9.99%') } catch { threw = true }\n` +  // hudCheck now ASSERTS (76714c5): it paints the red claim, THEN throws — catch it and read the frame it left
    `  const badColor = await page.locator('#__specboard-hud-got').evaluate((el: any) => getComputedStyle(el).color)\n` +
    `  const badGot = await page.locator('#__specboard-hud-got').textContent()\n` +
    `  writeFileSync(${JSON.stringify(join(dir, 'side.json'))}, JSON.stringify({ okColor, okGot, exp, badColor, badGot, threw }))\n` +
    `})\n`,
  {}, 'claim')
  assert.equal(r.status, 0, `the claim spec should pass:\n${r.stdout}\n${r.stderr}`)
  const s = LAST.side
  assert.ok(s, 'observations written')
  assert.equal(s.exp, '4.00%', 'the claim shows the expected value on its own')
  assert.equal(s.okGot, '4.00%', 'the claim shows the got value on its own')
  assert.equal(s.badGot, '9.99%', 'the got value updates to the mismatching read')
  assert.match(String(s.badColor), /232, 161, 138/, 'got reddens (bengara) the moment it disagrees')
  assert.ok(!/232, 161, 138/.test(String(s.okColor)), 'got is not red on a match')
  assert.equal(s.threw, true, 'a mismatching hudCheck still throws — it paints the red claim, THEN asserts (76714c5)')
})

test('a failed checkReq turns its chip bengara with a ✕ mark', () => {
  const r = run((dir) =>
    `import { test, expect, checkReq, coverReqs, flowStep } from ${JSON.stringify(BASE)}\n` +
    `import { writeFileSync } from 'node:fs'\n` +
    `const TABLE = ${JSON.stringify(TABLE)}\n` +
    `test('chip fails red', async ({ page }) => {\n` +
    `  coverReqs('R1')\n` +
    `  await page.goto(TABLE)\n` +
    `  await flowStep('A wrong value', async () => {\n` +
    `    await checkReq('R1', async () => { expect('4.00%', 'forced failure').toBe('9.99%') })\n` +
    `  })\n` +
    `  const chip = page.locator('[data-req="R1"]')\n` +
    `  writeFileSync(${JSON.stringify(join(dir, 'side.json'))}, JSON.stringify({\n` +
    `    mark: await chip.textContent(),\n` +
    `    bg: await chip.evaluate((el: any) => getComputedStyle(el).backgroundColor),\n` +
    `    proving: await page.locator('#__specboard-hud-proving').textContent(),\n` +
    `    head: await page.locator('#__specboard-hud-head').textContent()\n` +
    `  }))\n` +
    `})\n`,
  {}, 'chip fails red')
  // the aggregate auto fixture (_failAggregate, Task 16) fails the test — expected; the chip
  // observations rode out in the sidecar.
  assert.notEqual(r.status, 0, 'a flow with a failed check must fail')
  const s = LAST.side
  assert.ok(s, 'the spec wrote its observations before the aggregate failure')
  assert.match(String(s.mark), /✕/, 'the failed chip wears the ✕ mark')
  assert.match(String(s.bg), /122, 47, 29/, 'the failed chip is bengara')
  // The moment that confused a watcher: the step head goes "✗ Step 1 failed" while the VOICE is
  // still explaining R1 — the proving line must hold the requirement's verdict on the bar through
  // the red frame, so both numbering systems are on screen and labeled.
  assert.match(String(s.proving), /✕ R1 failed/, 'the proving line keeps naming the failed requirement')
  assert.match(String(s.head), /✗ Failed — A wrong value/, 'the failed head is the action, unnumbered')
})

test('BOARD_BEAT_LOG records a wall-clock JSONL timeline of steps, checks and notes', () => {
  const beatFile = join(ROOT, '.chips-beats.jsonl')
  rmSync(beatFile, { force: true })
  const r = run(() =>
    `import { test, expect, checkReq, coverReqs, flowStep, hudNote } from ${JSON.stringify(BASE)}\n` +
    `const TABLE = ${JSON.stringify(TABLE)}\n` +
    `test('beats recorded', async ({ page }) => {\n` +
    `  coverReqs('R1')\n` +
    `  await page.goto(TABLE)\n` +
    `  await flowStep('Read the table', async () => {\n` +
    `    await hudNote('about to read the cell')\n` +
    `    await checkReq('R1', async () => { await expect(page.locator('#t')).toHaveText('4.00%') })\n` +
    `  })\n` +
    `})\n`,
  { BOARD_BEAT_LOG: beatFile }, 'beats recorded')
  const beats = existsSync(beatFile)
    ? readFileSync(beatFile, 'utf8').trim().split('\n').map(l => JSON.parse(l))
    : []
  rmSync(beatFile, { force: true })
  assert.equal(r.status, 0, `the beat flow should pass:\n${r.stdout}\n${r.stderr}`)
  assert.ok(beats.length >= 3, `a step, a note and a check should each land a beat (got ${beats.length})`)
  for (const b of beats) {
    assert.ok(Number.isFinite(b.t) && b.t > 0, 'every beat carries a wall-clock time')
    assert.ok(typeof b.kind === 'string' && typeof b.label === 'string', 'every beat carries kind + label')
  }
  assert.ok(beats.some(b => b.kind === 'step' && /Read the table/.test(b.label)), 'the flowStep landed a beat')
  assert.ok(beats.some(b => b.kind === 'req' && /R1/.test(b.label)), 'the checkReq landed a beat')
  assert.ok(beats.some(b => b.kind === 'note' && /about to read/.test(b.label)), 'the narration landed a beat')
})
