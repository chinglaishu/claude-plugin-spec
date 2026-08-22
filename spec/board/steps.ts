import { expect } from '../_base'
import type { Page } from '@playwright/test'

// THE BEAT-FUNCTION CONVENTION (Task 5; D4 amended 2026-08-21 #2 by the human; CLAUDE.md rule 1's
// addendum). Each exported step function is ONE composable beat: it performs its When, asserts its
// Then with EXACT numbers computed from the threaded `state` object, and updates that state. The
// assertion bodies here are the ones the unit tests in ./test.spec.ts were already proven RED-FIRST
// with — a beat is a proven assertion lifted into a callable, never a new one. The unit test keeps
// its `checkReq(id, () => beat(page, state))` around the call, so the proof's power is unchanged;
// the composer (tools/compose.mjs) chains the same calls, each inside its own checkReq, into a
// composed flow file with NO model involved.
//
// The metadata the composer reads STATICALLY (parseBeats — a light scan, never executing this file):
//   GIVEN — the fixture: fn, text, gives (the joint tokens the fixture provides)
//   BEATS — one entry per exported beat: fn, proves (a bare id = this screen), name, needs, gives
// needs/gives are the JOINT TOKENS: beat N's Then must satisfy beat N+1's Given (D4). A beat that
// needs a token nothing before it gives is a GAP the composer names and refuses to emit across.
//
// A beat NEVER calls checkReq itself — the caller wraps it — so the `proves <id>` step is exactly
// one deep whether the beat runs in its unit home or inside a composed flowStep.

export type FlowState = Record<string, any>

// THE FIXTURE (the Given): this board's own tree is the golden data — specboard dogfoods itself
// (CLAUDE.md), so the four screens and their three areas are the seeded numbers every beat
// computes its Then from. Change the tree and these move WITH the prd.md that moved them.
export const GIVEN = {
  fn: 'openBoardHome',
  text: 'the board home, freshly loaded — specboard\'s own four screens in three areas',
  gives: ['home']
}
export async function openBoardHome (page: Page): Promise<FlowState> {
  await page.goto('/')
  await page.waitForSelector('.card')
  return { screens: 4, areas: 3 }
}

export const BEATS = [
  { fn: 'countHomeCards', proves: 'R1', name: 'count the home cards — one per screen, titles and a cover', needs: ['home'], gives: ['cards'] },
  { fn: 'searchRequirementText', proves: 'R9', name: 'search "canon" — groups that miss hide themselves', needs: ['cards'], gives: ['searched'] },
  { fn: 'openDetailReader', proves: 'R2', name: 'open the board detail — reading and proof side by side', needs: ['home'], gives: ['detail'] },
  { fn: 'toggleViews', proves: 'R13', name: 'toggle Focus / List / Flow — the List is one row per requirement', needs: ['detail'], gives: ['views'] }
]

// R1 — one card per screen, not a row of cells. The count is the fixture's golden screen count.
export async function countHomeCards (page: Page, state: FlowState): Promise<void> {
  const cards = page.locator('#home .card')
  await expect(cards).toHaveCount(state.screens)             // one per screen, not one per requirement
  const first = cards.first()
  await expect(first.locator('.nm')).not.toBeEmpty()        // the screen's name
  await expect(first.locator('.rl li').first()).toBeVisible() // requirement TITLES on the card
  await expect(first.locator('.cshot')).toHaveCount(1)      // the latest recording's cover frame
  // the old PRD/draft/screen/E2E column strip is gone — the card is titles + cover, nothing else
  await expect(page.locator('.cell[data-col], .colhs')).toHaveCount(0)
  state.cards = await cards.count()
}

// R9 — search across requirement text, grouped into areas; a group with nothing matching hides.
export async function searchRequirementText (page: Page, state: FlowState): Promise<void> {
  await expect(page.locator('.grp')).toHaveCount(state.areas)   // Core, Running, Setup
  await expect(page.locator('.grp .grph h2').first()).toHaveText('Core')
  // search matches requirement TEXT, not just the name — 'canon' appears only in the board's own reqs
  await page.locator('#q').fill('canon')
  await expect(page.locator('#home .card:not(.gone)')).toHaveCount(1)
  // a group with nothing matching hides itself rather than sitting empty
  await expect(page.locator('.grp:not(.gone)')).toHaveCount(1)
  await page.locator('#qx').click()
  await expect(page.locator('#home .card:not(.gone)')).toHaveCount(state.cards)
  state.searched = 'canon'
}

// R2 — a requirement and its proof read side by side, each scrolling on its own. Opens the board's
// own detail (the Focus default) and settles the boot fold first: loadRuns close-fold-reopens the
// reader (CLAUDE.md), and a filled .tmeta means the fold is completely done.
export async function openDetailReader (page: Page, state: FlowState): Promise<void> {
  await page.goto('/#/board')
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  await expect(dt.locator('.focusov')).toBeVisible()
  await expect(dt.locator('.test .tmeta').first()).not.toBeEmpty()
  // The two regions are the FOCUS reader's containers (R2, reworked 2026-08-18): the reading on the
  // left, the covering test's proof on the right — each with its OWN overflow, so scrolling the
  // proof never moves the reading…
  const ov = dt.locator('.focusov')
  await expect(ov.locator('.fpage')).toHaveCount(1)
  await expect(ov.locator('.fread')).toBeVisible()
  await expect(ov.locator('.feval')).toBeVisible()
  for (const sel of ['.fread', '.feval']) {
    const oflow = await ov.locator(sel).evaluate(el => getComputedStyle(el).overflowY)
    expect(['auto', 'scroll']).toContain(oflow)
  }
  // …proven with a region that REALLY overflows (final review m8: `.fread.scrollTop === 0` held
  // trivially while `.feval` fit its box): a tall spacer is pushed into the proof region for the
  // check, the scroll must actually move there (> 0), and the reading must not move at all
  await ov.locator('.feval').evaluate(el => { const sp = document.createElement('div'); sp.className = 'r2spacer'; sp.style.cssText = 'flex:none; min-height:4000px'; el.appendChild(sp) })   // flex:none — a flex child with no content would shrink to nothing
  expect(await ov.locator('.feval').evaluate(el => el.scrollHeight > el.clientHeight), 'the proof region overflows').toBe(true)
  await ov.locator('.feval').evaluate(el => { el.scrollTop = 60 })
  expect(await ov.locator('.feval').evaluate(el => el.scrollTop), 'the proof region scrolled').toBeGreaterThan(0)
  expect(await ov.locator('.fread').evaluate(el => el.scrollTop), 'the reading did not move').toBe(0)
  await ov.locator('.feval').evaluate(el => { el.scrollTop = 0; el.querySelector('.r2spacer')?.remove() })
  // …and neither region scrolls the PAGE — the open detail locks the page's own scroll
  expect(await page.evaluate(() => document.documentElement.classList.contains('noscroll'))).toBeTruthy()
  // The dedicated two-column view this requirement used to describe is RETIRED: its panes stay
  // baked as the hidden shared source (R13), and NO view the toggle offers ever shows them.
  const segs = dt.locator('.viewseg .vseg')
  const nseg = await segs.count()
  for (let i = 0; i < nseg; i++) {
    await segs.nth(i).click()
    await expect(dt.locator('.cols')).toBeHidden()
  }
  await dt.locator('.viewseg .vseg[data-view="focus"]').click()   // leave the default view on
  state.reqs = await dt.locator('.reqpane .req').count()        // the exact row count the List must show
}

// R13 — the header toggle offers EXACTLY Focus / List / Flow; Focus is active on open and leads
// with the requirement's id, state and title; the List is one row per requirement (the threaded
// count from the detail the previous beat opened).
export async function toggleViews (page: Page, state: FlowState): Promise<void> {
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  const ov = dt.locator('.focusov')
  await expect(ov).toBeVisible()
  await expect(dt.locator('.viewseg .vseg')).toHaveCount(3)
  await expect(dt.locator('.viewseg .vseg')).toHaveText(['Focus', 'List', 'Flow'])
  await expect(dt.locator('.viewseg .vseg[data-view="columns"]')).toHaveCount(0)
  await expect(dt.locator('.viewseg .vseg[data-view="focus"]')).toHaveClass(/\bon\b/)
  await expect(dt.locator('.cols')).toBeHidden()
  await expect(ov.locator('.fpage')).toHaveCount(1)
  // its id, state and title on the LEFT container
  await expect(ov.locator('.fread .frmeta .fid')).not.toBeEmpty()
  // the chip wears exactly the status its source row derives — compared to the row, not to the
  // list of every legal word (final review m8: that regex failed only on NO state, never the wrong one)
  const fid = (await ov.locator('.fread .frmeta .fid').textContent() || '').trim()
  const rowStatus = await dt.locator('.reqpane .req[data-r="' + fid + '"]').getAttribute('data-status')
  expect(rowStatus, 'the source row carries a derived status').toMatch(/^(passed|failed|not-reached|untested|changed)$/)
  await expect(ov.locator('.fread .frmeta .fchip')).toHaveClass(new RegExp('(^|\\s)' + rowStatus + '(\\s|$)'))
  await expect(ov.locator('.fread .fttl')).not.toBeEmpty()
  // the List: one collapsed row per requirement — exactly as many as the detail carries
  await dt.locator('.viewseg .vseg[data-view="grid"]').click()
  await expect(dt.locator('.gridview')).toBeVisible()
  await expect(dt.locator('.gridview .lst-card')).toHaveCount(state.reqs)
  await dt.locator('.viewseg .vseg[data-view="focus"]').click()   // leave the default view on
  state.views = 3
}
