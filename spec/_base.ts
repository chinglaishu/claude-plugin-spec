import { test as base, expect } from '@playwright/test'
import type { BrowserContext, Page, Locator } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

export { expect }

const SPEC_DIR = dirname(fileURLToPath(import.meta.url))

// Wait for DATA, not just the shell. A real app's chrome (nav, headers, empty table) paints instantly;
// the rows, the chart, the numbers arrive after an API call. A test that asserts the page "loaded"
// passes BEFORE that data exists — the smoke-alarm-with-the-battery-out this project warns about, and
// exactly what a guessed characterization test falls into by default. Await a real content locator (a
// table row, a grid cell, an API-derived value) before asserting on it, so the test proves the screen
// actually works rather than that it merely rendered its frame. kg-e2e says to assert on THIS, not the
// chrome. Example:  await waitForContent(page.getByRole('row'));  await expect(page.getByRole('row')).toHaveCount(...)
export async function waitForContent (locator: Locator, opts: { timeout?: number } = {}) {
  await expect(locator.first()).toBeVisible({ timeout: opts.timeout ?? 15000 })
}

// One browser window, held OPEN for the whole run, when the board asks to watch it
// (BOARD_ONE_WINDOW).
//
// Playwright gives each test its own context and page, and in a headed browser that means a window
// opening and closing around every test. Two things were tried and rejected: sharing only the
// context still let the per-test page close, and closing the last page of a context closes its
// window; sharing the page itself broke tests that were written to start from a fresh one.
//
// So: a worker-scoped context, and a worker-scoped KEEPALIVE page that opens once and never
// closes. The keepalive holds the window open for the whole run, while each test still gets its
// own fresh page (a tab) in that same window — full per-test isolation, one window that never
// blinks out. Only for watching; the deterministic suite never sets BOARD_ONE_WINDOW.
const windowed = process.env.BOARD_ONE_WINDOW
  ? base.extend<{ page: Page }, { _sharedContext: BrowserContext, _keepalive: Page }>({
      _sharedContext: [async ({ browser }, use) => {
        const context = await browser.newContext()
        await use(context)
        await context.close()
      }, { scope: 'worker' }],
      // a single page that stays open the whole run, so the window always has at least one tab and
      // therefore never closes between tests
      _keepalive: [async ({ _sharedContext }, use) => {
        const page = await _sharedContext.newPage()
        await use(page)
      }, { scope: 'worker' }],
      // each test still gets its own page in the shared window — isolation kept, window kept
      page: async ({ _sharedContext, _keepalive }, use) => {
        const page = await _sharedContext.newPage()
        await use(page)
        await page.close()
      }
    })
  : base

// The page of the test currently running, stashed so checkReq and the HUD can paint into it
// without every call site threading `page` through. Safe because the suite runs ONE worker
// (playwright.board.ts workers:1) — one test, one page, at a time.
let CURRENT_PAGE: Page | null = null
export const test = windowed.extend<{ page: Page }>({
  page: async ({ page }, use, testInfo) => {
    CURRENT_PAGE = page
    FLOW_N = 0
    FLOW_DEPTH = 0
    FAILED_PAINTED = false
    STEP_FAILURES = []
    try {
      await use(page)
    } finally {
      CURRENT_PAGE = null
      // A failed run's recording is the BEST evidence of the failure, so it must never be dropped —
      // yet Playwright finishes a failed test without attaching its video (board R10). A page's
      // video only FINALISES when the page closes, so saveAs() on a still-open page waits forever;
      // close the page here to finalise it, then save it into the test's own output dir and attach
      // it, so the board's reporter finds the .webm and the failed run stays playable. The built-in
      // page teardown that follows closes an already-closed page harmlessly. Best-effort, and only
      // under a board recording of an unexpected outcome.
      if (process.env.BOARD_RECORD && testInfo.status && testInfo.status !== testInfo.expectedStatus) {
        try {
          const v = page.video && page.video()
          if (v) {
            await page.close().catch(() => {})            // finalise the recording
            const dest = testInfo.outputPath('video.webm')
            await v.saveAs(dest)
            if (!testInfo.attachments.some(a => a.contentType === 'video/webm')) {
              testInfo.attachments.push({ name: 'video', path: dest, contentType: 'video/webm' })
            }
          }
        } catch { /* the recording just could not be saved — nothing more to do */ }
      }
    }
  }
})

// Per-test narration state: the story-step counter, whether we are inside a flowStep (a nested
// checkReq must not steal the narrative headline), and whether the red failure frame has already
// been painted (an inner failure bubbles — paint once, at the most specific point).
let FLOW_N = 0
let FLOW_DEPTH = 0
let FAILED_PAINTED = false
// Every step that failed THIS test. A flow does NOT abort at the first failure — it records each
// one here and keeps going, so the recording reaches every step (incl. the ones that scroll a
// table into view) and the board can show WHICH parts failed, not just the first (board R10). The
// afterEach hook paints a final red summary and fails the test if this is non-empty.
let STEP_FAILURES: { n: number, title: string, message: string }[] = []

// A requirement id in words: parse the screen's prd.md heading (`## R5 — Title`) once per screen.
// A bare id belongs to the running spec file's own screen; a qualified one (`asset-plan:R5`) names
// its screen. Missing file or id → empty string, and the HUD falls back to the bare id.
const TITLE_CACHE: Record<string, Record<string, string>> = {}
function reqTitle (qid: string): string {
  const i = qid.indexOf(':')
  const scr = i > -1 ? qid.slice(0, i) : basename(dirname(String(test.info().file || '')))
  const rid = i > -1 ? qid.slice(i + 1) : qid
  if (!(scr in TITLE_CACHE)) {
    const map: Record<string, string> = {}
    try {
      const md = readFileSync(join(SPEC_DIR, scr, 'prd.md'), 'utf8')
      for (const m of md.matchAll(/^##\s+(R\d+)\s+—\s+(.+)$/gm)) map[m[1]] = m[2].trim()
    } catch { /* not every screen has a PRD yet — the HUD then shows the id alone */ }
    TITLE_CACHE[scr] = map
  }
  return TITLE_CACHE[scr][rid] || ''
}

// The in-video narration TOPBAR (board R10). Painted INTO the page under test, so it is burned
// into the recording and its cover — one consistent bar fixed to the top, never a caption card
// mid-frame. pointer-events:none so it can never swallow a click the test meant for the app;
// inline styles because it renders inside arbitrary apps that know nothing of the board's design
// system (the values mirror the design tokens: ink, paper, and a deep bengara for failure).
// The bar is a designed, glanceable card (board R10): a bold title line for the current story
// step, the announced values stacked beneath — accumulating within a step the way a person would
// list them, capped so the bar cannot swallow the frame.
const HUD = { head: '', detail: '' }
const DETAIL_MAX_LINES = 6
// A goto WIPES the injected bar — and real flows navigate mid-beat (a cross-page read). Repaint
// after every main-frame navigation so the narration is consistently on screen, not only until
// the first goto. One listener per page, installed lazily on first paint.
const HOOKED = new WeakSet<Page>()
function repaintOnNav (page: Page): void {
  if (HOOKED.has(page)) return
  HOOKED.add(page)
  page.on('framenavigated', f => {
    if (f === page.mainFrame() && HUD.head && page === CURRENT_PAGE) void paintHud({})
  })
}
async function paintHud (s: { head?: string, detail?: string, appendDetail?: string, failed?: boolean }): Promise<void> {
  const page = CURRENT_PAGE
  if (!page) return
  repaintOnNav(page)
  if (s.head !== undefined) { HUD.head = s.head; HUD.detail = '' }   // a new step starts a fresh list
  if (s.detail !== undefined) HUD.detail = s.detail
  if (s.appendDetail !== undefined) {
    const lines = (HUD.detail ? HUD.detail.split('\n') : []).concat(String(s.appendDetail).split('\n'))
    HUD.detail = lines.slice(-DETAIL_MAX_LINES).join('\n')
  }
  await page.evaluate(({ head, detail, failed }) => {
    let el = document.getElementById('__specboard-hud')
    if (!el) {
      el = document.createElement('div')
      el.id = '__specboard-hud'
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;pointer-events:none;' +
        'display:flex;flex-direction:column;gap:4px;padding:14px 22px 12px;' +
        'font-family:system-ui,sans-serif;color:#f4f1ea;background:rgba(28,27,24,.94);' +
        'border-bottom:3px solid rgba(244,241,234,.30);box-shadow:0 2px 14px rgba(0,0,0,.30)'
      const h = document.createElement('div')
      h.id = '__specboard-hud-head'
      h.style.cssText = 'font-weight:700;font-size:20px;line-height:1.3;letter-spacing:-.01em'
      const d = document.createElement('div')
      d.id = '__specboard-hud-detail'
      d.style.cssText = 'font-weight:400;font-size:15px;line-height:1.5;opacity:.92;white-space:pre-line'
      el.append(h, d)
      document.body.appendChild(el)
    }
    el.style.background = failed ? 'rgba(122,47,29,.96)' : 'rgba(28,27,24,.94)'
    el.style.borderBottomColor = failed ? 'rgba(232,161,138,.65)' : 'rgba(244,241,234,.30)'
    const hd = document.getElementById('__specboard-hud-head')
    const dt = document.getElementById('__specboard-hud-detail')
    if (hd) hd.textContent = head
    if (dt) { dt.textContent = detail; dt.style.display = detail ? '' : 'none' }
  }, { head: HUD.head, detail: HUD.detail, failed: !!s.failed }).catch(() => {})
}

// A narration line does TWO things at once: it stacks onto the topbar (into the video), and it is
// RECORDED as a `note: ` step so the board can show it as the step's expandable detail — the same
// got/expected line in both places, from one call (board R10).
async function narrate (text: string): Promise<void> {
  await test.step('note: ' + text, async () => {
    await paintHud({ appendDetail: text })
  })
}
// Announce the got vs expected values of the current check.
export async function hudCheck (label: string, expected: unknown, actual: unknown): Promise<void> {
  await narrate(String(label) + ' — got ' + String(actual) + ' · expected ' + String(expected))
}
// Freeform variant, for a sentence the author wants on the bar.
export async function hudNote (text: string): Promise<void> {
  await narrate(String(text))
}

// Scroll a target to the CENTRE of the viewport and HOLD, so the recording actually shows the value
// a step asserts on (board R10) rather than asking you to trust the topbar. Generic — it works
// across nested scroll containers via scrollIntoView; a virtualised cell (one an app renders only
// when its column is in view) must be brought into the DOM by the app's own API first, then
// revealed. The hold is long under a board recording (so the frame is readable on playback) and
// short otherwise (so a plain suite run stays fast).
export async function reveal (target: Locator, opts: { hold?: number } = {}): Promise<void> {
  const el = target.first()
  try {
    await el.scrollIntoViewIfNeeded({ timeout: 4000 })
    await el.evaluate(n => (n as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' }))
  } catch { /* off-screen / virtualised / detached — nothing to centre */ }
  const hold = opts.hold ?? (process.env.BOARD_RECORD ? 1600 : 200)
  if (CURRENT_PAGE) await CURRENT_PAGE.waitForTimeout(hold).catch(() => {})
}

// A STORY STEP (board R10): one numbered sentence of what a user does and what should happen —
// "Edit the draft — change Unit 01-02 Net Rent from 40,000 to 60,000". The board shows the flow as
// these steps; the topbar leads with the current one; checkReq calls nest INSIDE them so coverage
// still tags requirements while the narrative carries the story.
export async function flowStep (title: string, fn: () => Promise<void> | void): Promise<void> {
  const n = ++FLOW_N
  await paintHud({ head: n + '. ' + title })
  FLOW_DEPTH++
  try {
    // fn runs INSIDE a test.step, so a failure marks THAT step failed on the board. The catch is
    // OUTSIDE the step — the error has already left it (so Playwright records the step as failed) —
    // which lets the flow CONTINUE to the next step instead of aborting (board R10). The test is
    // still failed: afterEach throws the aggregate. The recording keeps rolling through every step.
    await test.step(title, async () => { await fn() })
    await paintHud({ head: '✓ ' + n + '. ' + title, detail: HUD.detail })
  } catch (err) {
    STEP_FAILURES.push({ n, title, message: String((err as Error).message || err) })
    await paintHud({ head: '✗ FAILED — ' + n + '. ' + title, detail: HUD.detail, failed: true })
    if (CURRENT_PAGE) await CURRENT_PAGE.waitForTimeout(900).catch(() => {})  // hold the red frame
    // deliberately NOT re-thrown — the flow runs on
  } finally {
    FLOW_DEPTH--
  }
}

// checkReq / coverReqs — how a test PROVES a requirement (R4/R5). A test tags the requirement ids it
// covers (qualified, e.g. `asset-plan:R5`, so a flow can prove another screen's requirement) and
// asserts each on something that would fail without it. `checkReq(id, fn)` runs one such assertion
// inside a `proves <id>` step — the step's pass/fail IS the requirement's proof, and it doubles as
// human-readable evidence. `coverReqs(...)` declares the full set a flow intends to reach, so a flow
// that stops early leaves the ones it never got to honestly NOT-REACHED (not green, not red) rather
// than silently absent. The reporter reads the steps and the annotation back out (tools/coverage.mjs).
export async function checkReq (id: string, fn: () => Promise<void> | void): Promise<void> {
  // the step NAME stays exactly `proves <id>` — tools/coverage.mjs derives requirement state from it.
  const title = reqTitle(id)
  const nested = FLOW_DEPTH > 0
  if (nested) {
    // inside a flowStep: run the proof in its `proves` step and let a failure PROPAGATE — the
    // enclosing flowStep catches it, records it, paints the red frame and continues the flow.
    await test.step('proves ' + id, async () => { await fn() })
    return
  }
  // top-level (a requirement-enumeration test, e.g. the board's own suite): continue-on-failure
  // here too, so the test runs through EVERY requirement and the board shows each one's verdict,
  // not just the first that broke. The test still fails — afterEach throws the aggregate.
  await paintHud({ head: 'proving ' + id + (title ? ' — ' + title : '') })
  try {
    await test.step('proves ' + id, async () => { await fn() })
    await paintHud({ head: '✓ ' + id + (title ? ' — ' + title : ''), detail: HUD.detail })
  } catch (err) {
    STEP_FAILURES.push({ n: 0, title: id + (title ? ' — ' + title : ''), message: String((err as Error).message || err) })
    await paintHud({ head: '✗ FAILED — ' + id + (title ? ' · ' + title : ''), detail: HUD.detail, failed: true })
    if (CURRENT_PAGE) await CURRENT_PAGE.waitForTimeout(700).catch(() => {})
  }
}
export function coverReqs (...ids: string[]): void {
  test.info().annotations.push({ type: 'covers', description: ids.join(' ') })
}

// A flow ran every step and collected its failures rather than dying at the first (board R10). Now
// close the loop: paint ONE final red summary — so the recording's cover frame shows the failure
// (not a later green step) and names every part that broke — then FAIL the test with all of them.
test.afterEach(async () => {
  if (!STEP_FAILURES.length) return
  const f = STEP_FAILURES
  if (CURRENT_PAGE) {
    await paintHud({
      head: '✗ ' + f.length + ' of this test’s steps failed',
      detail: f.map(s => '✗ ' + (s.n ? s.n + '. ' : '') + s.title).slice(0, 6).join('\n'),
      failed: true
    }).catch(() => {})
    await CURRENT_PAGE.waitForTimeout(1400).catch(() => {})
  }
  const lines = f.map(s => '  ✗ ' + (s.n ? 'step ' + s.n + ' ' : '') + '"' + s.title + '": ' +
    String(s.message).split('\n')[0]).join('\n')
  throw new Error(f.length + ' step(s) failed:\n' + lines)
})
