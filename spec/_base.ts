import { test as base, expect } from '@playwright/test'

export { expect }

// One browser window for the WHOLE run, when the board asks to watch it (BOARD_ONE_WINDOW).
//
// Playwright gives each test its own BrowserContext, and in a headed browser a context is a
// window — so a watched run flashed a window open and shut between every test case, which is
// exactly what you do not want when you are trying to follow along. Making the CONTEXT
// worker-scoped keeps one window open for the run; each test still gets its own fresh page (a tab)
// inside it, so per-test isolation is untouched — the only thing shared is the window.
//
// Off by default. A plain `npm run e2e` and the deterministic board runs keep a context per test,
// so nothing about the suite's isolation changes; this only shapes what a person sees while
// watching.
// Playwright forbids re-scoping the built-in `context`, so we make our OWN worker-scoped context
// and give each test a fresh page inside it. `page` keeps its normal per-test scope — only its
// factory changes, from "new context + page" to "new page in the shared window". One window for
// the run, isolation per test.
export const test = process.env.BOARD_ONE_WINDOW
  ? base.extend<{}, { _sharedContext: import('@playwright/test').BrowserContext }>({
      _sharedContext: [async ({ browser }, use) => {
        const context = await browser.newContext()
        await use(context)
        await context.close()
      }, { scope: 'worker' }],
      page: async ({ _sharedContext }, use) => {
        const page = await _sharedContext.newPage()
        await use(page)
        await page.close()
      }
    })
  : base
