import { expect } from '../_base'
import { treeShape } from '../_fixture'
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
  return { ...treeShape() }      // read off spec/*/prd.md, never pinned (review A2-a)
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
  // THE MOCKUP'S CARD (Task 8, the frozen mockup 2026-08-17 — board R1): the name is the card's
  // large title with the screen's ROUTE in mono beneath it…
  await expect(first.locator('.croute')).not.toBeEmpty()
  // Task 14 (×0.8 --scale, 2026-08-24): `>= 19` was --t-xl's base literal, so the pin broke the
  // moment the whole ramp scaled (rule 4: the layout moved, the behaviour did not — watched red on
  // the scaled board). Retargeted at the BEHAVIOUR: the title wears the card-title token ITSELF,
  // measured against a probe span resolving var(--t-xl), so the assertion tracks the design
  // system's own value at any scale — and still fails if .nm ever drops to a lesser step.
  const [nmPx, xlPx] = await first.locator('.nm').evaluate(el => {
    const probe = document.createElement('span')
    probe.style.fontSize = 'var(--t-xl)'
    document.body.appendChild(probe)
    const v = [parseFloat(getComputedStyle(el).fontSize), parseFloat(getComputedStyle(probe).fontSize)]
    probe.remove()
    return v
  })
  expect(nmPx, 'the title wears the card-title scale (t-xl)').toBe(xlPx)
  // …every requirement row LEADS with its status mark (hue never alone: ✓ ◈ ✗ ◌ ○ by the five-word
  // vocabulary — the same marks the Focus chip and the List row wear)…
  // (a `.fam` row is a FAMILY header — board R17, structure between the requirement rows, no mark
  // by design — so the requirement rows are the li's that are neither the fold nor a header)
  const rows = first.locator('.rl li:not(.more):not(.fam)')
  await expect(rows.first().locator('.mk')).toHaveText(/^[✓◈✗◌○]$/)
  expect(await first.locator('.rl li:not(.more):not(.fam) .mk').count()).toBe(await rows.count())
  // …the right column carries the proven-count pill AND the unit · flow kind chips (derived from the
  // folded tests: flowStep in the source ∪ a cross-screen tag in the record — the union)…
  await expect(first.locator('.metrics .pcount')).toHaveText(/^\d+ \/ \d+ proven$/)
  await expect(first.locator('.metrics .kinds .kchip')).toHaveText([/^\d+ unit$/, /^\d+ flow$/])
  // …and the thumbnail is the screen's latest-run STILL, captioned with that run — never a grey
  // placeholder where a run has left a still (the board's own screens all have one)
  await expect(first.locator('.cshot img')).toHaveCount(1)
  await expect(first.locator('.cshot .lrun')).toHaveText(/^latest run · \S+$/)
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

// R2 — a requirement and its proof are read TOGETHER, in ONE card whose story scrolls inside it
// (the human's 2026-08-28 redesign: the reader is no longer two containers side by side, it is a
// storyline of per-beat ROWS, and the row is where the words and their proof meet). Opens the
// board's own detail (the Focus default) and settles the boot fold first: loadRuns
// close-fold-reopens the reader (CLAUDE.md), and a filled .tmeta means the fold is completely done.
export async function openDetailReader (page: Page, state: FlowState): Promise<void> {
  await page.goto('/#/board')
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  await expect(dt.locator('.focusov')).toBeVisible()
  await expect(dt.locator('.test .tmeta').first()).not.toBeEmpty()
  // ONE reading card, carrying both ends: the storyline of beat rows and, under them, the proof
  // band that belongs to the whole requirement.
  const ov = dt.locator('.focusov')
  await expect(ov.locator('.fpage')).toHaveCount(1)
  await expect(ov.locator('.fread')).toBeVisible()
  await expect(ov.locator('.fread > .frmeta .fptop')).toBeVisible()   // the covering test, on the title row (2026-09-02)
  // THE ROW IS WHERE THE TWO ENDS MEET (the human, 2026-08-28; reordered 2026-08-30): every beat row
  // lays three cells left to right on ONE line — [ the behaviour's words | the drawn schematic |
  // that beat's own harvested proof ]. The words LEAD, because the human removed the
  // schematic-first / behaviour-first toggle and fixed the story behaviour first (board R21) — the
  // sentence you are being asked to believe, then the two pictures of it. The drawing and the
  // photograph are aimed at the SAME region by the same
  // camera, so comparing them is the point and they must be the same width; the words between them
  // are the caption and take visibly less. A reader that stacked the cells, put the proof somewhere
  // other than beside the words, or let the two visual halves drift apart in width, fails here.
  const geom = await ov.evaluate(el => {
    const row = el.querySelector('.fstory .sbwrap .sbrow')
    if (!row) return null
    const box = (s: string) => {
      const n = row.querySelector(':scope > ' + s) as HTMLElement | null
      if (!n) return null
      const r = n.getBoundingClientRect()
      return { x: r.left, w: r.width, y: Math.round(r.top) }
    }
    return { frame: box('.sbframe'), text: box('.sbtext'), proof: box('.sbproof') }
  })
  expect(geom, 'the reader is a storyline of per-beat rows').not.toBeNull()
  const { frame, text, proof } = geom!
  expect(!!(frame && text && proof), 'a beat row carries behavior · schematic · proof').toBe(true)
  expect(new Set([frame!.y, text!.y, proof!.y]).size, 'the three cells sit on ONE row, not stacked').toBe(1)
  expect(text!.x, 'the words open the row — behaviour first (R21)').toBeLessThan(frame!.x)
  expect(frame!.x, 'the proof closes the row, beside the drawing it mirrors').toBeLessThan(proof!.x)
  expect(Math.abs(frame!.w - proof!.w) / Math.max(frame!.w, proof!.w),
    'the drawing and the proof are the same width — the row is a comparison').toBeLessThan(0.02)
  expect(text!.w, 'the words are the caption between them and take visibly less').toBeLessThan(frame!.w * 0.9)
  // …and the card's STORY REGION scrolls INTERNALLY (Task 12, kept): between the pinned header and
  // the pinned footer, so the first beat is on screen from the first paint. Proven with a region
  // that REALLY overflows (final review m8: a scrollTop === 0 check holds trivially while the
  // region fits its box) — a tall spacer is pushed in, the scroll must actually move (> 0), the
  // card's own header must NOT move with it, and the page must not move at all.
  const oflow = await ov.locator('.fscroll').evaluate(el => getComputedStyle(el).overflowY)
  expect(['auto', 'scroll']).toContain(oflow)
  const headAt = () => ov.locator('.fread > .frmeta').evaluate(el => Math.round(el.getBoundingClientRect().top))
  const headTop = await headAt()
  await ov.locator('.fscroll').evaluate(el => { const sp = document.createElement('div'); sp.className = 'r2spacer'; sp.style.cssText = 'min-height:4000px'; el.appendChild(sp) })
  expect(await ov.locator('.fscroll').evaluate(el => el.scrollHeight > el.clientHeight), 'the story region overflows').toBe(true)
  await ov.locator('.fscroll').evaluate(el => { el.scrollTop = 60 })
  expect(await ov.locator('.fscroll').evaluate(el => el.scrollTop), 'the story region scrolled').toBeGreaterThan(0)
  expect(await headAt(), 'the card header stays pinned while the story scrolls').toBe(headTop)
  expect(await page.evaluate(() => window.scrollY), 'and the page itself never scrolls').toBe(0)
  await ov.locator('.fscroll').evaluate(el => { el.scrollTop = 0; el.querySelector('.r2spacer')?.remove() })
  // …because the open detail locks the page's own scroll
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
