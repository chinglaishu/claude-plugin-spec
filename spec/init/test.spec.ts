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

  // the CEO explicitly asked to be able to point at an ALREADY-RUNNING server rather than always
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

test('R3 — a crawled screen lands as a document-mode row: a guess, accepted not gate-approved', async ({ page }) => {
  // A real crawl drafts the PRD, authors a test, and shoots the screen — so the row lands in
  // DOCUMENT mode. makeDocumentScreen builds exactly that shape (PRD guess + screen.png + test,
  // no wireframe); it rebuilds the board, so the row is there without waiting on the watcher.
  const name = makeDocumentScreen('storefront', { guess: true })
  try {
    const row = page.locator('.row', { hasText: name })
    await expect(async () => {
      await page.goto('/')
      await expect(row).toHaveCount(1)
    }).toPass({ timeout: 15000 })
    // visibly a guess — different from a PRD the CEO wrote — and waiting on you to accept it
    await expect(row.locator('.chip', { hasText: /guess/i })).toHaveCount(1)
    expect(await row.getAttribute('data-waiting')).toBe('1')
    // document mode: no wireframe, and the CURRENT screen is shown — not the greenfield "not started"
    await expect(row.locator('.cell[data-col="draft"]')).toContainText(/no wireframe/i)
    await expect(row.locator('.cell[data-col="screen"] img')).toHaveCount(1)
    // the one gate is accepting the requirements — never a draft/gate-A review. Retry the detail nav:
    // right after the fixture lands, the watcher can briefly rebuild the board stale (no storefront in
    // its SCREENS list yet), so re-goto until the detail actually shows this screen's accept bar — the
    // same settle the _modes specs ride out, and the same one a real browser gets via live-reload.
    const bar = page.locator('.dt:not([hidden]) .gb')
    const acceptBtn = bar.locator('[data-act="accept"][data-gate="prd"]')
    await expect(async () => {
      await page.goto('/#/' + name)
      await expect(acceptBtn).toBeVisible()
    }).toPass({ timeout: 15000 })
    await expect(bar.locator('[data-gate="screen"]')).toHaveCount(0)
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
