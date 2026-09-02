import { expect } from '../_base'
import { treeShape } from '../_fixture'
import type { Page } from '@playwright/test'
import type { FlowState } from '../board/steps'

// The dispatch screen's composable beats (the beat-function convention — see spec/board/steps.ts
// for the contract). refreshDerivedInPlace is the cross-screen one the board's own flow proves
// (`dispatch:R7` from spec/board/test.spec.ts): a composed flow that starts on the board can chain
// it, importing from '../dispatch/steps', and its coverReqs tag lands qualified. The three run
// beats (R1 → R2 → R3, Task 7) are the unit test 'R1/R2 — the panel opens on the click…' lifted
// verbatim into callables — the same assertions, now each inside its own checkReq — so the
// composer can chain "run from a cell, watch it stream, the verdict lands in place" with no model.
// ONE COMPOSITION RULE these three carry (Task 7, found while composing): the cell they click is
// the BOARD's, so a flow chaining them must START HERE (spec/dispatch/test.spec.ts), never on the
// board — a flow living in spec/board/test.spec.ts would be re-run by the very nested board run it
// starts, nest again inside that, and hit the nesting bound (the job-slot trap in CLAUDE.md). The
// composer's joint check sees tokens, not recursion; the start screen is the author's call.

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
  return { ...treeShape() }
}

export const BEATS = [
  { fn: 'clickRunOnCell', proves: 'R1', name: 'click Run on the board cell — the panel opens naming the screen, running', needs: ['detail'], gives: ['run-started'], ms: 150000 },   // idleSlot's budget
  { fn: 'watchLogStream', proves: 'R2', name: 'the log streams into the panel before any verdict', needs: ['run-started'], gives: ['streaming'] },
  { fn: 'verdictLandsInPlace', proves: 'R3', name: 'the verdict lands — chip passed or failed, the cell updated, no reload', needs: ['streaming'], gives: ['verdict'], ms: 230000 },   // the nested board run (147 s measured) + the in-place poll
  { fn: 'refreshDerivedInPlace', proves: 'R7', name: 'a finished run refreshes the board in place — no reload', needs: ['detail'], gives: ['refreshed'] },
  { fn: 'noRebuildWhileRunning', proves: 'R7', name: 'a live run rebuilds nothing — the refresh comes once, at the end', needs: ['detail'], gives: ['gated'] }
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
  // NO RELOAD across either refresh, asserted by things a reload destroys (final review M6): a
  // sentinel on the live window must survive, the requirement row must be the SAME DOM node (synced
  // in place, not re-created by a fresh document), and the page must fire no `load` event.
  let loads = 0
  const onLoad = () => { loads++ }
  page.on('load', onLoad)
  await page.evaluate(() => { (window as any).__r7Alive = 1 })

  // (1) "IN PLACE" KEEPS YOUR READING POSITION (the human, 2026-09-02: "keep back to top when running
  // test"). The reader scrolls on its own .fscroll (R2, one card that scrolls inside itself); a
  // refresh rebuilds the reader (close-fold-reopen), and a fresh .fscroll would start at the top — a
  // background run once yanked the reader up on every SSE tick. Proven on a PLAIN refresh, where the
  // content height is unchanged so the restore is exact. (The state-flip refresh in (2) deliberately
  // shrinks R1's reader — a different concern — so the scroll is proven here, not there.)
  // The reader has been beat rows ALONE since 2026-09-02 (no prose, no proof header beneath them), so
  // at the suite's viewport R1's two rows no longer overflow their card. The scroll-keeping is still
  // the thing to prove, so the beat makes the card scroll the honest way — a SHORT window — and hands
  // the viewport back once the position is proven kept. (The precondition below stays: a reader that
  // cannot scroll proves nothing here.)
  const vp = page.viewportSize()
  await page.setViewportSize({ width: vp ? vp.width : 1440, height: 520 })
  const scroller = dt.locator('.focusov .fread > .fscroll')
  const want = await scroller.evaluate((el: HTMLElement) => {
    el.scrollTop = Math.min(200, el.scrollHeight - el.clientHeight)
    return el.scrollTop
  })
  expect(want, 'the board R1 reader must be tall enough to scroll for this to prove anything').toBeGreaterThan(20)
  await page.evaluate(() => (window as any).__refreshDerived())      // a plain refresh — same content, same height
  await expect.poll(
    () => dt.locator('.focusov .fread > .fscroll').evaluate((el: HTMLElement) => el.scrollTop),
    { message: 'the reader keeps your reading position across an in-place refresh' }
  ).toBeGreaterThan(want - 8)
  if (vp) await page.setViewportSize(vp)                              // the window back, position proven

  // (2) THE BOARD SYNCS IN PLACE — no reload. Flip R1's derived state in a served board and prove the
  // reader picks it up without a reload.
  const before = await dt.locator('.reqpane .req[data-r="R1"]').getAttribute('data-state')
  const flipped = before === 'proven' ? 'unproven' : 'proven'
  await page.route('**/board.html', async route => {
    const real = await (await route.fetch()).text()
    await route.fulfill({ contentType: 'text/html',
      body: real.split('data-r="R1" data-state="' + before + '"').join('data-r="R1" data-state="' + flipped + '"') })
  })
  const row = await dt.locator('.reqpane .req[data-r="R1"]').elementHandle()
  await page.evaluate(() => (window as any).__refreshDerived())      // the SSE run-done/change path calls this
  await expect(dt.locator('.reqpane .req[data-r="R1"]')).toHaveAttribute('data-state', flipped)  // synced in place
  expect(await page.evaluate(() => (window as any).__r7Alive), 'no reload — the window sentinel survives').toBe(1)
  expect(await row!.evaluate(el => el.isConnected && el.getAttribute('data-state')), 'the SAME row node, updated in place').toBe(flipped)
  expect(loads, 'no load event across either refresh — the open panel would survive').toBe(0)
  page.off('load', onLoad)
  await page.unroute('**/board.html')
  state.refreshed = flipped
}

// dispatch R7 — "the board behind it refreshes in place" is ONE refresh, at the END. While a run is
// LIVE the board must rebuild NOTHING (the human, 2026-09-02: "run all in background" reloaded the
// page over and over). Every assertion the harvest writes fires a file-change event, so each burst
// used to debounce into a rebuild — with a reader open that is a visible reload every few seconds,
// and with none it was `location.reload()`. Driven through the SSE seam (`window.__live`), because
// the change LISTENER is held back under automation (a self-reload aborts a Playwright navigation):
// the seam calls the very handlers the server's events call, so this drives the real gate.
export async function noRebuildWhileRunning (page: Page, state: FlowState): Promise<void> {
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  await expect(dt.locator('.focusov')).toBeVisible()
  await expect(page.locator('#runpanel')).toBeHidden()      // the background case: nobody opened the panel
  let loads = 0
  const onLoad = () => { loads++ }
  page.on('load', onLoad)
  // a sentinel on the OPEN READER NODE: a refresh is close-fold-reopen, so the node it survives on
  // cannot survive a rebuild — the honest witness that nothing was rebuilt
  await dt.locator('.focusov').evaluate((el: any) => { el.__aliveGate = 1 })
  // …resolved as false when the overlay is missing entirely (mid-rebuild it briefly is): "the node I
  // marked is gone" is exactly what a rebuild means, and a throw there would read as a test error
  const alive = () => dt.locator('.focusov').evaluate((el: any) => el.__aliveGate === 1).catch(() => false)
  expect(await alive(), 'the sentinel is on the reader that is open now').toBe(true)

  // A RUN GOES LIVE, then the harvest's writes arrive as a burst of change events
  await page.evaluate(() => (window as any).__live.run({ state: 'started', screen: 'board' }))
  expect(await page.evaluate(() => (window as any).__live.live()), 'the board knows a run is live').toBe(true)
  await page.evaluate(() => { for (let i = 0; i < 8; i++) (window as any).__live.change() })
  await page.waitForTimeout(2200)     // well past the 800ms debounce a burst used to fire
  expect(await alive(), 'a live run rebuilds nothing — the open reader survives every change').toBe(true)
  expect(loads, 'and the page never reloads itself mid-run').toBe(0)

  // …AND THE RUN FINISHING OPENS THE GATE: the rebuild's change event lands the ONE refresh, in
  // place (a reader is open), so the board is current the moment the run is over — never stale.
  // (the flag is NOT re-read here: the done handler's loadRuns re-seeds it from the SERVER, and when
  // the board is running this very spec the server honestly still has a run in flight. The observable
  // outcome is what matters and is asserted instead — the reader is refreshed once the run is over.)
  await page.evaluate(() => (window as any).__live.run({ state: 'done', ok: true, total: 1, failed: 0, ms: 1000 }))
  await page.evaluate(() => (window as any).__live.change())
  await expect.poll(alive, { timeout: 15000, message: 'the finished run refreshes the reader in place' }).toBe(false)
  expect(loads, 'and it is a refresh, never a reload').toBe(0)
  page.off('load', onLoad)
  state.gated = true
}
