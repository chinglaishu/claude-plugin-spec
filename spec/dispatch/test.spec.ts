import { test, expect } from '@playwright/test'

// The dispatch panel IS the run panel — a job is a job, whether it is Claude redrafting a
// wireframe or Playwright running a suite. Testing it with a real Claude redraft is impossible
// here: it needs a login, takes about four minutes, and would rewrite a draft on disk. So these
// specs drive the panel with the one job that is fast, free and deterministic — a run SCOPED to
// the board's own specs. It streams real output, finishes on its own, and is refused while it
// runs exactly as a redraft would be, because the refusal is one guard shared by every job.
//
// SCOPED, never "run all": run-all executes the whole suite, which includes THIS file, which
// clicks run — an infinite recursion. Every job started here targets a single screen whose specs
// never start a job of their own.
//
// This starts a second Playwright process against the same server. The state guard now snapshots
// per-process, so the two runs cannot clobber each other's saved state, and the outer run
// restores everything at the end regardless of what a cancelled inner one left behind.

const idle = async (request: any) => {
  // poll the server's own view of what is running rather than reading a chip — the chip lags a
  // frame behind the SSE 'done', and "is a job running" is the thing R4 and R5 actually turn on
  await expect.poll(async () => (await request.get('/api/runs').then((r: any) => r.json())).running,
    { timeout: 60000 }).toBeNull()
}

test.afterEach(async ({ request }) => { await request.post('/api/cancel').catch(() => {}); await idle(request) })

test('R1/R2 — the panel opens on the click and streams the job while it runs', async ({ page, request }) => {
  await idle(request)
  // R1: opened BY the control you clicked, and it already knows its screen — nothing is typed.
  await page.goto('/#/board')
  await expect(page.locator('#runpanel')).toBeHidden()
  await page.locator('.dt[data-i="0"] .runbtn').first().click()

  const panel = page.locator('#runpanel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('#rptitle')).toContainText('board')
  await expect(panel.locator('#rpchip')).toContainText('running')

  // R2: the work is visible while it runs. A button that goes quiet for two minutes gets clicked
  // again, and the second run fights the first — so real output has to be seen arriving.
  await expect(panel.locator('#rplog')).toContainText(/Running|passed|test/i, { timeout: 60000 })

  // R3: finishing updates the panel in place, no reload, and reports the real result.
  await expect(panel.locator('#rpchip')).toContainText(/passed|failed/, { timeout: 120000 })

  await page.screenshot({ path: 'spec/dispatch/screen.png', fullPage: false })
})

test('R4 — a second job is refused while one runs, not queued silently', async ({ page, request }) => {
  await idle(request)
  await page.goto('/#/board')
  await page.locator('.dt[data-i="0"] .runbtn').first().click()
  await expect(page.locator('#runpanel #rpchip')).toContainText('running')

  // Two agents editing one wireframe is a corrupted file. The guard is one singleton across every
  // job kind — a redraft, a scan, a run all refuse each other — proven here with a run.
  const second = await request.post('/api/run', { data: { screen: 'board' } })
  expect(second.status()).toBe(409)
  expect(await second.text()).toMatch(/in progress/i)
})

test('running one screen leaves every other screen\'s E2E result standing', async ({ page, request }) => {
  // The board offers a per-screen Run on every row. A run writes a report covering only the
  // screens that ran, and the board reads a persistent index it is folded INTO — so a board-only
  // run must update board and leave conflicts, init and the rest exactly as they were. Replacing
  // the index instead of folding is the bug that made one Run blank the whole E2E column.
  await idle(request)
  const r = await request.post('/api/run', { data: { screen: 'board' } })
  expect(r.ok()).toBeTruthy()
  await idle(request)

  await page.goto('/')
  const conflicts = page.locator('.row:has(.nm:text-is("Conflicts"))')
  // conflicts did not run, yet its result is still on the board — not blanked to "never run"
  await expect(conflicts.locator('.runs')).toContainText(/passing/i)
  await expect(conflicts.locator('.runs')).not.toContainText(/never run/i)
})

test('R5 — cancel stops the job, and cancelling nothing is refused not crashed', async ({ request }) => {
  await idle(request)
  const started = await request.post('/api/run', { data: { screen: 'board' } })
  expect(started.status()).toBe(200)

  const cancelled = await request.post('/api/cancel')
  expect(cancelled.status()).toBe(200)
  expect((await cancelled.json()).cancelled).toBe('board')

  // the process is really gone, so the guard clears and a fresh job would be accepted — proven by
  // the server reporting nothing running, not by trusting that SIGTERM landed
  await idle(request)

  // cancelling when nothing runs is a refusal, never an exception — there is nothing to stop
  const nothing = await request.post('/api/cancel')
  expect(nothing.status()).toBe(409)
  expect(await nothing.text()).toMatch(/nothing is running/i)
})
