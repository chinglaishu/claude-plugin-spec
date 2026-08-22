import { expect } from '../_base'
import type { Page } from '@playwright/test'
import type { FlowState } from '../board/steps'

// The dispatch screen's composable beats (the beat-function convention — see spec/board/steps.ts
// for the contract). refreshDerivedInPlace is the cross-screen one the board's own flow proves
// (`dispatch:R7` from spec/board/test.spec.ts): a composed flow that starts on the board can chain
// it, importing from '../dispatch/steps', and its coverReqs tag lands qualified. The three run
// beats (R1 → R2 → R3, Task 7) are the unit test 'R1/R2 — the panel opens on the click…' lifted
// verbatim into callables — the same assertions, now each inside its own checkReq — so the
// composer can chain "run from a cell, watch it stream, the verdict lands in place" with no model.

// The run this very process IS, when the BOARD started it (see test.spec.ts): a Run clicked from a
// page that does not name its parent is refused by the very run executing this beat (R4), so the
// board is always opened AS the run driving it. Empty for a plain CLI run — then the URL is bare.
const SELF_RUN = (process.env.BOARD_RECORD || '').replace(/\/+$/, '').split('/').pop() || ''
const BOARD = SELF_RUN ? '/?runid=' + SELF_RUN + '#/board' : '/#/board'
// one of the board's OWN test titles (kept in sync with spec/board/test.spec.ts) — the case whose
// cell the nested run updates in place (R3)
const B_R1 = 'Home lists every screen as a card'

// nothing else holds the slot (the run this process IS never counts as "in the way")
export async function idleSlot (page: Page): Promise<void> {
  await expect.poll(async () => {
    const j = await page.request.get('/api/runs').then(r => r.json())
    return j.running === null || (SELF_RUN && j.runningId === SELF_RUN) ? null : j.running
  }, { timeout: 150000 }).toBeNull()
}

// THE FIXTURE: the board's own detail, open on the Focus default with the boot fold settled — the
// state a run's refresh acts on. Opened as the run driving it (BOARD), so a beat may click Run.
export const GIVEN = {
  fn: 'openBoardDetail',
  text: 'the board\'s own detail open on Focus, the boot fold settled',
  gives: ['home', 'detail']
}
export async function openBoardDetail (page: Page): Promise<FlowState> {
  await page.goto(BOARD)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  await expect(dt.locator('.focusov')).toBeVisible()
  await expect(dt.locator('.test .tmeta').first()).not.toBeEmpty()
  return { screens: 4, areas: 3 }
}

export const BEATS = [
  { fn: 'clickRunOnCell', proves: 'R1', name: 'click Run on the board cell — the panel opens naming the screen, running', needs: ['detail'], gives: ['run-started'] },
  { fn: 'watchLogStream', proves: 'R2', name: 'the log streams into the panel before any verdict', needs: ['run-started'], gives: ['streaming'] },
  { fn: 'verdictLandsInPlace', proves: 'R3', name: 'the verdict lands — chip passed or failed, the cell updated, no reload', needs: ['streaming'], gives: ['verdict'] },
  { fn: 'refreshDerivedInPlace', proves: 'R7', name: 'a finished run refreshes the board in place — no reload', needs: ['detail'], gives: ['refreshed'] }
]

// dispatch R1 — opened BY the control you clicked, and it already knows its screen: nothing is
// typed. Waits for a free slot first (a second job would take over the first — R4). Remembers the
// moment and the B_R1 cell's newest folded record so R3 can prove the cell moved in place.
export async function clickRunOnCell (page: Page, state: FlowState): Promise<void> {
  await idleSlot(page)
  if (!page.url().includes('#/board') || (SELF_RUN && !page.url().includes('runid='))) await page.goto(BOARD)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  await expect(dt.locator('.test .tmeta').first()).not.toBeEmpty()   // the boot fold is done — a baseline to move from
  state.cellBefore = await dt.locator('.tststeps[data-title="' + B_R1 + '"]').evaluate((el: any) => (el._hist && el._hist[0] && el._hist[0].at) || '')
  await page.evaluate(() => { (window as any).__r3Alive = 1 })       // the no-reload sentinel R3 reads back
  await expect(page.locator('#runpanel')).toBeHidden()
  await page.locator('.dt[data-i="0"] .runbtn').first().click()
  const panel = page.locator('#runpanel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('#rptitle')).toContainText('board')
  await expect(panel.locator('#rpchip')).toContainText('running')
  state.runScreen = 'board'
}

// dispatch R2 — the work is visible while it runs. A button that goes quiet for two minutes gets
// clicked again, and the second run fights the first — so real output has to be seen arriving,
// while the chip still reads running.
export async function watchLogStream (page: Page, state: FlowState): Promise<void> {
  const panel = page.locator('#runpanel')
  await expect(panel.locator('#rplog')).toContainText(/Running|passed|test/i, { timeout: 60000 })
  await expect(panel.locator('#rpchip')).toContainText('running')   // lines arrived BEFORE any verdict
  state.streamed = true
}

// dispatch R3 — finishing updates the panel in place and reports the real result, with the page
// never reloaded: the sentinel R1 planted survives, and the B_R1 cell now carries a NEWER folded
// record than the one it had before the click — the cell changed state in place. The wall clock
// follows the board file's real size under the watched pace (147 s measured 2026-08-22).
export async function verdictLandsInPlace (page: Page, state: FlowState): Promise<void> {
  const panel = page.locator('#runpanel')
  await expect(panel.locator('#rpchip')).toContainText(/passed|failed/, { timeout: 200000 })
  expect(await page.evaluate(() => (window as any).__r3Alive), 'no reload — the window sentinel survives').toBe(1)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  await expect.poll(() => dt.locator('.tststeps[data-title="' + B_R1 + '"]').evaluate((el: any) => (el._hist && el._hist[0] && el._hist[0].at) || ''),
    { timeout: 30000 }).not.toBe(state.cellBefore)
  const after = await dt.locator('.tststeps[data-title="' + B_R1 + '"]').evaluate((el: any) => el._hist[0].at)
  expect(after > state.cellBefore, 'the cell folded a NEWER run in place: ' + after + ' > ' + state.cellBefore).toBe(true)
  state.verdict = (await panel.locator('#rpchip').textContent() || '').trim()
}

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
