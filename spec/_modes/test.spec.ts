import { test, expect } from '../_base'
import { readdirSync, rmSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readScreen, isWaiting } from '../../tools/spec-store.mjs'
import { build } from '../../tools/build-board.mjs'

// The ENGINE of the two-column board (board R4/R8). A requirement's state is COMPUTED — proven or
// unproven — from the tests alone, never typed, and there is NO acceptance gate: editing the PRD IS
// the change, so a stale proof simply reads unproven. The one thing that still waits on a human is a
// crawl GUESS (init R3). These specs prove the derivation directly against the store, then that the
// board renders those states and NO gate. (This is a `_`-prefixed pseudo-screen: Playwright runs it,
// but it is not a row.)
//
// Fixtures are `probe-` screens. This file sorts BEFORE board/ (an underscore beats a letter), so a
// leftover would be a phantom row while the board specs assert exact counts — clean up after EACH test
// and rebuild to the real board (the state guard also sweeps any new dir at teardown).

const SPEC = join(dirname(fileURLToPath(import.meta.url)), '..')

test.afterEach(() => {
  let removed = false
  for (const n of readdirSync(SPEC))
    if (n.startsWith('probe-') && statSync(join(SPEC, n)).isDirectory()) {
      rmSync(join(SPEC, n), { recursive: true, force: true }); removed = true
    }
  if (removed) build()
})

// A screen with one requirement. There is nothing to "accept" (board R8) — a requirement is the
// source of truth the moment it is written, and its state is computed from its tests. `guess` marks
// it as a crawl guess (the one remaining human-correction case, init R3).
function makeScreen (name: string, body = 'One behaviour, asserted by a test.', { guess = false } = {}) {
  const dir = join(SPEC, name); mkdirSync(dir, { recursive: true })
  const prd = `---\nscreen: ${name}\narea: Core\ntitle: ${name}\nroute: /${name}\n` +
    (guess ? 'guess: true\n' : '') + `---\n\n## R1 — A first requirement\n\n${body}\n`
  writeFileSync(join(dir, 'prd.md'), prd)
  return { name, dir, prd }
}

// A fresh, far-future passing result for this screen's R1 — fed straight to readScreen, so no
// _results-index.json on disk is touched. Far-future so it is never counted stale against the source.
const passResult = (name: string) =>
  ({ [name]: { ranAt: Date.now() + 100000, tests: [{ title: 'x', ok: true, reqs: { [`${name}:R1`]: 'pass' } }] } })

// A passing result from the PAST — before the source on disk was written — so it reads STALE: a proof
// that predates the current version of the screen no longer proves anything.
const stalePass = (name: string) =>
  ({ [name]: { ranAt: 1, tests: [{ title: 'x', ok: true, reqs: { [`${name}:R1`]: 'pass' } }] } })

// ── the two requirement states (board R4) ─────────────────────────────────
test('unproven — a requirement with no passing test reads unproven, and is not waiting', () => {
  const { name } = makeScreen('probe-unproven')
  const s = readScreen(name)!
  expect(s.reqs[0].state).toBe('unproven')   // no passing assertion covers it — honestly ungreen
  expect(isWaiting(s)).toBe(false)           // no gate — a normal screen never waits on a person
})

test('proven — a current passing proof makes a requirement proven', () => {
  const { name } = makeScreen('probe-proven')
  const s = readScreen(name, passResult(name) as any)!
  expect(s.reqs[0].state).toBe('proven')
})

test('a proof that predates the source no longer proves — editing the PRD IS the change', () => {
  const { name } = makeScreen('probe-stale')
  // a pass recorded before this prd.md was written describes a version that has moved on
  const s = readScreen(name, stalePass(name) as any)!
  expect(s.reqs[0].state).toBe('unproven')   // stale by source — no gate needed to notice
  expect(isWaiting(s)).toBe(false)
})

// board R4's four-word `status` must apply the SAME staleness rule `state` does — a pass that
// predates the source is not current, and deriveReqStatus must never see it either. Fixed
// 2026-08-18 (fix round 1, finding 2): `status` was computed from the RAW aggregated entries,
// bypassing the staleness filter `hasCurrentPass` uses two lines above it — a stale-only pass
// read Passed even while `state` correctly read unproven, a real green the code exists to prevent
// (rule 3, never fake a green).
test('a stale-only pass does not read Passed either — status honours the same staleness filter as state', () => {
  const { name } = makeScreen('probe-stale-status')
  const s = readScreen(name, stalePass(name) as any)!
  expect(s.reqs[0].state).toBe('unproven')     // unchanged behaviour, re-asserted for context
  expect(s.reqs[0].status).not.toBe('passed')  // the stale pass must not count for status either
  expect(s.reqs[0].status).toBe('untested')    // nothing else covers it once the stale pass is dropped
})

test('state is only ever proven or unproven — there is no reworded / accept state', () => {
  // with a proof and without one, the computed state is one of exactly two — never a third
  // "changed since accepted" value, because there is no acceptance to change against (board R8)
  const proven = readScreen(makeScreen('probe-two-a').name, passResult('probe-two-a') as any)!
  const bare = readScreen(makeScreen('probe-two-b').name)!
  expect(proven.reqs[0].state).toBe('proven')
  expect(bare.reqs[0].state).toBe('unproven')
  for (const s of [proven, bare]) expect(s.reqs[0].state).not.toBe('reworded')
})

// ── the ONE remaining human-correction case: a crawl guess (init R3) ───────
test('a crawl guess is the only thing waiting; a normal screen never is', () => {
  const normal = makeScreen('probe-normal')
  expect(isWaiting(readScreen(normal.name)!)).toBe(false)   // accepted-or-not is irrelevant — no gate

  const g = makeScreen('probe-guess', 'A guess read off the page.', { guess: true })
  const gs = readScreen(g.name)!
  expect(gs.guess).toBe(true)
  expect(isWaiting(gs)).toBe(true)                          // a guess still waits on a human to confirm
})

// ── the board renders proven/unproven and NO gate (board R2/R8) ────────────
async function settleAt (page: any, url: string, ready: any) {
  // Re-assert the board each retry — the watcher can stale-overwrite board.html (a rebuild it began
  // before the fixture landed, finishing late) and never self-correct. A fresh in-process build is the
  // last writer once the file events settle, so goto lands on a board that has this fixture.
  await expect(async () => {
    build()
    await page.goto(url)
    await expect(ready).toBeVisible()
  }).toPass({ timeout: 15000 })
}

test('renders — the detail is the two columns, with NO gate and no accept button', async ({ page }) => {
  const { name } = makeScreen('probe-render')
  const dt = page.locator('.dt[data-screen="' + name + '"]:not([hidden])')
  await settleAt(page, '/#/' + name, dt.locator('.viewseg'))
  await dt.locator('.viewseg .vseg[data-view="columns"]').click()  // Focus is the default now; this test reads the columns
  await expect(dt.locator('.cols')).toBeVisible()
  await expect(dt.locator('.cols .pane')).toHaveCount(2)            // two columns (board R2)
  await expect(dt.locator('.gate')).toHaveCount(0)                 // no acceptance gate (board R8)
  await expect(dt.locator('[data-act="accept"]')).toHaveCount(0)   // nothing to accept
  await expect(dt.locator('[data-gate]')).toHaveCount(0)           // no gate B / draft gate either
  await expect(dt.locator('iframe')).toHaveCount(0)                // no wireframe
  // every requirement renders a COMPUTED state — never reworded, never blank
  await expect(dt.locator('.reqpane .req[data-state="reworded"]')).toHaveCount(0)
  const reqN = await dt.locator('.reqpane .req').count()
  await expect(dt.locator('.reqpane .req[data-state="proven"], .reqpane .req[data-state="unproven"]'))
    .toHaveCount(reqN)
})

test('renders — a crawl guess reads as waiting on the board (the one remaining human case)', async ({ page }) => {
  const { name } = makeScreen('probe-render-guess', 'A guess.', { guess: true })
  const card = page.locator('#home .card[data-screen="' + name + '"]')
  await settleAt(page, '/', card)
  expect(await card.getAttribute('data-waiting')).toBe('1')
  await expect(card.locator('.chip', { hasText: /guess/i })).toHaveCount(1)
})
