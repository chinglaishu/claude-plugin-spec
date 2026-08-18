import { test, expect, checkReq } from '../_base'
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

test('R3 — a drafted PRD is canon the moment it is written: one CARD, no guess chip, nothing waiting, no gate', async ({ page }) => {
  // A kg-deep pass drafts a PRD on the human's behalf (the crawl itself still only inventories rows,
  // init R2). makeDocumentScreen builds that drafted shape; it rebuilds the board, so the row is there
  // without waiting on the watcher. In the no-guess model (the human, 2026-08-17) a drafted requirement
  // is canon immediately — an ordinary starting point the human edits or removes freely, exactly like a
  // PRD they wrote from scratch. There is no draft/guess state, no accept gate, no gate B — nothing
  // waits on a person to confirm it.
  const name = makeDocumentScreen('storefront')
  try {
    const cardLoc = page.locator('#home .card[data-screen="' + name + '"]')
    await expect(async () => {
      build()   // re-assert the board each retry — the watcher can stale-overwrite it and never self-correct
      await page.goto('/')
      await expect(cardLoc).toHaveCount(1)
    }).toPass({ timeout: 15000 })
    // a drafted screen is an ordinary card — no guess chip, no waiting marker, and the rest of the
    // card still renders normally (its proven-count chip and requirement titles)
    await expect(cardLoc.locator('.chip', { hasText: /guess/i })).toHaveCount(0)
    expect(await cardLoc.getAttribute('data-waiting')).toBeNull()
    await expect(cardLoc.locator('.pcount')).toHaveCount(1)
    await expect(cardLoc.locator('.rl li')).not.toHaveCount(0)

    // the detail carries NOTHING to accept — no gate anywhere. Retry the detail nav: right after
    // the fixture lands, the watcher can briefly rebuild the board stale (no storefront in its
    // SCREENS list yet), so re-goto until the detail actually opens this screen (the Focus reader
    // visible — the default view; the Columns view is retired, board R13 2026-08-18) — the same
    // settle the _modes specs ride out, and the same one a real browser gets via live-reload.
    const dt = page.locator('.dt[data-screen="' + name + '"]:not([hidden])')
    await expect(async () => {
      build()   // re-assert the board each retry — the watcher can stale-overwrite it and never self-correct
      await page.goto('/#/' + name)
      await expect(dt.locator('.focusov')).toBeVisible()
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

// A voice-ready machine, faked so the toggle is enabled regardless of what is (or isn't) installed
// on the box running the suite — piper is never assumed present (board R10 rule 3).
const VOICE_READY = { ready: true, ffmpeg: true, ffprobe: true, synth: true, voiceModel: true, missing: [], reason: '' }

test('R6 — voice-over is a saved, per-project switch, off by default', async ({ page }) => {
  // The whole of R6: a Setup switch that is OFF by default, PERSISTS to the project's own config, and
  // reads back on a fresh load. Start from no config so the default and the round-trip are both real.
  if (existsSync(CONFIG)) rmSync(CONFIG)
  // the switch is disabled until voicing is possible; fake it ready so this test can actually toggle it
  await page.route('**/api/voice-status', r => r.fulfill({ json: VOICE_READY }))
  await page.goto('/#init')
  await expect(page.locator('#initview')).toBeVisible()
  const box = page.locator('#initvoiceover')

  await checkReq('R6', async () => {
    await expect(box).toBeEnabled()   // piper is "present", so the switch is live
    // OFF by default — a fresh project shows it unchecked (and never wrote it on)
    await expect(box).not.toBeChecked()

    // turn it on, save → it persists to spec/_config.json (per project, like the run pace)
    await box.check()
    await page.locator('#initsave').click()
    await expect.poll(() => config()?.voiceOver).toBe(true)

    // read-back: a fresh load of the page shows the switch still on, from disk — not a defaulted false
    await page.goto('/')
    await page.goto('/#init')
    await expect(page.locator('#initvoiceover')).toBeChecked()

    // and it switches back off — the toggle is a real two-way switch, not a one-shot opt-in
    await page.locator('#initvoiceover').uncheck()
    await page.locator('#initsave').click()
    await expect.poll(() => config()?.voiceOver).toBe(false)
  })
})

test('R6 — the switch is disabled until piper is ready, with a copyable install helper', async ({ page }) => {
  // "off because you chose to" must never be confused with "off because it cannot run yet": until
  // ffmpeg + a synthesizer + a voice model are all detected, the switch is DISABLED and Setup shows
  // what is missing plus a one-click way to fix it (a Claude prompt and a shell block). Deterministic
  // via a stubbed /api/voice-status — piper is never assumed installed on the box running the suite.
  await checkReq('R6', async () => {
    // NOT ready → disabled switch, a status line naming the gap, and the install helper visible
    await page.route('**/api/voice-status', r => r.fulfill({ json:
      { ready: false, ffmpeg: true, ffprobe: true, synth: false, voiceModel: false, missing: ['synth', 'voiceModel'], reason: 'piper not found' } }))
    await page.goto('/')
    await page.goto('/#init')
    await expect(page.locator('#initview')).toBeVisible()
    await expect(page.locator('#initvoiceover')).toBeDisabled()
    await expect(page.locator('#initvoicestatus')).toContainText(/piper/i)
    const help = page.locator('#initvoicehelp')
    await expect(help).toBeVisible()
    await expect(help.locator('#initvoiceprompt')).toContainText(/piper/i)   // the copyable Claude prompt
    await expect(help.locator('#initvoiceshell')).toContainText(/spec\/_voices/i) // the shell fallback

    // Re-check re-probes without a reload: now READY → the switch enables itself and the helper hides
    await page.route('**/api/voice-status', r => r.fulfill({ json: VOICE_READY }))
    await page.locator('#initvoicerecheck').click()
    await expect(page.locator('#initvoiceover')).toBeEnabled()
    await expect(help).toBeHidden()
  })
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
