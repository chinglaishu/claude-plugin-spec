import { test, expect } from '../_base'
import { writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeDocumentScreen } from '../_fixture'
import { build } from '../../tools/build-board.mjs'

// Init is where a project with code but no specs gets a board. The actual crawl — a real browser
// visiting real routes, then Claude drafting a PRD from each page — needs a login and minutes, so
// it is not driven here (like the redraft and the scan, it is a real job outside the deterministic
// suite). What IS proven here is everything around it: the config the crawl reads, how a guessed
// row looks on the board, the greenfield zero case, and that rerunning leaves settled rows alone.
//
// The state guard now snapshots the set of screen directories too, so a fixture row this spec
// creates is removed after the run — a crawl that leaked rows would be the same lie as a scan that
// leaked a fake finding.

const SPEC = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = join(SPEC, '_config.json')
const CRAWL = join(SPEC, '_crawl.json')
const config = () => (existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, 'utf8')) : null)

test('R1 — the form persists what cannot be guessed, and reads it back', async ({ page, request }) => {
  // start from no config so the round-trip is real, not a coincidence of what was already there
  if (existsSync(CONFIG)) rmSync(CONFIG)
  await page.goto('/#init')
  const view = page.locator('#initview')
  await expect(view).toBeVisible()

  // the human explicitly asked to be able to point at an ALREADY-RUNNING server rather than always
  // starting one — so the mode is a real choice, and it has to survive
  await view.locator('#initmode [data-mode="attach"]').click()
  await view.locator('#initurl').fill('http://localhost:3000')
  await view.locator('#initroutes').fill('/\n/cart\n/checkout')
  await view.locator('#initsave').click()

  await expect.poll(() => config()?.baseUrl).toBe('http://localhost:3000')
  expect(config()!.mode).toBe('attach')
  expect(config()!.routes).toEqual(['/', '/cart', '/checkout'])

  // read-back: a fresh load of the page shows what was saved, not empty fields
  await page.goto('/')
  await page.goto('/#init')
  await expect(page.locator('#initurl')).toHaveValue('http://localhost:3000')
  await expect(page.locator('#initroutes')).toHaveValue(/\/cart/)
})

test('R1 — the setup cards are single-column blocks, not the home two-column grid', async ({ page }) => {
  // Regression: the home card is `display:grid; grid-template-columns:1fr 260px`, and the Setup
  // view reuses `.card`. When that grid rule was left unscoped it leaked here and split every field
  // into two clipped columns — the form was unreadable. Each Setup card must be a plain block.
  await page.goto('/#init')
  await expect(page.locator('#initview')).toBeVisible()
  for (const sel of ['#initview .initcol .card.pad', '#initview .initcol .card:not(.pad)']) {
    const cols = await page.locator(sel).evaluate(el => getComputedStyle(el).gridTemplateColumns)
    expect(cols, sel + ' must not be a multi-track grid').toBe('none')
  }
})

test('R1 — start mode saves backend and frontend, in order', async ({ page }) => {
  // Many apps need the API up before the frontend serves real pages, so a crawl that hits the
  // frontend first reads requirements off broken pages — a confident, wrong board. Init asks for
  // the two servers separately, and the crawler starts the backend and waits for it first.
  await page.goto('/#init')
  await page.locator('#initmode [data-mode="start"]').click()
  await page.locator('#initbackendcmd').fill('npm run api')
  await page.locator('#initbackendurl').fill('http://localhost:8000/health')
  await page.locator('#initfrontendcmd').fill('npm run dev')
  await page.locator('#initurl').fill('http://localhost:5173')
  await page.locator('#initsave').click()
  await expect.poll(() => config()?.mode).toBe('start')
  const c = config()!
  expect(c.backendCommand).toBe('npm run api')
  expect(c.backendUrl).toBe('http://localhost:8000/health')
  expect(c.frontendCommand).toBe('npm run dev')
  // the frontend URL is the one the crawl targets — backend readiness is a gate, not a crawl root
  expect(c.baseUrl).toBe('http://localhost:5173')
})

test('R3 — a crawled screen lands as a guess: one CARD, visibly a guess and waiting, with no gate', async ({ page }) => {
  // A real crawl drafts a guessed PRD, authors a test, and shoots the screen. makeDocumentScreen
  // builds that shape; it rebuilds the board, so the row is there without waiting on the watcher. In
  // the no-gate model a guess is the ONE thing still waiting on a human (init R3): you correct it and
  // drop the `guess:` flag to make it canon. There is no accept gate, no draft/gate-A review, and no
  // "did you build it" gate B.
  const name = makeDocumentScreen('storefront', { guess: true })
  try {
    const cardLoc = page.locator('#home .card[data-screen="' + name + '"]')
    await expect(async () => {
      build()   // re-assert the board each retry — the watcher can stale-overwrite it and never self-correct
      await page.goto('/')
      await expect(cardLoc).toHaveCount(1)
    }).toPass({ timeout: 15000 })
    // visibly a guess — different from a PRD the human wrote — and waiting on you to correct it
    await expect(cardLoc.locator('.chip', { hasText: /guess/i })).toHaveCount(1)
    expect(await cardLoc.getAttribute('data-waiting')).toBe('1')

    // the detail is the two columns and NOTHING to accept — no gate anywhere. Retry the detail nav:
    // right after the fixture lands, the watcher can briefly rebuild the board stale (no storefront in
    // its SCREENS list yet), so re-goto until the detail actually shows this screen's columns — the
    // same settle the _modes specs ride out, and the same one a real browser gets via live-reload.
    const dt = page.locator('.dt[data-screen="' + name + '"]:not([hidden])')
    await expect(async () => {
      build()   // re-assert the board each retry — the watcher can stale-overwrite it and never self-correct
      await page.goto('/#/' + name)
      await expect(dt.locator('.cols')).toBeVisible()
    }).toPass({ timeout: 15000 })
    await expect(dt.locator('.gate')).toHaveCount(0)                // no acceptance gate (board R8)
    await expect(dt.locator('[data-act="accept"]')).toHaveCount(0)  // nothing to accept
    await expect(dt.locator('[data-gate]')).toHaveCount(0)          // no gate B / draft gate either
  } finally {
    rmSync(join(SPEC, name), { recursive: true, force: true })
    build()
  }
})

test('R4 — nothing found is the greenfield case: no rows, a prompt to write the first PRD', async ({ page }) => {
  writeFileSync(CRAWL, JSON.stringify({ crawledAt: '2026-07-27T10:00:00.000Z', routes: [] }))
  await page.goto('/#init')
  const view = page.locator('#initview')
  await expect(view.locator('#initempty')).toBeVisible()
  await expect(view.locator('#initempty')).toContainText(/first PRD/i)
  // greenfield is the ZERO case of the same flow — the found table is simply empty, not a mode
  await expect(view.locator('#initfound .frow')).toHaveCount(0)
})

test('R5 — rerunning marks new routes new and leaves a settled row alone', async ({ page }) => {
  // one route already has a real (non-guess) screen on the board — 'board' — and one is new
  writeFileSync(CRAWL, JSON.stringify({
    crawledAt: '2026-07-27T10:00:00.000Z',
    routes: [{ route: '/board', title: 'Board' }, { route: '/storefront', title: 'Storefront' }]
  }))
  await page.goto('/#init')
  const found = page.locator('#initview #initfound')
  const boardRow = found.locator('.frow', { hasText: '/board' })
  const newRow = found.locator('.frow', { hasText: '/storefront' })
  await expect(boardRow).toContainText(/already on board|yours/i)
  await expect(newRow).toContainText(/new/i)

  await page.screenshot({ path: 'spec/init/screen.png', fullPage: false })
})
