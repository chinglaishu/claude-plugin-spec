import { test, expect } from '../_base'
import { readdirSync, rmSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeDocumentScreen, makeGreenfieldScreen, makeUnbuiltScreen, addWireframe } from '../_fixture'
import { readScreen, isWaiting } from '../../tools/spec-store.mjs'
import { build } from '../../tools/build-board.mjs'

// Every fixture here is a `probe-` screen. Unlike the gate specs — whose fixtures happen to run
// after the board specs — this file sorts BEFORE `board/` (an underscore beats a letter), so a
// leftover fixture is a phantom row while the board specs assert exact screen counts. The global
// state guard only sweeps at teardown, so clean up after EACH test and rebuild to the real board.
const SPEC = join(dirname(fileURLToPath(import.meta.url)), '..')
test.afterEach(() => {
  let removed = false
  for (const n of readdirSync(SPEC))
    if (n.startsWith('probe-') && statSync(join(SPEC, n)).isDirectory()) {
      rmSync(join(SPEC, n), { recursive: true, force: true }); removed = true
    }
  if (removed) build()
})

// The two-mode state machine. A screen is DOCUMENT mode when it has no wireframe but is populated
// (a screen/test exist) — an existing app kg-init crawled — and DESIGN mode when it has a wireframe.
// A no-draft screen that is NOT populated is greenfield and must read exactly as it does today.
//
// These live in a `_`-prefixed directory so they are run by Playwright but are not themselves a
// board screen. The fixtures they create ARE board screens for the length of the run; the state
// guard removes any directory that appeared during the run, so nothing is left behind.

test('document mode — no wireframe no longer forces waiting; PRD + current screen + test', () => {
  const name = makeDocumentScreen('probe-doc-states')
  const s = readScreen(name)!

  expect(s.cells.prd).toBe('ok')
  // column 2 is a non-blocking "existing screen, no wireframe" state — never missing/waiting
  expect(s.cells.draft).toBe('nodraft')
  // column 3 is the current screen, proven by the test — NOT waiting on a wireframe (the bug)
  expect(s.cells.screen).toBe('current')
  // column 4 behaves normally: a test exists but has not run here
  expect(s.cells.e2e).toBe('unrun')
})

test('document mode — a passing run makes column 4 pass, like design mode', () => {
  const name = makeDocumentScreen('probe-doc-pass')
  // feed a fresh passing result directly, so no _results-index.json is touched on disk
  const results = { [name]: { total: 1, failed: 0, tests: [{ title: 't', ok: true, ms: 1 }], ranAt: Date.now() + 1000 } }
  const s = readScreen(name, results as any)!
  expect(s.cells.e2e).toBe('pass')
  expect(s.cells.screen).toBe('current')
})

test('document mode — a guess is waiting on you; accepting it (no guess) is not', () => {
  const guessed = makeDocumentScreen('probe-doc-guess', { guess: true })
  const g = readScreen(guessed)!
  expect(g.guess).toBe(true)
  expect(isWaiting(g)).toBe(true) // a crawled guess is waiting on you to accept it

  const canon = makeDocumentScreen('probe-doc-canon', { guess: false })
  const c = readScreen(canon)!
  expect(c.guess).toBe(false)
  expect(c.cells.draft).toBe('nodraft')
  expect(c.cells.screen).toBe('current')
  expect(isWaiting(c)).toBe(false) // accepted, no gates open — off your queue

})

test('greenfield — a no-draft, unpopulated screen reads exactly as before', () => {
  const name = makeGreenfieldScreen('probe-greenfield')
  const s = readScreen(name)!
  expect(s.cells.prd).toBe('ok')
  expect(s.cells.draft).toBe('missing')
  expect(s.cells.screen).toBe('waiting')
  expect(s.cells.e2e).toBe('waiting')
})

// The gate model — document mode has no hash-pinning gate; its one action is accepting the guess.
test('accept — the PRD gate strips guess: true and pins nothing', async ({ request }) => {
  const name = makeDocumentScreen('probe-accept', { guess: true })
  expect(readScreen(name)!.guess).toBe(true)

  const res = await request.post('/api/gate', { data: { screen: name, gate: 'prd', act: 'accept' } })
  expect(res.ok()).toBe(true)

  const after = readScreen(name)!
  expect(after.guess).toBe(false)           // no longer a guess — it is canon now
  // no pin was written: document mode has no staleness gate on the PRD
  expect(after.state.prdApprovedAgainstPrd).toBeUndefined()
  expect(after.state.draftApprovedAgainstPrd).toBeUndefined()
  expect(isWaiting(after)).toBe(false)
})

test('accept — refused when the PRD is not a guess', async ({ request }) => {
  const name = makeDocumentScreen('probe-accept-noop', { guess: false })
  const res = await request.post('/api/gate', { data: { screen: name, gate: 'prd', act: 'accept' } })
  expect(res.status()).toBe(400)
})

test('gate B — refused when there is no wireframe to compare against', async ({ request }) => {
  const name = makeDocumentScreen('probe-no-gateb', { guess: false })
  const res = await request.post('/api/gate', { data: { screen: name, gate: 'screen', act: 'approve' } })
  expect(res.status()).toBe(400)
  // and no bogus pin leaked into state
  expect(readScreen(name)!.state.screenApprovedAgainstDraft).toBeUndefined()
})

test('design mode — a drafted screen is unchanged (review until gate A)', async ({ request }) => {
  // makeUnbuiltScreen approves gate A, so start from a raw drafted screen instead by un-approving
  const name = await makeUnbuiltScreen(request, 'probe-design-states')
  await request.post('/api/gate', { data: { screen: name, gate: 'draft', act: 'unapprove' } })
  const s = readScreen(name)!
  expect(s.cells.draft).toBe('review')
  // has a draft but no shot and no test — the classic design-mode start
  expect(s.cells.screen).toBe('missing')
  expect(s.cells.e2e).toBe('missing')
})

// ── the board renders both modes ──────────────────────────────────────────
test('renders — a document row shows no-wireframe + current screen, and the verdict bar accepts the PRD', async ({ page }) => {
  const name = makeDocumentScreen('probe-doc-render', { guess: true })
  await page.goto('/')
  const rowLoc = page.locator('.row', { hasText: name })
  await expect(rowLoc).toBeVisible()
  // column 2 is the non-blocking "existing screen, no wireframe, add one to redesign" state
  const draftCell = rowLoc.locator('[data-col="draft"]')
  await expect(draftCell).toContainText(/no wireframe/i)
  await expect(draftCell).toContainText(/redesign/i)
  // column 3 is the current screenshot
  await expect(rowLoc.locator('[data-col="screen"] img')).toHaveAttribute('src', /screen\.png/)

  // the verdict bar approves the PRD, and there is no gate B anywhere
  await page.goto('/#/' + name)
  const dt = page.locator('.dt:not([hidden])')
  const bar = dt.locator('.gb')
  await expect(bar.locator('[data-act="accept"][data-gate="prd"]')).toHaveCount(1)
  await expect(dt.locator('[data-gate="screen"]')).toHaveCount(0)
})

test('renders — accepting from the board strips the guess', async ({ page }) => {
  const name = makeDocumentScreen('probe-doc-accept-ui', { guess: true })
  await page.goto('/#/' + name)
  const bar = page.locator('.dt:not([hidden]) .gb')
  await bar.locator('[data-act="accept"][data-gate="prd"]').click()
  await page.waitForLoadState('load')
  expect(readScreen(name)!.guess).toBe(false)
})

test('flip — adding a wireframe turns a document screen into a design-mode one (gate A + gate B)', async ({ page }) => {
  const name = makeDocumentScreen('probe-flip', { guess: false })
  expect(readScreen(name)!.cells.draft).toBe('nodraft')

  addWireframe(name)
  const s = readScreen(name)!
  expect(s.cells.draft).toBe('review')   // gate A now open (draft vs PRD)
  expect(s.cells.screen).toBe('review')  // gate B now open (built shot vs the new draft)

  await page.goto('/#/' + name)
  const dt = page.locator('.dt:not([hidden])')
  // gate A verdict bar is back, and it is the DRAFT gate, not the PRD accept
  await expect(dt.locator('.gb [data-act="approve"][data-screen="' + name + '"]')).toHaveCount(1)
  await expect(dt.locator('.gb [data-act="accept"]')).toHaveCount(0)
})

test('toggle — the wireframe column hides and shows board-wide, and the choice persists', async ({ page }) => {
  await page.goto('/')
  const btn = page.locator('#wftoggle')
  await expect(btn).toBeVisible()
  const draftColh = page.locator('.colhs [data-col="draft"]')
  await expect(draftColh).toBeVisible()

  await btn.click()
  await expect(draftColh).toBeHidden()

  // persists across a reload (localStorage), and the label reflects the state
  await page.reload()
  await expect(page.locator('.colhs [data-col="draft"]')).toBeHidden()
  await expect(page.locator('#wftoggle')).toContainText(/show/i)

  // put it back so nothing about this test leaks into a later one in the same context
  await page.locator('#wftoggle').click()
})
