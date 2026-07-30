import { test as base, expect } from '@playwright/test'
import type { BrowserContext, Page, Locator } from '@playwright/test'

export { expect }

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
export const test = process.env.BOARD_ONE_WINDOW
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

// checkReq / coverReqs — how a test PROVES a requirement (R4/R5). A test tags the requirement ids it
// covers (qualified, e.g. `asset-plan:R5`, so a flow can prove another screen's requirement) and
// asserts each on something that would fail without it. `checkReq(id, fn)` runs one such assertion
// inside a `proves <id>` step — the step's pass/fail IS the requirement's proof, and it doubles as
// human-readable evidence. `coverReqs(...)` declares the full set a flow intends to reach, so a flow
// that stops early leaves the ones it never got to honestly NOT-REACHED (not green, not red) rather
// than silently absent. The reporter reads the steps and the annotation back out (tools/coverage.mjs).
export async function checkReq (id: string, fn: () => Promise<void> | void): Promise<void> {
  await test.step('proves ' + id, async () => { await fn() })
}
export function coverReqs (...ids: string[]): void {
  test.info().annotations.push({ type: 'covers', description: ids.join(' ') })
}
