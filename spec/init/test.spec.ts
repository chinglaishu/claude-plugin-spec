import { test, expect } from '@playwright/test'
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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

const seedGuess = (slug: string, title: string) => {
  const dir = join(SPEC, slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'prd.md'),
    `---\nscreen: ${slug}\narea: Crawled\ntitle: ${title}\nroute: /${slug}\nguess: true\n---\n\n` +
    `## R1 — Read off the page, not written\n\nThis was drafted by the crawl and is a guess. Correct it.\n`)
  return dir
}

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

test('R1 — start mode saves the command it will run', async ({ page }) => {
  await page.goto('/#init')
  await page.locator('#initmode [data-mode="start"]').click()
  await page.locator('#initstart').fill('npm run dev')
  await page.locator('#initurl').fill('http://localhost:5173')
  await page.locator('#initsave').click()
  await expect.poll(() => config()?.mode).toBe('start')
  expect(config()!.startCommand).toBe('npm run dev')
})

test('R3 — a crawled PRD is marked a guess and cannot skip gate A', async ({ page }) => {
  const dir = seedGuess('storefront', 'Storefront')
  try {
    await page.goto('/')
    const row = page.locator('.row', { hasText: 'Storefront' })
    await expect(row).toHaveCount(1)
    // visibly a guess — different from a PRD the CEO wrote
    await expect(row.locator('.chip', { hasText: /guess/i })).toHaveCount(1)
    // and it is waiting on you: a guess you have not corrected is not settled work
    expect(await row.getAttribute('data-waiting')).toBe('1')
    // the loop starts at gate A — no draft, so the screen and e2e cells cannot be approved
    await expect(row.locator('.cell[data-col="draft"] .chip')).toContainText(/not started|review/i)
  } finally {
    rmSync(dir, { recursive: true, force: true })
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
