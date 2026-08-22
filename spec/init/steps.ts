import { expect } from '../_base'
import type { Page } from '@playwright/test'
import type { FlowState } from '../board/steps'
import { writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeDocumentScreen, treeShape } from '../_fixture'
import { build } from '../../tools/build-board.mjs'

// The Init screen's composable beats (the beat-function convention — see spec/board/steps.ts for
// the contract; Task 7, 2026-08-22). Both beats are the unit tests in ./test.spec.ts lifted
// VERBATIM into callables — the same assertions, now each inside its own checkReq — so the
// composer can chain "a crawled row becomes a card" across into the board's own beats with no
// model involved. The real crawl (a browser + minutes) stays outside the suite: the fixture seeds
// the inventory the crawl would have written, exactly as the unit tests do.

const SPEC = join(dirname(fileURLToPath(import.meta.url)), '..')
const CRAWL = join(SPEC, '_crawl.json')

// THE FIXTURE: a crawl inventory with one route already on the board ('/board' — a real screen
// with a PRD) and one route new ('/storefront'), then Setup open. The golden numbers every beat
// computes from: the two routes, and the dogfood tree's four screens the home must show.
export const GIVEN = {
  fn: 'openSetupAfterCrawl',
  text: 'Setup open on a crawl that found /board (already a screen) and /storefront (new)',
  gives: ['home', 'setup', 'crawled']
}
export async function openSetupAfterCrawl (page: Page): Promise<FlowState> {
  writeFileSync(CRAWL, JSON.stringify({
    crawledAt: '2026-07-27T10:00:00.000Z',
    routes: [{ route: '/board', title: 'Board' }, { route: '/storefront', title: 'Storefront' }]
  }))
  await page.goto('/#init')
  await expect(page.locator('#initview')).toBeVisible()
  return { ...treeShape(), settled: '/board', fresh: '/storefront' }   // the tree's shape, read off disk (review A2-a)
}

export const BEATS = [
  { fn: 'rerunMarksNewRows', proves: 'R5', name: 'the rerun marks the new route new, the settled one already on the board', needs: ['crawled'], gives: ['rows'] },
  { fn: 'draftedRowBecomesCard', proves: 'R3', name: 'a drafted PRD is one ordinary card — no guess chip, nothing waiting, no gate', needs: ['home'], gives: ['home', 'card'] }
]

// init R5 — rerunning the crawl marks a new route new and leaves a settled row alone: the route
// that already has a real screen reads as already on the board, the other as new.
export async function rerunMarksNewRows (page: Page, state: FlowState): Promise<void> {
  const found = page.locator('#initview #initfound')
  const boardRow = found.locator('.frow', { hasText: state.settled })
  const newRow = found.locator('.frow', { hasText: state.fresh })
  await expect(boardRow).toContainText(/already on board|yours/i)
  await expect(newRow).toContainText(/new/i)
  state.rows = 2
}

// init R3 — a kg-deep pass drafts a PRD on the human's behalf (the crawl itself only inventories
// rows, R2); in the no-guess model (the human, 2026-08-17) that drafted screen is canon at once:
// ONE ordinary card on home, no guess chip, nothing waiting, and a detail with no gate anywhere.
// The fixture screen is removed again at the end — the beat leaves the board exactly as it found
// it (the dogfood tree's own cards), back on home, so a board beat can follow.
export async function draftedRowBecomesCard (page: Page, state: FlowState): Promise<void> {
  const name = makeDocumentScreen('storefront')
  try {
    const cardLoc = page.locator('#home .card[data-screen="' + name + '"]')
    await expect(async () => {
      build()   // re-assert the board each retry — the watcher can stale-overwrite it and never self-correct
      await page.goto('/')
      await expect(cardLoc).toHaveCount(1)
    }).toPass({ timeout: 15000 })
    // a drafted screen is an ordinary card — no guess chip, no waiting marker, and the rest of the
    // card still renders normally (its proven-count chip and requirement titles)
    await expect(cardLoc.locator('.chip', { hasText: /guess/i })).toHaveCount(0)
    expect(await cardLoc.getAttribute('data-waiting')).toBeNull()
    await expect(cardLoc.locator('.pcount')).toHaveCount(1)
    await expect(cardLoc.locator('.rl li')).not.toHaveCount(0)
    await expect(page.locator('#home .card')).toHaveCount(state.screens + 1)   // the tree's own, plus this one

    // the detail carries NOTHING to accept — no gate anywhere (retried: the watcher can briefly
    // rebuild the board stale, without the new screen in its list — see the unit test's note)
    const dt = page.locator('.dt[data-screen="' + name + '"]:not([hidden])')
    await expect(async () => {
      build()
      await page.goto('/#/' + name)
      await expect(dt.locator('.focusov')).toBeVisible()
    }).toPass({ timeout: 15000 })
    await expect(dt.locator('.gate')).toHaveCount(0)                // no acceptance gate (board R8)
    await expect(dt.locator('[data-act="accept"]')).toHaveCount(0)  // nothing to accept
    await expect(dt.locator('[data-gate]')).toHaveCount(0)          // no gate B / draft gate either
    state.card = name
  } finally {
    rmSync(join(SPEC, name), { recursive: true, force: true })
    build()
  }
  // back on home with the fixture gone — the board as the tree alone renders it
  await expect(async () => {
    build()
    await page.goto('/')
    await expect(page.locator('#home .card')).toHaveCount(state.screens)
  }).toPass({ timeout: 15000 })
}
