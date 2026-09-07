// THE NARRATION OVERLAY — what a watcher of the recording actually sees. Rewritten 2026-08-27, when
// the burned-in top banner was retired for a product-tour CALLOUT anchored to the ringed element;
// rewritten again 2026-09-07, when the human retired the CALLOUT CARD too (option A: "drop the card
// from the recording, keep the ring"). What is left is exactly what every still already kept: a
// light dim over the app and a ring on the proven element — and NOTHING beside it. The reader's own
// chip (board R20) is the one explanation on every picture, film or still; the card burned into the
// pixels under it said the beat's sentence about a different instant, and pixels cannot be unburned.
//
// This test drives the REAL helpers and fails if the ring stops appearing, the dim stops painting,
// a card or a pointer comes BACK (rule 4: these three used to assert the card's words, placement and
// reddening; the human decided the card away, so what is pinned now is its absence), or a failed
// check stops reddening the ring. And when BOARD_BEAT_LOG names a file, every flowStep / checkReq /
// narration appends a wall-clock JSONL line — the timeline a voice-over or subtitle track is cut
// against.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = join(ROOT, 'spec', '_base.ts')

// A WIDE ROW with a small cell at its end — the exact shape that broke the callout: R3's little
// progress ring sat inside a wide row, the card went to its right, and it covered the row's own
// title and its neighbours. #t is the ringed cell; #name is the context that must stay readable.
const TABLE = 'data:text/html,' + encodeURIComponent(
  '<body style="margin:0;font:14px system-ui">' +
  '<table style="width:1200px;border-collapse:collapse">' +
  '<tr><td id="name" style="width:900px">Repair and maintenance — the whole row title</td>' +
  '<td id="t">4.00%</td></tr>' +
  '<tr><td>Housekeeping</td><td id="a">1.80%</td></tr>' +
  '</table></body>')

// The requirement the callout must narrate, in the prd's own words. It lives in the temp SCREEN
// directory the spec file sits in, because that is where _base.ts reads a requirement's title and
// its Given/When/Then from (spec/<screen>/prd.md) — the same file the board's storyboard renders.
const PRD = [
  '---',
  'screen: chips',
  'area: Fixtures',
  'title: Chips fixture',
  'route: /chips',
  '---',
  '',
  '## R1 — The R&M growth rate',
  '',
  '- **Given** a table of operating expense growth rates',
  '- **When** you read the Repair row',
  '- **Then** it shows 4.00%',
  '',
  '## R2 — Never reached',
  '',
  '- **Given** a declared requirement no check touches',
  '- **When** the flow ends',
  '- **Then** it stays honestly unproven',
  ''
].join('\n')

// The temp screen lives UNDER spec/ (so _base.ts finds its prd) and is `_`-prefixed, which is
// exactly what the board and the state guard skip — it can never read as a real row, and it is
// removed the moment the run ends.
function run (spec, env, grep) {
  const dir = mkdtempSync(join(ROOT, 'spec', '_chips-'))
  try {
    writeFileSync(join(dir, 'prd.md'), PRD)
    writeFileSync(join(dir, 'chips.spec.ts'), spec(dir))
    writeFileSync(join(dir, 'chips.config.ts'),
      'import { defineConfig } from \'@playwright/test\'\n' +
      `export default defineConfig({ testDir: ${JSON.stringify(dir)}, testMatch: 'chips.spec.ts', workers: 1,\n` +
      `  outputDir: ${JSON.stringify(join(dir, 'out'))}, use: {} })\n`)
    const r = spawnSync('npx', ['playwright', 'test', '-c', join(dir, 'chips.config.ts'), '-g', grep], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 120000,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        // the overlay paints only under a board RECORDING (a plain suite run stays fast), and the
        // pace is pinned to 1ms so these checks are not paying a watcher's reading holds
        BOARD_RECORD: join(dir, 'rec'),
        BOARD_STEP_DELAY_MS: '1',
        ...env
      }
    })
    return r
  } finally {
    // the sidecar reads happen after this returns, so snapshot them eagerly — rmSync would
    // otherwise take the file out from under the closure
    const side = existsSync(join(dir, 'side.json')) ? JSON.parse(readFileSync(join(dir, 'side.json'), 'utf8')) : null
    rmSync(dir, { recursive: true, force: true })
    LAST.side = side
  }
}
const LAST = { side: null }

// The reader every spec below uses: the overlay's own words and geometry, straight off the page.
const READ = (dir) =>
  'const readOverlay = async () => await page.evaluate(() => {\n' +
  '  const el = document.getElementById(\'__specboard-focus\')\n' +
  '  if (!el) return { present: false }\n' +
  '  const q = (s: string) => el.querySelector(s) as HTMLElement\n' +
  '  const box = (n: HTMLElement | null) => { if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }\n' +
  '  const shown = (n: HTMLElement | null) => !!n && getComputedStyle(n).display !== \'none\'\n' +
  '  const call = q(\'.sb-call\'); const ring = q(\'.sb-ring\'); const ptr = q(\'.sb-ptr\'); const veil = q(\'.sb-veil\')\n' +
  '  const target = document.getElementById(\'t\')\n' +
  '  const name = document.getElementById(\'name\')\n' +
  '  return { present: true, veil: shown(veil), ringShown: shown(ring), ptrShown: shown(ptr),\n' +
  '    text: call ? (call.textContent || \'\') : \'\', callShown: shown(call),\n' +
  '    call: box(call), ring: box(ring), ptr: box(ptr),\n' +
  '    target: target ? box(target as HTMLElement) : null, name: name ? box(name as HTMLElement) : null }\n' +
  '})\n' +
  `const save = (o: any) => writeFileSync(${JSON.stringify(join(dir, 'side.json'))}, JSON.stringify(o))\n`

const overlaps = (a, b) =>
  !(a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h)

test('the overlay is the ring and the dim — and no card, mid-check or at rest', () => {
  const r = run((dir) =>
    `import { test, expect, checkReq, coverReqs, flowStep, proveVisible } from ${JSON.stringify(BASE)}\n` +
    'import { writeFileSync } from \'node:fs\'\n' +
    `const TABLE = ${JSON.stringify(TABLE)}\n` +
    'test(\'callout narrates\', async ({ page }) => {\n' +
    READ(dir) +
    '  coverReqs(\'R1\', \'R2\')\n' +
    '  await page.goto(TABLE)\n' +
    '  let during: any = null\n' +
    '  await flowStep(\'Read the table\', async () => {\n' +
    '    await checkReq(\'R1\', async () => {\n' +
    '      await proveVisible(page.locator(\'#t\'), \'4.00%\', \'the R&M growth rate\')\n' +
    '      during = await readOverlay()\n' +
    '    })\n' +
    '  })\n' +
    '  const after = await readOverlay()\n' +
    '  save({ during, after })\n' +
    '})\n',
  {}, 'callout narrates')
  assert.equal(r.status, 0, `the narrated flow should pass:\n${r.stdout}\n${r.stderr}`)
  const s = LAST.side
  assert.ok(s, 'the spec wrote its observations')
  assert.equal(s.during.present, true, 'the overlay is injected into the page under test')
  assert.equal(s.during.ringShown, true, 'the proven element is ringed while the check runs')
  assert.equal(s.during.veil, true, 'over a light dim of the app — receded, never hidden')
  // NO CARD, NO POINTER (the human, 2026-09-07). The elements are not created at all — an element
  // hidden by style would still be one line away from coming back.
  assert.equal(s.during.call, null, 'no card is painted beside the ring while the check runs')
  assert.equal(s.during.ptr, null, 'and no pointer notch')
  assert.equal(s.during.text, '', 'the overlay says nothing — the reader’s chip does')
  assert.equal(s.after.call, null, 'and none once the beat comes to rest either')
  assert.equal(s.after.ptr, null)
})

test('the ring sits ON the element it marks, and nothing in the overlay covers the row beside it', () => {
  const r = run((dir) =>
    `import { test, expect, checkReq, flowStep, proveVisible } from ${JSON.stringify(BASE)}\n` +
    'import { writeFileSync } from \'node:fs\'\n' +
    `const TABLE = ${JSON.stringify(TABLE)}\n` +
    'test(\'callout placed\', async ({ page }) => {\n' +
    READ(dir) +
    '  await page.goto(TABLE)\n' +
    '  let during: any = null\n' +
    '  await flowStep(\'Read the small cell in a wide row\', async () => {\n' +
    '    await checkReq(\'R1\', async () => {\n' +
    '      await proveVisible(page.locator(\'#t\'), \'4.00%\', \'the R&M growth rate\')\n' +
    '      during = await readOverlay()\n' +
    '    })\n' +
    '  })\n' +
    '  save(during)\n' +
    '})\n',
  {}, 'callout placed')
  assert.equal(r.status, 0, `the placement flow should pass:\n${r.stdout}\n${r.stderr}`)
  const s = LAST.side
  assert.ok(s && s.ring && s.target, 'the ring and its target were both measured')
  // the ring is drawn AROUND the target (its box contains the target's, within the shared inset)
  assert.ok(s.ring.x <= s.target.x + 1 && s.ring.y <= s.target.y + 1, 'the ring starts at or before the target')
  assert.ok(s.ring.x + s.ring.w >= s.target.x + s.target.w - 1 && s.ring.y + s.ring.h >= s.target.y + s.target.h - 1,
    'and ends at or after it')
  // THE 2026-08-27 DEFECT — a card over the row's own title — cannot recur: there is no card
  assert.equal(s.call, null, 'no card to cover the row beside the ring')
  assert.equal(s.ptr, null, 'no pointer either')
  // (the ring's own inset — shared geometry, tools/overlay-geometry.mjs RING — may touch the
  // neighbouring cell's edge by a few px; that is the ring's halo, not a card over the title)
})

test('a failed check reddens the RING — the got value is the step evidence’s, not a card’s', () => {
  const r = run((dir) =>
    `import { test, expect, checkReq, coverReqs, flowStep, proveVisible } from ${JSON.stringify(BASE)}\n` +
    'import { writeFileSync } from \'node:fs\'\n' +
    `const TABLE = ${JSON.stringify(TABLE)}\n` +
    'test(\'callout fails red\', async ({ page }) => {\n' +
    READ(dir) +
    '  coverReqs(\'R1\')\n' +
    '  await page.goto(TABLE)\n' +
    '  await flowStep(\'A wrong value\', async () => {\n' +
    '    await checkReq(\'R1\', async () => {\n' +
    '      await proveVisible(page.locator(\'#t\'), \'9.99%\', \'the R&M growth rate\')\n' +
    '    })\n' +
    '  })\n' +
    '  const failed = await readOverlay()\n' +
    '  const ringColor = await page.evaluate(() => {\n' +
    '    const el = document.getElementById(\'__specboard-focus\')\n' +
    '    const ring = el ? el.querySelector(\'.sb-ring\') as HTMLElement : null\n' +
    '    return ring ? getComputedStyle(ring).borderColor : \'\'\n' +
    '  })\n' +
    '  save({ ...failed, ringColor })\n' +
    '})\n',
  {}, 'callout fails red')
  // the aggregate auto fixture (_failAggregate) fails the test — expected; the observations rode
  // out in the sidecar, written before the teardown.
  assert.notEqual(r.status, 0, 'a flow with a failed check must fail')
  const s = LAST.side
  assert.ok(s, 'the spec wrote its observations before the aggregate failure')
  assert.equal(s.call, null, 'no card comes back to carry the failure')
  assert.equal(s.ringShown, true, 'the ring stays on the element that failed')
  assert.match(String(s.ringColor), /141, 74, 56/, 'and turns bengara')
})

test('BOARD_BEAT_LOG records a wall-clock JSONL timeline of steps, checks and notes', () => {
  const beatFile = join(ROOT, '.chips-beats.jsonl')
  rmSync(beatFile, { force: true })
  const r = run(() =>
    `import { test, expect, checkReq, coverReqs, flowStep, hudNote } from ${JSON.stringify(BASE)}\n` +
    `const TABLE = ${JSON.stringify(TABLE)}\n` +
    'test(\'beats recorded\', async ({ page }) => {\n' +
    '  coverReqs(\'R1\')\n' +
    '  await page.goto(TABLE)\n' +
    '  await flowStep(\'Read the table\', async () => {\n' +
    '    await hudNote(\'about to read the cell\')\n' +
    '    await checkReq(\'R1\', async () => { await expect(page.locator(\'#t\')).toHaveText(\'4.00%\') })\n' +
    '  })\n' +
    '})\n',
  { BOARD_BEAT_LOG: beatFile }, 'beats recorded')
  const beats = existsSync(beatFile)
    ? readFileSync(beatFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
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
