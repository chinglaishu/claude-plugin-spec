import { test, expect } from '../_base'

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

// The run this very process IS, when the BOARD started it — the server hands each run its own
// record directory, and the directory's name is the runId. Empty for a plain CLI run, which the
// board never registered and which therefore never holds the slot.
const SELF_RUN = (process.env.BOARD_RECORD || '').replace(/\/+$/, '').split('/').pop() || ''
// The board, opened as the run that is driving it. Without the runid, a Run clicked by this spec is
// refused by the very run executing the spec, and every test here hangs at a blank page (R4).
const BOARD = SELF_RUN ? '/?runid=' + SELF_RUN + '#/board' : '/#/board'

// Starting a run FROM this test process, named as nested inside the run executing this spec — the
// same thing the page does with ?runid=. From a CLI run SELF_RUN is empty, the slot is free, and
// this is an ordinary run; from the board it is the nesting R4 allows. Without it, every test here
// that starts its own run is refused by the run that is executing it.
const startRun = (request: any, data: any = {}) =>
  request.post('/api/run', { data: { ...data, parent: SELF_RUN } })

const idle = async (request: any) => {
  // poll the server's own view of what is running rather than reading a chip — the chip lags a
  // frame behind the SSE 'done', and "is a job running" is the thing R4 and R5 actually turn on.
  // The run this process IS is never in its own way: when the board starts this spec it holds the
  // slot for the whole run, so "idle" has to mean "nothing in the way but me".
  await expect.poll(async () => {
    const j = await request.get('/api/runs').then((r: any) => r.json())
    return j.running === null || (SELF_RUN && j.runningId === SELF_RUN) ? null : j.running
  }, { timeout: 60000 }).toBeNull()
}

test.afterEach(async ({ request }) => {
  // Cancel until the board is free again. One cancel kills the innermost job, and a test here can
  // leave a nested run standing on the run that started it — so a single cancel is not enough.
  for (let i = 0; i < 4; i++) {
    const j = await request.get('/api/runs').then((r: any) => r.json()).catch(() => ({}))
    if (!j.running || (SELF_RUN && j.runningId === SELF_RUN)) break
    await request.post('/api/cancel').catch(() => {})
    await new Promise(r => setTimeout(r, 300))
  }
  await idle(request)
})

test('R1/R2 — the panel opens on the click and streams the job while it runs', async ({ page, request }) => {
  await idle(request)
  // R1: opened BY the control you clicked, and it already knows its screen — nothing is typed.
  await page.goto(BOARD)
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
  await page.goto(BOARD)
  await page.locator('.dt[data-i="0"] .runbtn').first().click()
  await expect(page.locator('#runpanel #rpchip')).toContainText('running')
  // The panel says "running" the instant you click — that is client-side optimism. Wait for the
  // SERVER to actually hold the run before racing a second one at it, or the two /api/run calls
  // (the button's own and this test's) land in an undefined order and either could be the winner.
  await expect.poll(async () => (await request.get('/api/runs').then((r: any) => r.json())).running,
    { timeout: 30000 }).not.toBeNull()

  // Two agents editing one wireframe is a corrupted file. The guard is one singleton across every
  // job kind — a redraft, a scan, a run all refuse each other — proven here with a run.
  const second = await request.post('/api/run', { data: { screen: 'board' } })
  expect(second.status()).toBe(409)
  expect(await second.text()).toMatch(/in progress/i)
})

test('R4 — a run may nest inside the run driving it, and nesting is bounded', async ({ request }) => {
  // The board puts every run it starts in the one job slot. This spec proves the run panel BY
  // starting runs, so without nesting the dispatch row is the one row that can never be run from
  // the board: it would wait for the slot its own run is holding. That is the blank browser window.
  await idle(request)
  const outer = await startRun(request, { screen: 'board' })
  expect(outer.ok(), 'a run naming the run that drives it is allowed').toBeTruthy()
  let outerId = ''
  await expect.poll(async () => {
    const j = await request.get('/api/runs').then((r: any) => r.json())
    outerId = j.runningId || ''
    return j.running
  }, { timeout: 30000 }).toBe('board')
  expect(outerId, 'the server names the run holding the slot').toBeTruthy()

  // A person's second job is still refused — the guard R4 exists for is untouched.
  const human = await request.post('/api/run', { data: { screen: 'board' } })
  expect(human.status()).toBe(409)
  // Naming the WRONG run is not a way past it either.
  const wrong = await request.post('/api/run', { data: { screen: 'board', parent: 'not-the-run' } })
  expect(wrong.status()).toBe(409)

  // BOUNDED. Keep asking to nest inside whatever holds the slot; the server must start refusing
  // rather than nesting forever — that is what stops a suite which runs itself from recursing.
  // Asserted as "a refusal arrives within a few levels" rather than "the Nth is refused", because
  // how deep this spec already sits depends on whether the board started it or the CLI did.
  // A grep matching nothing proves the DECISION without starting heavy suites.
  let refused = false
  for (let level = 0; level < 4 && !refused; level++) {
    const id = (await request.get('/api/runs').then((r: any) => r.json())).runningId
    const res = await request.post('/api/run', {
      data: { screen: 'board', grep: 'zzz no such test', parent: id }
    })
    refused = res.status() === 409
  }
  expect(refused, 'nesting stops instead of recursing').toBeTruthy()
})

test('R4 — a refusal names what is blocking it and leaves a way to clear it', async ({ page, request }) => {
  // "Refused, not queued silently" is only honest if the refusal is ACTIONABLE. A dead-end message
  // that disables Cancel tells you that you cannot run, and gives you nothing to do about it —
  // which is exactly what a person hits when they click Run twice.
  await idle(request)
  await page.goto(BOARD)
  await page.locator('.dt[data-i="0"] .runbtn').first().click()
  await expect.poll(async () => (await request.get('/api/runs').then((r: any) => r.json())).running,
    { timeout: 30000 }).not.toBeNull()

  // the second click, while the first is still going
  await page.locator('.dt[data-i="0"] .runbtn').first().click()
  const panel = page.locator('#runpanel')
  await expect(panel.locator('#rpchip')).toContainText('refused')
  // it NAMES the job in the way, rather than saying only "a run is already in progress"
  await expect(panel.locator('#rplog')).toContainText('board')
  // and it says what to do about it
  await expect(panel.locator('#rplog')).toContainText(/cancel|wait/i)
  // Cancel stays usable — cancelling the blocking run is how you clear the block from right here
  await expect(page.locator('#rpcancel')).toBeEnabled()
})

test('running one screen leaves every other screen\'s E2E result standing', async ({ page, request }) => {
  // The board offers a per-screen Run on every row. A run writes a report covering only the
  // screens that ran, and the board reads a persistent index it is folded INTO — so a board-only
  // run must update board and leave conflicts, init and the rest exactly as they were. Replacing
  // the index instead of folding is the bug that made one Run blank the whole E2E column.
  await idle(request)
  const r = await startRun(request, { screen: 'board' })
  expect(r.ok()).toBeTruthy()
  await idle(request)

  await page.goto('/')
  const conflicts = page.locator('.row:has(.nm:text-is("Conflicts"))')
  // conflicts did not run, yet its result is still on the board — not blanked to "never run"
  await expect(conflicts.locator('.runs')).toContainText(/passing/i)
  await expect(conflicts.locator('.runs')).not.toContainText(/never run/i)
})

test('R6/R8 — a run saves its whole log, and records every test case on its own', async ({ request }) => {
  await idle(request)
  const r = await startRun(request, { screen: 'board' })
  expect(r.ok()).toBeTruthy()
  await idle(request) // the run has finished and been recorded

  const data = await request.get('/api/runs').then((r: any) => r.json())
  const run = data.runs.find((x: any) => x.screen === 'board')
  expect(run, 'the board run is in the log').toBeTruthy()

  // R6: the WHOLE log is kept — retrievable in full after the stream ended, not thrown away.
  const logRes = await request.get('/spec/_runs/' + run.runId + '/run.log')
  expect(logRes.status(), 'the run log was saved and is servable').toBe(200)
  const log = await logRes.text()
  // it is the whole log, not a one-word verdict: every one of board's cases is named in it, so a
  // failure could be read back long after the panel that showed it live is gone
  expect(log).toContain('one row per screen')
  expect(log).toContain('four cells')
  expect(log.length).toBeGreaterThan(200)

  // R8: each case keeps its OWN record — a self-contained log leading with what it was and how it
  // ended — not one verdict folded over the whole file.
  const titles = Object.keys(run.shotsByTest || {})
  expect(titles.length, 'the run recorded per-case entries').toBeGreaterThan(1)
  const one = run.shotsByTest[titles[0]]
  expect(typeof one.log, 'the case carries its own log').toBe('string')
  expect(one.log).toMatch(/passed|failed/i)
})

test('R8 — running ONE case leaves every other case\'s steps and log standing', async ({ page, request }) => {
  // The record must FOLD across runs, never be read out of one run. A run filtered to a single test
  // records only that test — so taking every case's record from "the newest run" strips the steps
  // and the log off every case that run did not include, which is every other case on the screen.
  await idle(request)
  const full = await startRun(request, { screen: 'board' })
  expect(full.ok()).toBeTruthy()
  await idle(request)

  // now a run scoped to ONE case — its record covers that case and nothing else
  const one = await startRun(request, { screen: 'board', grep: 'R1 — one row per screen' })
  expect(one.ok()).toBeTruthy()
  await idle(request)

  await page.goto('/#/board')
  // the case that DID run keeps its record, of course
  const ran = page.locator('.tst', { hasText: 'R1 — one row per screen' }).first()
  await expect(ran.locator('.tststeps .stepstog')).toBeVisible()
  // and so does a case the filtered run never touched — this is the bit that was being blanked
  const untouched = page.locator('.tst', { hasText: 'R2 — four cells' }).first()
  await expect(untouched.locator('.tststeps .stepstog'), 'every case can still expand its steps').toBeVisible()
  await expect(untouched.locator('.tstlog summary'), 'every case still has its own log').toBeVisible()
})

test('R6/R8 — a case keeps a LOG HISTORY, and a scoped run says which case it was', async ({ page, request }) => {
  // One log answers "does it pass today". The question you actually have when a case goes red is
  // when it started failing and what changed — so a case keeps its last runs, each stamped with the
  // time, the duration and the commit. And a run scoped to one case has to say WHICH case: a list of
  // "board 1/1 · 1/1" is a list of runs nobody can tell apart.
  await idle(request)
  const title = 'R2 — four cells, left to right, in workflow order'
  for (let i = 0; i < 2; i++) {
    const r = await startRun(request, { screen: 'board', grep: title })
    expect(r.ok()).toBeTruthy()
    await idle(request)
  }

  await page.goto('/#/board')
  const one = page.locator('.tst', { hasText: title }).first()
  const log = one.locator('.tstlog')
  // MORE THAN ONE run of this case is kept — the history, not just the newest. Not an exact count:
  // earlier full runs of this screen covered this case too, and they legitimately count.
  await expect(log.locator('summary')).toContainText(/last \d+ runs/)
  expect(await log.locator('.lghist > li').count(),
    'the case keeps a history, not one entry').toBeGreaterThanOrEqual(2)
  // and it is capped, so a case cannot grow an unbounded wall of logs
  expect(await log.locator('.lghist > li').count()).toBeLessThanOrEqual(10)
  // each stamped with when it ran and the commit it ran against
  await expect(log.locator('.lghist > li').first().locator('.lgh'))
    .toContainText(/20\d\d-\d\d-\d\d \d\d:\d\d · \d+ms · [0-9a-f]{6,}/)

  // and the recent-runs list names the case the run covered
  await expect(page.locator('.runlog .runrow').first()).toContainText('four cells')
})

test('R8 — EVERY case that has run can expand its steps, not only the one you clicked', async ({ page, request }) => {
  // The record must cover every case a run covered. It did not: a case only had steps if the BOARD
  // had run it, so a screen showed detail for the single case somebody had pressed Run on and
  // nothing for its neighbours — even though the suite had run them all many times.
  await idle(request)
  const r = await startRun(request, { screen: 'board' })
  expect(r.ok()).toBeTruthy()
  await idle(request)

  await page.goto('/#/board')
  // the OPEN detail view only — every screen's panel is in the DOM, so an unscoped .tst would also
  // pick up screens this run never touched
  const cases = page.locator('.dt:visible .tst')
  const n = await cases.count()
  expect(n, 'the screen has several cases').toBeGreaterThan(3)
  for (let i = 0; i < n; i++) {
    const title = await cases.nth(i).locator('.tt').textContent()
    await expect(cases.nth(i).locator('.tststeps .stepstog'),
      'case can expand its steps: ' + title).toBeVisible()
    await expect(cases.nth(i).locator('.tstlog summary'),
      'case has its own log: ' + title).toBeVisible()
  }
})

test('R7 — the run panel offers no background run', async ({ page }) => {
  await page.goto(BOARD)
  // A job runs in the open or is cancelled — there is no hidden "background" mode. Not one control
  // on any E2E cell, and not one inside the panel: a run you cannot watch is the thing being removed.
  await expect(page.locator('.runbg')).toHaveCount(0)
  await expect(page.locator('#rpbg')).toHaveCount(0)
})

test('R7 — the panel and its log stay on screen after the run ends', async ({ page, request }) => {
  await idle(request)
  await page.goto(BOARD)
  await page.locator('.dt[data-i="0"] .runbtn').first().click()
  const panel = page.locator('#runpanel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('#rplog')).toContainText(/Running|passed|test/i, { timeout: 60000 })
  await expect(panel.locator('#rpchip')).toContainText(/passed|failed/, { timeout: 120000 })
  // Finishing does not close the panel or blank the log out from under you — it is there to read for
  // reference. (The self-reload that closed it is held off under automation, so this guards the
  // observable contract: the log survives the run ending; it does not prove the human reload path.)
  await page.waitForTimeout(2500)
  await expect(panel).toBeVisible()
  await expect(panel.locator('#rplog')).not.toBeEmpty()
  await expect(panel.locator('#rplog')).toContainText(/passing|passed|test/i)
})

test('R5 — cancel stops the job, and cancelling nothing is refused not crashed', async ({ request }) => {
  await idle(request)
  const started = await startRun(request, { screen: 'board' })
  expect(started.status()).toBe(200)

  const cancelled = await request.post('/api/cancel')
  expect(cancelled.status()).toBe(200)
  expect((await cancelled.json()).cancelled).toBe('board')

  // the process is really gone, so the guard clears and a fresh job would be accepted — proven by
  // the server reporting nothing running, not by trusting that SIGTERM landed
  await idle(request)

  // Cancelling a job that is not running is a refusal, never an exception — and never a different
  // job. Named, so this holds wherever the spec runs from: a bare cancel here would stop whatever
  // holds the slot, and when the BOARD is running this spec that is this very run killing itself.
  const nothing = await request.post('/api/cancel', { data: { runId: 'not-a-run' } })
  expect(nothing.status()).toBe(409)
  expect(await nothing.text()).toMatch(/nothing is running/i)
})
