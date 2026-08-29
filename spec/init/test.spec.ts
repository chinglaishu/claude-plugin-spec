import { test, expect, checkReq, coverReqs, flowStep } from '../_base'
import { openSetupAfterCrawl, rerunMarksNewRows, draftedRowBecomesCard } from './steps'
import { writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { countHomeCards, searchRequirementText } from '../board/steps'

// Init is where a project with code but no specs gets a board. The actual crawl — a real browser
// visiting real routes, then Claude drafting a PRD from each page — needs a login and minutes, so
// it is not driven here (like the redraft and the scan, it is a real job outside the deterministic
// suite). What IS proven here is everything around it: the config the crawl reads, how a guessed
// row looks on the board, the greenfield zero case, and that rerunning leaves settled rows alone.
//
// The state guard now snapshots the set of screen directories too, so a fixture row this spec
// creates is removed after the run — a crawl that leaked rows would be the same lie as a scan that
// leaked a fake finding.
//
// Tag backfill (2026-08-29): R1's round-trip and R4's greenfield assertions existed here from the
// start but never wore a checkReq, so those requirements read Unproven on the board — the Task-7
// tagging sweep stopped short of this file. Wrapped now; the assertions themselves are unchanged.

const SPEC = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = join(SPEC, '_config.json')
const CRAWL = join(SPEC, '_crawl.json')
const config = () => (existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, 'utf8')) : null)

test('R1 — the form persists what cannot be guessed, and reads it back', async ({ page, request }) => {
  // Routing to #init HYDRATES the form asynchronously (client.js loadConfig fetches /api/config and
  // writes every field), and that fetch can resolve AFTER the test's fills — wiping them so Save
  // posts empty strings (seen as baseUrl "" in the poll, 2026-08-22, once the grown board stretched
  // the timing). The app's hydrate-on-open is by design; the test was the racing side (rule 4). So
  // make hydration OBSERVABLE: seed a sentinel config, wait until the form shows it — loadConfig
  // has now run — and only then clear the config and fill. The round-trip below is still real: a
  // leftover sentinel could never satisfy the assertions.
  writeFileSync(CONFIG, JSON.stringify({ baseUrl: 'http://sentinel.invalid' }))
  await page.goto('/#init')
  const view = page.locator('#initview')
  await expect(view).toBeVisible()
  await expect(view.locator('#initurl')).toHaveValue('http://sentinel.invalid')
  // start from no config so the round-trip is real, not a coincidence of what was already there
  if (existsSync(CONFIG)) rmSync(CONFIG)

  // the human explicitly asked to be able to point at an ALREADY-RUNNING server rather than always
  // starting one — so the mode is a real choice, and it has to survive
  await view.locator('#initmode [data-mode="attach"]').click()
  await view.locator('#initurl').fill('http://localhost:3000')
  await view.locator('#initroutes').fill('/\n/cart\n/checkout')
  await view.locator('#initsave').click()

  await checkReq('R1', async () => {
    await expect.poll(() => config()?.baseUrl).toBe('http://localhost:3000')
    expect(config()!.mode).toBe('attach')
    expect(config()!.routes).toEqual(['/', '/cart', '/checkout'])

    // read-back: a fresh load of the page shows what was saved, not empty fields
    await page.goto('/')
    await page.goto('/#init')
    await expect(page.locator('#initurl')).toHaveValue('http://localhost:3000')
    await expect(page.locator('#initroutes')).toHaveValue(/\/cart/)
  })
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
  // Task 7 (2026-08-22): the assertion body moved VERBATIM into ./steps.ts (draftedRowBecomesCard)
  // and is now TAGGED — it was asserted here all along but never wore a checkReq.
  await coverReqs('R3')
  const state = await openSetupAfterCrawl(page)
  await checkReq('R3', async () => { await draftedRowBecomesCard(page, state) })
})

test('R4 — nothing found is the greenfield case: no rows, a prompt to write the first PRD', async ({ page }) => {
  writeFileSync(CRAWL, JSON.stringify({ crawledAt: '2026-07-27T10:00:00.000Z', routes: [] }))
  await page.goto('/#init')
  const view = page.locator('#initview')
  await checkReq('R4', async () => {
    await expect(view.locator('#initempty')).toBeVisible()
    await expect(view.locator('#initempty')).toContainText(/first PRD/i)
    // greenfield is the ZERO case of the same flow — the found table is simply empty, not a mode
    await expect(view.locator('#initfound .frow')).toHaveCount(0)
  })
})

test('R2 — a crawled route is a row with its screenshot and NO PRD: inventory, never fake coverage', async ({ page }) => {
  // The real crawl (a browser + minutes) stays outside the suite — seed the inventory it would have
  // written, exactly like the zero case above. '/storefront' has no spec/storefront/prd.md, so the
  // row must read as honestly ungoverned inventory: the crawl.png thumb and the route, marked new.
  writeFileSync(CRAWL, JSON.stringify({
    crawledAt: '2026-07-27T10:00:00.000Z',
    routes: [{ route: '/storefront', title: 'Storefront' }]
  }))
  await page.goto('/#init')
  const row = page.locator('#initview #initfound .frow')
  await checkReq('R2', async () => {
    await expect(row).toHaveCount(1)
    // the screenshot IS the row's evidence — the img points at the route's own crawl.png
    await expect(row.locator('.fthumb img')).toHaveAttribute('src', 'spec/storefront/crawl.png')
    await expect(row.locator('.frt')).toHaveText('/storefront')
    // and NO PRD: nothing was drafted on disk, and the row honestly reads new — 'yours' is
    // reserved for a route that already has a real PRD (R5's settled case)
    expect(existsSync(join(SPEC, 'storefront', 'prd.md'))).toBe(false)
    await expect(row.locator('.fst')).toHaveText('new')
  })
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
  // one route already has a real (non-guess) screen on the board — 'board' — and one is new.
  // Task 7 (2026-08-22): the fixture + assertion moved VERBATIM into ./steps.ts and are now TAGGED.
  await coverReqs('R5')
  const state = await openSetupAfterCrawl(page)
  await checkReq('R5', async () => { await rerunMarksNewRows(page, state) })

  await page.screenshot({ path: 'spec/init/screen.png', fullPage: false })
})

// ── COMPOSED FLOW: 'A crawled row becomes a card — the rerun marks it, the draft lands as one card, home counts it and search finds it — composed' (deterministic emitter — tools/compose.mjs) ─────────────
// Every beat below is an authored step function, red-first-proven in its unit home
// (spec/<screen>/steps.ts); this file's first full run passing is the composition's validity
// (CLAUDE.md rule 1 addendum, the human 2026-08-21). No model was involved and no graph is
// stored — this is ordinary authored-test material from the moment it was written.
test('A crawled row becomes a card — the rerun marks it, the draft lands as one card, home counts it and search finds it — composed', async ({ page }) => {
  await coverReqs('R5', 'R3', 'board:R1', 'board:R9')
  // the budget: the harness default for the fixture + each beat's declared ms (undeclared = the default)
  test.setTimeout(300000)
  // the fixture Given, once — Setup open on a crawl that found /board (already a screen) and /storefront (new)
  const state = await openSetupAfterCrawl(page)
  // beat 1 — proves R5
  await flowStep('the rerun marks the new route new, the settled one already on the board', async () => {
    await checkReq('R5', async () => { await rerunMarksNewRows(page, state) })
  })
  // beat 2 — proves R3
  await flowStep('a drafted PRD is one ordinary card — no guess chip, nothing waiting, no gate', async () => {
    await checkReq('R3', async () => { await draftedRowBecomesCard(page, state) })
  })
  // beat 3 — proves board:R1
  await flowStep('count the home cards — one per screen, titles and a cover', async () => {
    await checkReq('board:R1', async () => { await countHomeCards(page, state) })
  })
  // beat 4 — proves board:R9
  await flowStep('search "canon" — groups that miss hide themselves', async () => {
    await checkReq('board:R9', async () => { await searchRequirementText(page, state) })
  })
})
