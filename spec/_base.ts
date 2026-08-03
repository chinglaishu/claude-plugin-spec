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
  page: async ({ page }, use) => {
    CURRENT_PAGE = page
    try { await use(page) } finally { CURRENT_PAGE = null }
  }
})

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
const HUD = { head: '', detail: '' }
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
async function paintHud (s: { head?: string, detail?: string, failed?: boolean }): Promise<void> {
  const page = CURRENT_PAGE
  if (!page) return
  repaintOnNav(page)
  if (s.head !== undefined) { HUD.head = s.head; HUD.detail = '' }
  if (s.detail !== undefined) HUD.detail = s.detail
  await page.evaluate(({ head, detail, failed }) => {
    let el = document.getElementById('__specboard-hud')
    if (!el) {
      el = document.createElement('div')
      el.id = '__specboard-hud'
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;pointer-events:none;' +
        'display:flex;align-items:baseline;gap:14px;padding:9px 16px;' +
        'font:600 14px/1.45 system-ui,sans-serif;color:#f4f1ea;background:rgba(28,27,24,.92);' +
        'box-shadow:0 1px 8px rgba(0,0,0,.25)'
      const h = document.createElement('span')
      h.id = '__specboard-hud-head'
      const d = document.createElement('span')
      d.id = '__specboard-hud-detail'
      d.style.cssText = 'font-weight:400;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
      el.append(h, d)
      document.body.appendChild(el)
    }
    el.style.background = failed ? 'rgba(122,47,29,.95)' : 'rgba(28,27,24,.92)'
    const hd = document.getElementById('__specboard-hud-head')
    const dt = document.getElementById('__specboard-hud-detail')
    if (hd) hd.textContent = head
    if (dt) dt.textContent = detail
  }, { head: HUD.head, detail: HUD.detail, failed: !!s.failed }).catch(() => {})
}

// Announce the expected vs actual values of the current check on the topbar — the video then shows
// not just WHAT is being proven but the numbers it is proven with (board R10).
export async function hudCheck (label: string, expected: unknown, actual: unknown): Promise<void> {
  await paintHud({ detail: String(label) + ' — expected ' + String(expected) + ' · actual ' + String(actual) })
}
// Freeform variant, for a sentence the author wants on the bar.
export async function hudNote (text: string): Promise<void> {
  await paintHud({ detail: String(text) })
}

// checkReq / coverReqs — how a test PROVES a requirement (R4/R5). A test tags the requirement ids it
// covers (qualified, e.g. `asset-plan:R5`, so a flow can prove another screen's requirement) and
// asserts each on something that would fail without it. `checkReq(id, fn)` runs one such assertion
// inside a `proves <id>` step — the step's pass/fail IS the requirement's proof, and it doubles as
// human-readable evidence. `coverReqs(...)` declares the full set a flow intends to reach, so a flow
// that stops early leaves the ones it never got to honestly NOT-REACHED (not green, not red) rather
// than silently absent. The reporter reads the steps and the annotation back out (tools/coverage.mjs).
export async function checkReq (id: string, fn: () => Promise<void> | void): Promise<void> {
  // the step NAME stays exactly `proves <id>` — tools/coverage.mjs derives requirement state from
  // it; the human words go on the HUD (and the board maps the id back to its title on its side)
  const title = reqTitle(id)
  await test.step('proves ' + id, async () => {
    await paintHud({ head: 'proving ' + id + (title ? ' — ' + title : '') })
    try {
      await fn()
    } catch (err) {
      // the viewer must SEE where it went red: repaint (keeping the expected/actual that failed)
      // and hold a beat so the recorder catches the frame before the page is torn down
      await paintHud({ head: '✗ failed — ' + id + (title ? ' · ' + title : ''), detail: HUD.detail, failed: true })
      if (CURRENT_PAGE) await CURRENT_PAGE.waitForTimeout(500).catch(() => {})
      throw err
    }
    await paintHud({ head: '✓ ' + id + (title ? ' — ' + title : '') })
  })
}
export function coverReqs (...ids: string[]): void {
  test.info().annotations.push({ type: 'covers', description: ids.join(' ') })
}
