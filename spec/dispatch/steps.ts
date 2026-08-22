import { expect } from '../_base'
import type { Page } from '@playwright/test'
import type { FlowState } from '../board/steps'

// The dispatch screen's composable beats (the beat-function convention — see spec/board/steps.ts
// for the contract). The one beat here is the cross-screen one the board's own flow proves
// (`dispatch:R7` from spec/board/test.spec.ts): a composed flow that starts on the board can chain
// it, importing from '../dispatch/steps', and its coverReqs tag lands qualified.

// THE FIXTURE: the board's own detail, open on the Focus default with the boot fold settled — the
// state a run's refresh acts on.
export const GIVEN = {
  fn: 'openBoardDetail',
  text: 'the board\'s own detail open on Focus, the boot fold settled',
  gives: ['home', 'detail']
}
export async function openBoardDetail (page: Page): Promise<FlowState> {
  await page.goto('/#/board')
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  await expect(dt.locator('.focusov')).toBeVisible()
  await expect(dt.locator('.test .tmeta').first()).not.toBeEmpty()
  return { screens: 4, areas: 3 }
}

export const BEATS = [
  { fn: 'refreshDerivedInPlace', proves: 'R7', name: 'a finished run refreshes the board in place — no reload', needs: ['detail'], gives: ['refreshed'] }
]

// dispatch R7 — a finished run keeps the panel open AND refreshes the board's DERIVED state (a
// requirement's proven/unproven) IN PLACE, without a reload. Driven through the exposed seam with a
// served board.html carrying the change a run would produce, so the sync is deterministic.
export async function refreshDerivedInPlace (page: Page, state: FlowState): Promise<void> {
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  await expect(dt.locator('.focusov')).toBeVisible()
  const before = await dt.locator('.reqpane .req[data-r="R1"]').getAttribute('data-state')
  const flipped = before === 'proven' ? 'unproven' : 'proven'
  // serve a board.html where R1's derived state has flipped — exactly what a run's rebuild would change
  await page.route('**/board.html', async route => {
    const real = await (await route.fetch()).text()
    await route.fulfill({ contentType: 'text/html',
      body: real.split('data-r="R1" data-state="' + before + '"').join('data-r="R1" data-state="' + flipped + '"') })
  })
  // NO RELOAD, asserted by things a reload destroys (final review M6 — page.url() survives a
  // location.reload() and the stubbed board carries the flip, so a refresh implemented as a reload
  // passed every old assertion): a sentinel on the live window must still be there afterwards, the
  // requirement row must be the SAME DOM node (synced in place, not re-created by a fresh document),
  // and the page must fire no `load` event while the seam runs.
  let loads = 0
  const onLoad = () => { loads++ }
  page.on('load', onLoad)
  const row = await dt.locator('.reqpane .req[data-r="R1"]').elementHandle()
  await page.evaluate(() => { (window as any).__r7Alive = 1 })
  await page.evaluate(() => (window as any).__refreshDerived())      // the SSE run-done/change path calls this
  await expect(dt.locator('.reqpane .req[data-r="R1"]')).toHaveAttribute('data-state', flipped)  // synced in place
  expect(await page.evaluate(() => (window as any).__r7Alive), 'no reload — the window sentinel survives').toBe(1)
  expect(await row!.evaluate(el => el.isConnected && el.getAttribute('data-state')), 'the SAME row node, updated in place').toBe(flipped)
  expect(loads, 'no load event — the open panel would survive').toBe(0)
  page.off('load', onLoad)
  await page.unroute('**/board.html')
  state.refreshed = flipped
}
