import { test, expect, checkReq, coverReqs, flowStep } from '../_base'
import { openBoardDetail, clickRunOnCell, watchLogStream, verdictLandsInPlace } from './steps'
import { openDetailReader, toggleViews } from '../board/steps'

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

// Two of the board's OWN test titles — any real board case works as "a fast, deterministic run to
// drive the panel". Kept in sync with spec/board/test.spec.ts; they are safe cases (no state writes).
const B_R1 = 'Home lists every screen as a card'
const B_R2 = 'A requirement and its proof read side by side, each scrolling on its own'
// Focus is the live default (board R13) and the Columns view is retired (2026-08-18): a screen's
// test rows live baked in the HIDDEN source pane, which Focus borrows from and loadRuns folds into.
// These tests read the per-case records off those hidden rows by count/text/attached (visibility
// assertions do not apply to them). Switch to GRID first: it closes the reader, so every borrowed
// node is back home and the whole pane can be read uniformly — and settle the boot fold before
// switching, because loadRuns close-fold-reopens the reader and would flip a mid-fold view change
// back to Focus. The fold fills every case's .tmeta in the same synchronous pass, so a filled meta
// line means the fold is completely done.
const toGrid = async (page: any, screen: string) => {
  const dt = page.locator('.dt[data-screen="' + screen + '"]:not([hidden])')
  // dt-scoped, not pane-scoped: on a one-test screen the reader may hold the only test node
  await expect(dt.locator('.test .tmeta').first()).not.toBeEmpty()
  await dt.locator('.viewseg .vseg[data-view="grid"]').click()
  await expect(dt.locator('.gridview')).toBeVisible()
}

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
  }, { timeout: 150000 }).toBeNull()
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
  // The board spec this drives grew with the visual-requirements rework (board R13/R16, 2026-08-21)
  // — a whole nested board-file run records video and now takes over a minute, so the default 60s
  // ceiling cut the run mid-flight and the orphaned job cascaded into the tests after it. The
  // assertions are unchanged; only the wall clock follows the suite's real size.
  test.setTimeout(300_000)   // raised 2026-08-22 (Task 6 fix round 1): the WATCHED nested board run measured 147 s
  // Task 7 (2026-08-22): the three assertion bodies moved VERBATIM into ./steps.ts as composable
  // beats (the beat-function convention) and are now TAGGED — R1, R2 and R3 were asserted here all
  // along but never wore a checkReq, so they read Untested on the board they prove. R3 gained the
  // no-reload sentinel and the cell-moved-in-place check its beat text names ("the cell it was
  // working on changes state in place").
  await coverReqs('R1', 'R2', 'R3')
  await idle(request)
  const state = await openBoardDetail(page)
  // R1: opened BY the control you clicked, and it already knows its screen — nothing is typed.
  await checkReq('R1', async () => { await clickRunOnCell(page, state) })
  // R2: the work is visible while it runs. A button that goes quiet for two minutes gets clicked
  // again, and the second run fights the first — so real output has to be seen arriving.
  await checkReq('R2', async () => { await watchLogStream(page, state) })
  // R3: finishing updates the panel in place, no reload, and reports the real result.
  await checkReq('R3', async () => { await verdictLandsInPlace(page, state) })

  await page.screenshot({ path: 'spec/dispatch/screen.png', fullPage: false })
})

test('R4 — a person\'s second run takes over the running one: accepted, not refused', async ({ request }) => {
  test.setTimeout(240_000)   // idle()'s budget is 150 s — the 60 s default could not even wait it out (final review m8)
  await idle(request)
  const first = await startRun(request, { screen: 'board' })
  expect(first.ok(), 'the first run is accepted').toBeTruthy()
  // Wait for the SERVER to actually hold the run, and capture WHICH run holds it, before taking it
  // over — or the two /api/run calls land in an undefined order and the assertion cannot tell them
  // apart.
  let firstId = ''
  await expect.poll(async () => {
    const j = await request.get('/api/runs').then((r: any) => r.json())
    firstId = j.runningId || ''
    return j.running
  }, { timeout: 30000 }).toBe('board')
  expect(firstId, 'the first run is holding the slot').toBeTruthy()

  // A person's second job carries NO parent. It is not refused (409) and not queued — it is accepted
  // and cancels the run holding the slot. Only the holder is cancelled; when this spec is itself a
  // nested run, the run driving it is an ANCESTOR, never the holder, so it survives the takeover.
  const second = await request.post('/api/run', { data: { screen: 'board' } })
  expect(second.status(), 'a person\'s second job is accepted, not 409').toBe(200)
  let secondId = ''
  await expect.poll(async () => {
    const j = await request.get('/api/runs').then((r: any) => r.json())
    secondId = j.runningId || ''
    return secondId && secondId !== firstId ? 'held' : ''
  }, { timeout: 30000 }).toBe('held')

  // R5: the run it replaced was cancelled — still recorded, marked not-ok, not silently vanished.
  // Its entry lands in the run log at its own close, a beat after the takeover — poll for it.
  let taken: any = null
  await expect.poll(async () => {
    const runs = (await request.get('/api/runs').then((r: any) => r.json())).runs
    taken = runs.find((x: any) => x.runId === firstId)
    return !!taken
  }, { timeout: 30000 }).toBeTruthy()
  expect(taken.ok, 'a cancelled run is not a pass').toBe(false)

  // THE SLOT GUARD (2026-08-21): the superseded run's close has now fired — its entry just landed —
  // and the slot must STILL be held by the run that took over. Before the guard, that close popped
  // the slot free (or handed it to an ancestor) while the takeover run was live, so a second
  // concurrent run could start: exactly what the one job slot exists to refuse. This test used to
  // lean on that lie — its `await idle(...)` here only returned quickly because the slot was being
  // freed out from under the live takeover run, which then ran on unmanaged under the next tests.
  const held = await request.get('/api/runs').then((r: any) => r.json())
  expect(held.runningId, 'the takeover run still holds the slot after the superseded run\'s close').toBe(secondId)

  // R5: takeover is a cancel — the partial work is left on disk, so the run's log is still readable.
  const log = await request.get('/spec/_runs/' + firstId + '/run.log')
  expect(log.status(), 'the taken-over run left its partial log on disk').toBe(200)

  // The takeover run holds the slot until IT ends — so end it: cancel it BY NAME (R5) rather than
  // waiting out a full board run, then wait for the board to actually be free.
  await request.post('/api/cancel', { data: { runId: secondId } })
  await idle(request)
})

test('R4 — a run may nest inside the run driving it, and nesting is bounded', async ({ request }) => {
  test.setTimeout(240_000)   // idle()'s budget is 150 s — the 60 s default could not even wait it out (final review m8)
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

  // A request that NAMES a parent is only ever a nest attempt, and naming the wrong run is refused —
  // never a takeover. Takeover is reserved for a job with NO parent (a person); a mis-named nest must
  // fail loudly rather than cancel a run it might be running inside. (A person's no-parent takeover is
  // proven in the takeover spec above.)
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

test('running one screen leaves every other screen\'s E2E result standing', async ({ page, request }) => {
  test.setTimeout(240_000)   // a whole nested board run — see the R1/R2 note
  // The board offers a per-screen Run on every row. A run writes a report covering only the
  // screens that ran, and the board reads a persistent index it is folded INTO — so a board-only
  // run must update board and leave conflicts, init and the rest exactly as they were. Replacing
  // the index instead of folding is the bug that made one Run blank the whole E2E column.
  await idle(request)
  const r = await startRun(request, { screen: 'board' })
  expect(r.ok()).toBeTruthy()
  await idle(request)

  // conflicts did not run, yet its E2E tests are STILL on the board — folded across runs, never
  // blanked. Replacing the index instead of folding is the bug that made one Run empty every other
  // screen's test list; here it would leave conflicts' baked test rows empty.
  await page.goto('/#/conflicts')
  await toGrid(page, 'conflicts')
  await expect(page.locator('.dt[data-screen="conflicts"]:not([hidden]) .testpane .test')).not.toHaveCount(0)
})

test('R6/R8 — a run saves its whole log, and records every test case on its own', async ({ request }) => {
  test.setTimeout(240_000)   // a whole nested board run — see the R1/R2 note
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
  expect(log).toContain('Home lists every screen as a card')
  expect(log).toContain('A requirement and its proof read side by side, each scrolling on its own')
  expect(log.length).toBeGreaterThan(200)

  // R8: each case keeps its OWN record — a self-contained log leading with what it was and how it
  // ended — not one verdict folded over the whole file.
  const titles = Object.keys(run.shotsByTest || {})
  expect(titles.length, 'the run recorded per-case entries').toBeGreaterThan(1)
  const one = run.shotsByTest[titles[0]]
  expect(typeof one.log, 'the case carries its own log').toBe('string')
  expect(one.log).toMatch(/passed|failed/i)
})

test('R8 — a run that matched no test is recorded as an error, never 0 of 0 passing', async ({ request }) => {
  // "0 of 0 passing" reads green, but a run that matched no case proved nothing — the exact thing
  // that happened when a title with a paren was handed to -g as a regex and quietly matched nothing.
  // A grep that cannot match anything reproduces it deterministically; the run must come back not-ok
  // and carry an honest reason, not a benign zero tally.
  await idle(request)
  const started = await startRun(request, { screen: 'board', grep: 'zzz-honest-no-match-marker' })
  expect(started.ok(), 'the run is accepted').toBeTruthy()
  await idle(request)

  const data = await request.get('/api/runs').then((r: any) => r.json())
  const run = data.runs.find((x: any) => x.grep === 'zzz-honest-no-match-marker')
  expect(run, 'the no-match run was recorded').toBeTruthy()
  expect(run.total, 'it ran zero cases').toBe(0)
  expect(run.ok, 'a run that tested nothing is not a pass').toBe(false)
  expect(run.note, 'it says WHY, not "0 of 0 passing"').toMatch(/no tests ran/i)
})

test('R8 — running ONE case leaves every other case\'s steps and log standing', async ({ page, request }) => {
  // The record must FOLD across runs, never be read out of one run. A run filtered to a single test
  // records only that test — so taking every case's record from "the newest run" strips the steps
  // and the log off every case that run did not include, which is every other case on the screen.
  test.setTimeout(240_000)   // a whole nested board run — see the R1/R2 note
  await idle(request)
  const full = await startRun(request, { screen: 'board' })
  expect(full.ok()).toBeTruthy()
  await idle(request)

  // now a run scoped to ONE case — its record covers that case and nothing else
  const one = await startRun(request, { screen: 'board', grep: B_R1 })
  expect(one.ok()).toBeTruthy()
  await idle(request)

  await page.goto('/#/board')
  await toGrid(page, 'board')
  // the case that DID run keeps its record, of course — a beat with a recorded OUTCOME (not
  // pending) proves the fold reached it (the rows are read hidden; board R10's rendering of them
  // is proven on the board screen through the Focus reader)
  const ran = page.locator('.dt[data-screen="board"]:not([hidden]) .test', { hasText: B_R1 }).first()
  await expect(ran.locator('.tststeps .beat:not(.pending)').first()).toBeAttached()   // ≥1 overlaid beat
  // and so does a case the filtered run never touched — this is the bit that was being blanked
  const untouched = page.locator('.dt[data-screen="board"]:not([hidden]) .test', { hasText: B_R2 }).first()
  await expect(untouched.locator('.tststeps .beat:not(.pending)').first(),
    'every case still shows its beats, outcome overlaid').toBeAttached()
  await expect(untouched.locator('[data-steps]'), 'every case can open its raw steps').toHaveCount(1)
  // the whole log now opens in ONE place — the popup (board R10). The inline .tstlog is still FOLDED
  // for every case (this fold is the bit that was being blanked); its history feeds the popup and its
  // affordance is the full-log link. Assert the fold reached this untouched case, and the link is there.
  await expect(untouched.locator('.tstlog .lghist > li').first(),
    'every case still keeps its own folded log history').toBeAttached()
  await expect(untouched.locator('.loglink'), 'every case can open its full log in a window').toHaveCount(1)
})

test('R8 — a case keeps a LOG HISTORY, folded across runs', async ({ page, request }) => {
  // One log answers "does it pass today". The question you actually have when a case goes red is
  // when it started failing and what changed — so a case keeps its last runs under the case itself,
  // each stamped with the time, the duration and the commit. This per-case record is where a run's
  // scope and its log live (R6): a scoped run of one case updates that case's history, nowhere else.
  await idle(request)
  const title = B_R2
  for (let i = 0; i < 2; i++) {
    const r = await startRun(request, { screen: 'board', grep: title })
    expect(r.ok()).toBeTruthy()
    await idle(request)
  }

  await page.goto('/#/board')
  await toGrid(page, 'board')
  const one = page.locator('.dt[data-screen="board"]:not([hidden]) .test', { hasText: title }).first()
  // The commit is CLEAR on the result itself, not only inside the opened log (the human, 2026-08-13):
  // the case's meta line names the commit it last ran against, so which commit a case passed or
  // failed in is answerable at a glance — the whole point of stamping the commit.
  await expect(one.locator('.tmeta .tsha')).toHaveText(/[0-9a-f]{6,}/)
  // the folded history is recorded into the case's own .tstlog (loadRuns); the ONE floating log
  // window (board R10 — its open-in-a-window behaviour is proven on the board screen, through the
  // Focus reader's wired Logs button) COPIES this very list, so read the history where it is folded.
  await expect(one.locator('.tstlog .lghist > li').first()).toBeAttached()
  // MORE THAN ONE run of this case is kept — the history, not just the newest. Not an exact count:
  // earlier full runs of this screen covered this case too, and they legitimately count.
  await expect(one.locator('.tstlog .logbox summary')).toContainText(/last \d+ runs/)
  expect(await one.locator('.tstlog .lghist > li').count(),
    'the case keeps a history, not one entry').toBeGreaterThanOrEqual(2)
  // and it is capped, so a case cannot grow an unbounded wall of logs
  expect(await one.locator('.tstlog .lghist > li').count()).toBeLessThanOrEqual(10)
  // each stamped with when it ran and the commit it ran against
  await expect(one.locator('.tstlog .lghist > li').first().locator('.lgh'))
    .toContainText(/20\d\d-\d\d-\d\d \d\d:\d\d · \d+ms · [0-9a-f]{6,}/)
})

test('R8 — EVERY case that has run can expand its steps, not only the one you clicked', async ({ page, request }) => {
  // This one genuinely does a lot: a whole headless board run (~40s), then it opens and inspects EVERY
  // one of that screen's cases. The default 60s cannot cover the run AND the per-case sweep, so it timed
  // out mid-loop (the page closing under it) — give the heavy integration test the wall-clock it needs.
  test.setTimeout(300_000)   // raised again 2026-08-21: the board file grew with R13/R16
  // The record must cover every case a run covered. It did not: a case only had steps if the BOARD
  // had run it, so a screen showed detail for the single case somebody had pressed Run on and
  // nothing for its neighbours — even though the suite had run them all many times.
  await idle(request)
  const r = await startRun(request, { screen: 'board' })
  expect(r.ok()).toBeTruthy()
  await idle(request)

  await page.goto('/#/board')
  await toGrid(page, 'board')
  // the OPEN detail view only — every screen's panel is in the DOM, so an unscoped .test would also
  // pick up screens this run never touched. (The rows are read hidden — the record data, not the
  // rendering, is what this test protects; the rendering is board R10's, proven on its screen.)
  const cases = page.locator('.dt[data-screen="board"]:not([hidden]) .test')
  const n = await cases.count()
  expect(n, 'the screen has several cases').toBeGreaterThan(3)
  for (let i = 0; i < n; i++) {
    const title = await cases.nth(i).locator('.tt').textContent()
    // the record reached THIS case: its meta line is filled by the fold, never left blank
    await expect(cases.nth(i).locator('.tmeta'),
      'case carries its run meta: ' + title).not.toBeEmpty()
    // A case with story steps (flowStep) or proves-tags (checkReq) shows those beats inline WITH the
    // run's outcome overlaid, and every one of them must — that is the fold-across-runs guarantee
    // this test protects. A pure MECHANISM test (no checkReq, no flowStep — e.g. "hudCheck asserts
    // the value it paints") proves no requirement and has no story, so board R10 correctly renders
    // it with no beats. Its LOG still stands (asserted below), the record-per-case point either way.
    if (await cases.nth(i).locator('.tststeps .beat').count()) {
      await expect(cases.nth(i).locator('.tststeps .beat:not(.pending)').first(),
        'case shows its beats, outcome overlaid: ' + title).toBeAttached()
    }
    // its log is folded per case (feeds the one full-log popup); assert the record reached this case
    await expect(cases.nth(i).locator('.tstlog .lghist > li').first(),
      'case keeps its own folded log history: ' + title).toBeAttached()
    await expect(cases.nth(i).locator('.loglink'),
      'case can open its full log in a window: ' + title).toHaveCount(1)
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
  test.setTimeout(300_000)   // a whole WATCHED nested board run — see the R1/R2 note (147 s measured)
  await idle(request)
  await page.goto(BOARD)
  await page.locator('.dt[data-i="0"] .runbtn').first().click()
  const panel = page.locator('#runpanel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('#rplog')).toContainText(/Running|passed|test/i, { timeout: 60000 })
  await expect(panel.locator('#rpchip')).toContainText(/passed|failed/, { timeout: 200000 })
  // Finishing does not close the panel or blank the log out from under you — it is there to read for
  // reference. (The self-reload that closed it is held off under automation, so this guards the
  // observable contract: the log survives the run ending; it does not prove the human reload path.)
  await page.waitForTimeout(2500)
  await expect(panel).toBeVisible()
  await expect(panel.locator('#rplog')).not.toBeEmpty()
  await expect(panel.locator('#rplog')).toContainText(/passing|passed|test/i)
})

test('R5 — cancel stops the job, and cancelling nothing is refused not crashed', async ({ request }) => {
  test.setTimeout(240_000)   // idle()'s budget is 150 s — the 60 s default could not even wait it out (final review m8)
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

// ── COMPOSED FLOW: 'Run from the board cell, watch it stream, the verdict lands — then read the detail in its three views — composed' (deterministic emitter — tools/compose.mjs) ─────────────
// Every beat below is an authored step function, red-first-proven in its unit home
// (spec/<screen>/steps.ts); this file's first full run passing is the composition's validity
// (CLAUDE.md rule 1 addendum, the human 2026-08-21). No model was involved and no graph is
// stored — this is ordinary authored-test material from the moment it was written.
test('Run from the board cell, watch it stream, the verdict lands — then read the detail in its three views — composed', async ({ page }) => {
  await coverReqs('R1', 'R2', 'R3', 'board:R2', 'board:R13')
  // the budget: the harness default for the fixture + each beat's declared ms (undeclared = the default)
  test.setTimeout(620000)
  // the fixture Given, once — the board's own detail open on Focus, the boot fold settled
  const state = await openBoardDetail(page)
  // beat 1 — proves R1
  await flowStep('click Run on the board cell — the panel opens naming the screen, running', async () => {
    await checkReq('R1', async () => { await clickRunOnCell(page, state) })
  })
  // beat 2 — proves R2
  await flowStep('the log streams into the panel before any verdict', async () => {
    await checkReq('R2', async () => { await watchLogStream(page, state) })
  })
  // beat 3 — proves R3
  await flowStep('the verdict lands — chip passed or failed, the cell updated, no reload', async () => {
    await checkReq('R3', async () => { await verdictLandsInPlace(page, state) })
  })
  // beat 4 — proves board:R2
  await flowStep('open the board detail — reading and proof side by side', async () => {
    await checkReq('board:R2', async () => { await openDetailReader(page, state) })
  })
  // beat 5 — proves board:R13
  await flowStep('toggle Focus / List / Flow — the List is one row per requirement', async () => {
    await checkReq('board:R13', async () => { await toggleViews(page, state) })
  })
})
