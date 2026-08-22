import { test, expect, checkReq, coverReqs, hudCheck, flowStep } from '../_base'
// the board's own composable beats (the beat-function convention, Task 5): the assertion bodies the
// tests below were proven red-first with, lifted into exported step functions so the composer can
// chain them — each test keeps its checkReq AROUND the call, so the proof's power is unchanged
import { openBoardHome, countHomeCards, searchRequirementText, openDetailReader, toggleViews } from './steps'
import { refreshDerivedInPlace } from '../dispatch/steps'
import { treeShape } from '../_fixture'

// The board proves ITSELF — its ten requirements (R1–R10) are the rows on its own board, and each
// test here tags the requirement it covers and asserts something that would fail if that requirement
// were deleted. The redesigned board is two ends only: the requirements (the source of truth) and
// the tests that prove them, with drift computed and no gate (R8). A test that asserted the page
// "loaded" would pass with every requirement removed — a smoke alarm with the battery out.

// Focus is the live default (R13, the human's call 2026-08-13), and the old Columns VIEW is retired
// (2026-08-18) — its two panes stay baked inside the permanently-hidden .cols as the SHARED SOURCE
// Focus and Grid read (Focus MOVES .testpane nodes into its reader). So tests reach a screen's rows
// two ways now: count/text/class reads work on the hidden baked rows directly; anything that needs
// a visible or interactive surface drives Focus or Grid.
const openDetail = async (page) => {
  await page.goto('/#/board')
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  await expect(dt.locator('.focusov')).toBeVisible()
  // settle the boot fold: loadRuns close-fold-reopens the reader (CLAUDE.md), and a view switched
  // mid-fold gets flipped back to Focus by that reopen. The fold fills every case's .tmeta in the
  // same synchronous pass that reopens, so a filled meta line means the fold is completely done.
  // (dt-scoped, not pane-scoped — the reopened reader has borrowed one test node back out.)
  await expect(dt.locator('.test .tmeta').first()).not.toBeEmpty()
}
// the first test in the file — R1's only prover, so it is also the node the default Focus page
// (R1) borrows into its reader, and the title several stubbed-record tests key on
const R1_TITLE = 'Home lists every screen as a card'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.card')
})

test('Home lists every screen as a card', async ({ page }) => {
  await coverReqs('R1')
  // the beat: one card per screen, titles and a cover — the golden count threads from the fixture
  const state = await openBoardHome(page)
  await checkReq('R1', async () => { await countHomeCards(page, state) })
  // the home cover falls back to a still when a run has no video (R10) — keep board's own cover fresh
  await page.screenshot({ path: 'spec/board/screen.png', fullPage: false })
})

test('A requirement and its proof read side by side, each scrolling on its own', async ({ page }) => {
  await coverReqs('R2')
  // the beat opens the detail itself (its When) and asserts the two independently-scrolling regions
  const state = await openBoardHome(page)
  await checkReq('R2', async () => { await openDetailReader(page, state) })
})

test('A requirement expands; a test leads with its flow name', async ({ page }) => {
  await coverReqs('R3')
  await openDetail(page)
  await checkReq('R3', async () => {
    const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
    // The ROW ANATOMY lives on the baked source rows — hidden since the Columns view retired
    // (board R13, 2026-08-18), but load-bearing: Focus moves these very nodes into its reader.
    // Count/text reads work on hidden nodes.
    const req = dt.locator('.reqpane .req').first()
    await expect(req.locator('.rt')).not.toBeEmpty()        // the title always leads the row
    // the READING HIERARCHY: never bare title rows. Each pane's header wears a quiet purpose hint;
    // a requirement row carries a one-line excerpt of its body under the title.
    await expect(dt.locator('.reqpane h2 .s')).not.toBeEmpty()
    await expect(dt.locator('.testpane h2 .s')).not.toBeEmpty()
    await expect(req.locator('.rhint')).not.toBeEmpty()
    // a test leads with a PROMINENT flow title and carries coverage tags — it does not just repeat a
    // requirement's title. (Read the first row still in the pane; the reader borrows R1's test.)
    const t = dt.locator('.testpane .test').first()
    await expect(t.locator('.ttl')).not.toBeEmpty()
    const testTitle = (await t.locator('.ttl').textContent())?.trim()
    const reqTitles = await dt.locator('.reqpane .req .rt').allTextContents()
    expect(reqTitles.map(s => s.trim())).not.toContain(testTitle)
    // a test row carries a meta-line hook under its title (loadRuns fills it from the case's record)
    await expect(t.locator('.tmeta')).toBeAttached()

    // VISIBLY, a requirement reads as its title until opened: the List row (board R13, Grid became
    // List 2026-08-21) leads with the title and does NOT carry the long description; opening the row
    // unfolds the full FORMATTED markdown in place — the row's open body IS the Focus body.
    const bodyFrag = (await req.locator('.body p').count())
      ? (((await req.locator('.body p').first().textContent()) || '').trim().slice(0, 40)) : ''
    const rid = await req.getAttribute('data-r')
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    const row = dt.locator(`.gridview .lst-card[data-r="${rid}"]`)
    await expect(row.locator('.lst-head .lttl')).toBeVisible()
    if (bodyFrag) expect(await row.locator('.lst-head').textContent()).not.toContain(bodyFrag)   // the title, not the description
    await row.locator('.lst-head').click()
    const body = row.locator('.lst-body')
    await expect(body.locator('.fread .fttl')).not.toBeEmpty()
    // Since 1413ac1 (the human, 2026-08-22) EVERY requirement leads with its beats, R1 included:
    // the behavior block heads the open row and the full formatted prose sits one click away
    // behind 'the authored requirement — in full' (a prose-only requirement would show it open).
    // The old branch ("R1 is prose-only") was the wrong side of this break — the PRD moved by
    // the human's hand; the test follows (rule 4).
    await expect(body.locator('.fread .behavior, .fread .fbody p, .fread .fbody ul').first()).toBeVisible()
    const proseT = body.locator('.fread .prose-t')
    if (await proseT.count()) {
      await expect(body.locator('.fread .fbody.fprose')).toBeHidden()        // folded beneath the lead
      await proseT.click()
      await expect(body.locator('.fread .fbody p, .fread .fbody ul').first()).toBeVisible()   // the full text, on demand
    } else {
      await expect(body.locator('.fread .fbody p, .fread .fbody ul').first()).toBeVisible()
    }
  })
})

// Board R10/R3 — the presentation of a case's evidence, proven against a DETERMINISTIC record: the
// live records on disk cannot deterministically contain a failure, so this test stubs /api/runs with
// one passing and one failing case (fixture data through the REAL client pipeline) and asserts how
// the board reads them back. The titles are the real baked rows' — the fixture only supplies records.
// The three named steps the dogfood flowStep test below authors — shared so the mocked run in the
// R10 test can fabricate a record whose beats line up with the baked plan by title.
const STORY_TITLE = 'Story-step evidence renders from the test definition'
const STORY = [
  'Open the board detail — the reader is there',
  'Announce a golden value on the narration bar',
  'Confirm the baked test rows are present'
]

test('Steps read from the definition; a run overlays passed/failed/not-reached, and the video explains itself', async ({ page }) => {
  await coverReqs('R10')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  const t0 = R1_TITLE   // the first test — proves R1 (its node is the one the default reader borrows)
  const titleOf = async (rid: string) =>
    (await page.locator('#reqpane .req[data-r="' + rid + '"] .rt').textContent())!.trim()

  await checkReq('R10', async () => {
    // the recording narrates from INSIDE the page: this very checkReq painted the topbar, naming
    // the requirement by id AND title, and the LATEST check shows as one CLAIM — its label plus
    // expected-vs-got as two values (the full got/expected of every check is recorded as the test's
    // step evidence, checked below on the mocked run, not stacked on the bar).
    const hud = page.locator('#__specboard-hud')
    await expect(hud).toBeVisible()
    await expect(hud).toContainText('R10')
    await expect(hud).toContainText(await titleOf('R10'))
    await hudCheck('first check', 1, 1)
    await hudCheck('second check', 2, 2)
    await expect(hud).toContainText('second check')            // the latest check's label…
    await expect(hud).toContainText('expected 2 · got 2')      // …and its expected-vs-got claim

    // (1) STEPS COME FROM THE DEFINITION — with NO run at all, the full plan still shows, pending.
    // The rows live in the hidden baked pane now (Columns retired) — count/text/class reads work
    // there; the `.test` locators are dt-scoped, not pane-scoped, so a reader-borrowed node matches.
    await page.route('**/api/runs', r => r.fulfill({ json: { watch: false, running: false, runs: [] } }))
    await page.reload()
    const story = dt.locator('.test', { hasText: STORY_TITLE }).first()
    const srows = story.locator('.tststeps .beat')
    await expect(srows).toHaveCount(3)                              // its three flowStep sentences
    await expect(srows.nth(0)).toContainText(STORY[0])
    await expect(srows.nth(0).locator('.bnum')).toHaveText('1')
    await expect(srows).toHaveClass([/pending/, /pending/, /pending/])  // none green, none red
    // a checkReq-only test plans one step per requirement, by TITLE, also before running
    const p0 = dt.locator('.test', { hasText: t0 }).first()
    await expect(p0.locator('.tststeps .beat')).toContainText(await titleOf('R1'))
    await expect(p0.locator('.tststeps .beat.pending')).toHaveCount(1)

    // (2) A RUN OVERLAYS its outcome — and because the flow RUNS THROUGH every step, MULTIPLE
    // failures show, not just the first. This mock ran all three steps: 1 passed, 2 AND 3 failed.
    const rec = [
      { label: STORY[0], cat: 'test.step', depth: 0, ok: true, t: 0, d: 800 },
      { label: 'proves R10', cat: 'test.step', depth: 1, ok: true, t: 100, d: 50 },
      { label: 'Unit 01-02 · Net Rent 40,000 → 60,000', cat: 'info', depth: 1, ok: true, t: 150, d: 5 },
      { label: STORY[1], cat: 'test.step', depth: 0, ok: false, t: 800, d: 500 },
      { label: 'IY2 — got 2338064 · expected 2396129', cat: 'info', depth: 1, ok: false, t: 900, d: 5 },
      { label: 'Check the result is what we expect', cat: 'expect', depth: 1, ok: false, t: 950, d: 5 },
      { label: STORY[2], cat: 'test.step', depth: 0, ok: false, t: 1400, d: 300 },
      { label: 'Check the test rows are present', cat: 'expect', depth: 1, ok: false, t: 1500, d: 5 }
    ]
    const caseRec = {
      shots: [], video: 'spec/_runs/rt/a.webm', steps: rec, log: 'x',
      at: '2026-08-03T00:00:00.000Z', ms: 6000, ok: false, commit: 'abc1234'
    }
    // the same record rides BOTH titles: the story test's plan proves the overlay below, and R1's
    // own test — the node the default reader embeds — gives the reader's wired Steps button and
    // player a record to open (the visible path, now that the source rows live hidden)
    await page.route('**/api/runs', r => r.fulfill({ json: {
      watch: false, running: false,
      runs: [{ screen: 'board', runId: 'rt', hasLog: false, at: '2026-08-03T00:00:00.000Z', ms: 6000,
        ok: false, total: 1, failed: 1, shotsByTest: { [STORY_TITLE]: caseRec, [t0]: caseRec } }]
    } }))
    await page.reload()
    const s2 = dt.locator('.test', { hasText: STORY_TITLE }).first()
    const rows = s2.locator('.tststeps .beat')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toHaveClass(/\bp\b/)                  // step 1 passed
    await expect(rows.nth(1)).toHaveClass(/\bf\b/)                  // step 2 failed — and shown
    await expect(rows.nth(2)).toHaveClass(/\bf\b/)                  // step 3 ALSO failed — not hidden
    // the meta line SHOUTS the count, not just the first failure
    await expect(s2.locator('.tmeta')).toContainText('2 steps failed')
    // both failed steps' details are rendered OPEN to their failing value; the passing step's detail
    // is rendered too (revealed on click when the row is shown) — all of it readable off the row
    await expect(rows.nth(1).locator('.bdet .bnote')).toContainText('got 2338064 · expected 2396129')
    await expect(rows.nth(2).locator('.bdet .braw')).toContainText('test rows')
    await expect(rows.nth(0).locator('.bdet .bnote')).toContainText('Net Rent 40,000 → 60,000')
    await expect(rows.nth(0).locator('.bdet .bprove')).toContainText(await titleOf('R10'))

    // the complete raw record opens in the Steps WINDOW — reached the way a person reaches it now:
    // the reader's ⋯ menu carries the covering test's own wired Steps button (R13). Settle the fold,
    // then FORCE R1 into a media-bearing status (the dogfood lag makes the live word nondeterministic
    // mid-suite) and rebuild the reader, so the media pane's video panel holds the relocated
    // recording — the same wired .rec node, moved in (R13 media, the frozen mockup).
    const ov = dt.locator('.focusov')
    await expect(dt.locator('.test .tmeta').first()).not.toBeEmpty()
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => el.setAttribute('data-status', 'passed'))
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    await expect(ov.locator('.fmpanel[data-m="video"] .rec.playable')).toBeAttached()
    await ov.locator('.feval .fmenubtn').click()
    await ov.locator('.feval .fmenupop [data-steps]').click()
    const sheet = page.locator('#stepsheet')
    await expect(sheet).toHaveClass(/on/)
    await expect(sheet).toContainText('Check the result is what we expect')   // raw check, marked
    const full = await sheet.locator('.box').evaluate(el => {
      const r = el.getBoundingClientRect()
      return r.width >= innerWidth - 1 && r.height >= innerHeight - 1
    })
    expect(full).toBeFalsy()
    await sheet.locator('[data-stepsclose]').click()

    // the player never CROPS the frame: the narration topbar is burned into the video's top edge,
    // and an object-fit that fills-and-crops (cover) sliced exactly that edge off in display.
    // Switch the toolbar to video (frames is the D2 default) and play the relocated recording —
    // the same wired .rec node, moved into the media pane's video panel (R13).
    await ov.locator('.fmedia .medbar button[data-m="video"]').click()
    await ov.locator('.fmpanel[data-m="video"] .rec').click()
    const fit = await ov.locator('.fmpanel[data-m="video"] .rec video').evaluate(el => getComputedStyle(el).objectFit)
    expect(fit).toBe('contain')
    await page.evaluate(() => localStorage.removeItem('sbFocusMedia'))

    // the bar SURVIVES a navigation — a beat that walks to another page keeps its narration
    await page.reload()
    await expect(page.locator('#__specboard-hud')).toBeVisible()
    await expect(page.locator('#__specboard-hud')).toContainText('R10')
  })
})

// A real flowStep-authored test, so the suite exercises flowStep end to end and the board has a
// genuine numbered-story record to render. flowStep titles must be STRING LITERALS (the board reads
// them from the source to show the plan before a run) — these three must stay equal to STORY above.
test('Story-step evidence renders from the test definition', async ({ page }) => {
  await coverReqs('R10')
  await flowStep('Open the board detail — the reader is there', async () => {
    await page.goto('/#/board')
    await checkReq('R10', async () => {
      await expect(page.locator('.dt[data-screen="board"]:not([hidden]) .focusov')).toBeVisible()
    })
  })
  await flowStep('Announce a golden value on the narration bar', async () => {
    await hudCheck('cards on the home board', 4, await page.locator('#home .card').count())
  })
  await flowStep('Confirm the baked test rows are present', async () => {
    // the source pane is hidden (the Columns view is retired) but its rows are the board's shared
    // data source — a count that fails the moment they stop being baked
    expect(await page.locator('#testpane .test').count()).toBeGreaterThan(0)
  })
})

test('R10 — the player plays the VOICED recording when a run produced one', async ({ page }) => {
  // Voice-over (init R6): a voiced run's record carries BOTH the silent video and a voiced mp4, and
  // the player must play the voiced one. Deterministic through the REAL client pipeline via a stubbed
  // /api/runs — a real voiced run needs piper, which the suite cannot assume (board R10 rule 3).
  await coverReqs('R10')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  await checkReq('R10', async () => {
    await page.route('**/api/runs', r => r.fulfill({ json: {
      watch: false, running: false,
      runs: [{ screen: 'board', runId: 'rv', hasLog: false, at: '2026-08-14T00:00:00.000Z', ms: 4000,
        ok: true, total: 1, failed: 0, shotsByTest: { [R1_TITLE]: {
          shots: [], video: 'spec/_runs/rv/a.webm', voiced: 'spec/_runs/rv/a.voiced.mp4',
          steps: [{ label: 'proves R1', cat: 'test.step', depth: 0, ok: true, t: 0, d: 100 }],
          at: '2026-08-14T00:00:00.000Z', ms: 4000, ok: true, commit: 'abc1234'
        } } }]
    } }))
    await page.reload()
    // the reload reopens the detail on the Focus default — R1's page, whose evidence is R1's own
    // covering test moved in with its WIRED player (R13); the fold hands it the stubbed record and
    // the media pane's video panel holds the now-playable recording. Force a media-bearing status
    // first (dogfood lag) and rebuild the reader, then switch the toolbar to video.
    await expect(dt.locator('.test .tmeta').first()).not.toBeEmpty()
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => el.setAttribute('data-status', 'passed'))
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    const rec = dt.locator('.focusov .fmpanel[data-m="video"] .rec')
    await expect(rec).toBeAttached()
    await dt.locator('.focusov .fmedia .medbar button[data-m="video"]').click()
    await expect(rec).toBeVisible()
    await rec.click()
    // the VOICED cut is what plays — the same record's silent a.webm would play without init R6
    const src = await rec.locator('video').getAttribute('src')
    expect(src).toContain('a.voiced.mp4')
    expect(src).not.toContain('a.webm')
  })
})

test('Requirement state is computed and assertion-backed', async ({ page }) => {
  await coverReqs('R4')
  await openDetail(page)
  await checkReq('R4', async () => {
    const reqs = page.locator('#reqpane .req')
    const total = await reqs.count()
    expect(total).toBeGreaterThan(0)
    // There is no acceptance gate (R8), so there is no "changed since accepted" state at all —
    // never a reworded chip, never a blank cell.
    await expect(page.locator('#reqpane .req[data-state="reworded"]')).toHaveCount(0)
    // Every requirement carries a COMPUTED state, one of exactly two: proven or unproven.
    await expect(page.locator('#reqpane .req[data-state="proven"], #reqpane .req[data-state="unproven"]'))
      .toHaveCount(total)

    // The chip's word is the FIVE-word vocabulary now (board R4, amended 2026-08-19, the human's
    // decision): Passed / Failed / Untested / Not reached / **Changed** — deriveReqStatus's fail-wins
    // fold (tools/coverage.mjs) plus the spec-store Changed layer (a proven requirement whose text
    // moved past its proof), never the old binary "proven"/"unproven" wording, and never typed in.
    const chipTitles = await page.locator('.dt[data-screen] .reqpane .req .h > .chip')
      .evaluateAll(els => els.map(el => el.getAttribute('title') || ''))
    expect(chipTitles.length).toBeGreaterThan(0)
    for (const t of chipTitles) expect(t).toMatch(/^(Passed|Failed|Untested|Not reached|Changed)\b/)

    // …and that state is COMPUTED and ASSERTION-BACKED, never typed. Two things follow, and both are
    // checked board-wide (every screen's detail is baked into this document):
    //   (a) ONE derivation, rendered twice — the home card's "N / M proven" count must equal the
    //       number of proven rows in that screen's own detail. A typed-in state drifts between them.
    //   (b) green is TAGGED green — a requirement reads proven only where a test tags it. Stamp the
    //       states in regardless of the tests and the requirements no test tags (conflicts has four)
    //       would read proven, and this fails.
    //
    // Corrected 2026-08-05: this used to click every PROVEN row and assert a `.covers .ctag` chip in
    // it. That could never pass — reqRow renders `.covers` for UNPROVEN rows only (a proven row
    // deliberately names no tests, since the E2E column already shows the flow), and `.ctag` has a
    // CSS rule but no producer anywhere. It went green only while board happened to have ZERO proven
    // requirements — the one-run dogfooding lag — and red on the very next run.
    //   R5's "a requirement lists every test that covers it" is NOT lost with that line: the board
    // serves it in FOCUS — opening a requirement resolves its covering test by tag onto the proof
    // line — which is what the R5 test above asserts. (It was served by a row-hover wire until the
    // Columns view retired, 2026-08-18; that wire went with the view.) So the many-to-many listing
    // is proven; it is simply proven where it now lives, not in a covers line.
    const surfaces = await page.locator('.dt[data-screen]').evaluateAll(dts => {
      // Widened to qualified ids, 2026-08-21 — the day the old comment below predicted arrived
      // long ago: `dispatch:R7` is proven by THIS spec's qualified cross-screen tag, which a
      // per-pane harvest cannot see (testRow strips the qualifier to a bare data-r="R7" display in
      // BOARD's pane; dispatch's own pane carries no chip at all). Whenever the committed fold was
      // CURRENT — ranAt newer than spec/board's source mtimes, i.e. exactly the settled state after
      // a fold commit — dispatch R7 read proven-without-a-local-tag and this walk false-positived
      // board:R4=fail (instance 2 of the walk flake; instance 1 was the reader-borrow, 1e17454).
      // Every "clean" run had simply been made with board sources EDITED after the fold, staling
      // the dispatch:R7 proof mid-run (spec-store: ranAt < srcMs(screen)) so the row honestly read
      // unproven — not a race, an edit-then-fold cadence artifact. Fix per the old comment's own
      // prescription: each chip now carries its ORIGINAL id in data-q (build-board testRow), and
      // tagged(X) = { data-r of chips in X's own dt } ∪ { rid | ANY dt has a chip with
      // data-q === X+':'+rid }. Assertion power UNCHANGED (rule 4 — the walk was wrong, the board
      // honest): a genuinely untagged-proven requirement still has no chip ANYWHERE whose exact
      // qualified data-q claims it, so it is still caught; the union admits only ids a real tag
      // chip claims for that screen.
      //   Closed same day (review m1): the LOCAL term admits a chip only when its data-q is
      // colon-free (genuinely bare, or a legacy chip with no data-q at all). A STRIPPED qualified
      // chip — board's data-r="R7" data-q="dispatch:R7" — must satisfy dispatch via the union,
      // never the tagging screen's OWN R7 via its bare data-r display: that was the "tagging
      // screen falsely satisfies its own check" direction the pre-widening comment said must be
      // fixed together. board:R7 is genuinely checkReq'd today, so this tightens power with no
      // behavior change on the current tree.
      const cross = {}      // screen -> Set of rids any chip anywhere tags with a qualified id
      for (const dt of dts) {
        for (const el of dt.querySelectorAll('.test .tags .tag[data-q]')) {
          const q = el.getAttribute('data-q') || ''
          const i = q.indexOf(':')
          if (i > 0) (cross[q.slice(0, i)] ||= new Set()).add(q.slice(i + 1))
        }
      }
      return dts.map(dt => {
        const scr = dt.getAttribute('data-screen')
        const rows = [...dt.querySelectorAll('.reqpane .req')]
        // Harvest tags from .test NODES, not from .testpane: the Focus reader (default view, eager
        // since R13) BORROWS the primary covering test's node out of the pane, so a pane-scoped
        // harvest intermittently missed that test's tags — its uniquely-tagged reqs then read
        // "proven without a test tagging it" as a FALSE positive (the exact CLAUDE.md loadRuns-window
        // symptom; bit ~half of full-suite folds, 2026-08-20). Only a real test node carries
        // `.tags .tag[data-r]`, wherever it is currently parked (pane or reader), so the assertion
        // keeps its full power: an untagged-proven requirement is still caught.
        const tagged = new Set([...dt.querySelectorAll('.test .tags .tag[data-r]')]
          .filter(el => !(el.getAttribute('data-q') || '').includes(':'))   // bare only — see m1 note above
          .map(el => el.getAttribute('data-r')))
        for (const rid of (cross[scr] || [])) tagged.add(rid)
        const card = document.querySelector('#home .card[data-screen="' + scr + '"] .pcount')
        return {
          screen: scr,
          card: (card && card.textContent || '').trim(),
          proven: rows.filter(r => r.getAttribute('data-state') === 'proven').length,
          // a proven requirement no test anywhere tags — local bare tags and board-wide qualified
          // data-q tags both count (widened 2026-08-21, see above)
          untaggedProven: rows
            .filter(r => r.getAttribute('data-state') === 'proven' && !tagged.has(r.getAttribute('data-r')))
            .map(r => r.getAttribute('data-r'))
        }
      })
    })
    expect(surfaces.length).toBeGreaterThan(0)
    for (const s of surfaces) {
      expect(s.card, s.screen + ' — the card must state its proven count').toMatch(/^\d+ \/ \d+ proven$/)
      expect(Number(s.card.split(' ')[0]), s.screen + ' — card count vs detail rows').toBe(s.proven)
      expect(s.untaggedProven, s.screen + ' — proven without a test tagging it').toEqual([])
    }
    // the honest no-coverage line rides the baked row's body (read hidden — the same honesty shows
    // on the visible surfaces: the List's proof cell and Focus's "The proof"). Asserted from BOTH
    // sides so a fully-green tree cannot make it vacuous (final review m8): every unproven row
    // carries the line, and NO proven row does — the second half bites on every tree.
    const unprovenRows = page.locator('#reqpane .req[data-state="unproven"]')
    for (let i = 0; i < await unprovenRows.count(); i++) {
      await expect(unprovenRows.nth(i).locator('.covers .nocov')).toContainText('no test asserts this yet')
    }
    // (board-wide, every screen's baked pane: a source edit stales one screen's proofs until the
    // next fold — the dogfood lag — but never every screen's at once)
    expect(await page.locator('.dt .reqpane .req[data-state="proven"]').count(), 'some proven rows exist to check').toBeGreaterThan(0)
    await expect(page.locator('.dt .reqpane .req[data-state="proven"] .covers .nocov')).toHaveCount(0)
  })
})

test('A test tags the requirements it covers — and Focus serves that link', async ({ page }) => {
  await coverReqs('R5')
  await openDetail(page)
  await checkReq('R5', async () => {
    const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
    // the link lives in the TEST: it tags the requirement ids it covers (R5) — read off the baked
    // source rows, hidden since the Columns view retired (the reader borrows R1's test, so the
    // first row still in the pane is read; either way the wire below must resolve it)
    const test0 = dt.locator('.testpane .test').first()
    await expect(test0.locator('.tags .tag[data-r]')).not.toHaveCount(0)
    const rid = await test0.locator('.tags .tag[data-r]').first().getAttribute('data-r')
    const flow = ((await test0.locator('.ttl').textContent()) || '').trim()
    // …and the board SERVES the many-to-many wire: open that requirement — in the List an open row
    // IS the Focus body (board R13, 2026-08-21), so the proof line inside it names this very test,
    // resolved BY TAG (break the tag lookup and this fails)
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator(`.gridview .lst-card[data-r="${rid}"] .lst-head`).click()
    const body = dt.locator(`.gridview .lst-card[data-r="${rid}"] .lst-body`)
    await expect(body.locator('.fread .frmeta .fid')).toHaveText(rid!)
    await expect(body.locator('.feval .fpby')).toContainText(flow)
  })
})

test('A requirement names the tests that cover it', async ({ page }) => {
  await coverReqs('R6')
  await openDetail(page)
  await checkReq('R6', async () => {
    // Few, comprehensive: the model lets one test cover several requirements (tags carry the link),
    // and a requirement's detail names the tests that prove it — never a bare "7 of 7 passing".
    // (The rows are read off the hidden baked pane — count/text works there.)
    const tests = page.locator('#testpane .test')
    await expect(tests).not.toHaveCount(0)
    const anyMulti = await page.locator('#testpane .test').evaluateAll(
      els => els.some(el => el.querySelectorAll('.tags .tag[data-r]').length >= 1))
    expect(anyMulti).toBeTruthy()
    // …and "fewer tests" can never buy itself a false green. Green is bought by a TAG plus an
    // assertion, never by a test merely existing on the screen: a screen that HAS tests still shows
    // every requirement none of them tags as unproven. Today conflicts is exactly that case — one
    // test, five requirements — so this is not a vacuous check; a shallow walk that touched
    // everything and tagged nothing would leave those requirements ungreen, which is the point.
    //
    // Corrected 2026-08-05: this used to open the first PROVEN requirement and assert a `.covers`
    // line in it. `.covers` is rendered for UNPROVEN rows only (see the note on R4's test, which
    // also explains why R5's "a requirement lists every test that covers it" survives that removal —
    // Focus's proof line carries it, resolved by tag). The old assertion was unsatisfiable the moment board had a single
    // proven requirement. The per-pane / stripped-qualifier caveat R4's check carried was resolved
    // 2026-08-21: both walks now union qualified data-q tags board-wide (see R4's comment).
    const screens = await page.locator('.dt[data-screen]').evaluateAll(dts => {
      // Union in qualified cross-screen tags via data-q, same as R4's walk (widened together
      // 2026-08-21 — see the comment there for the mechanism and why assertion power is
      // unchanged): dispatch:R7 is proven by THIS spec's qualified tag, invisible per-pane.
      // And like R4's walk (review m1, same day), the LOCAL term below admits only chips whose
      // data-q is colon-free — a stripped qualified chip counts for its target screen via the
      // union, never for the tagging screen's own rid.
      const cross = {}
      for (const dt of dts) {
        for (const el of dt.querySelectorAll('.test .tags .tag[data-q]')) {
          const q = el.getAttribute('data-q') || ''
          const i = q.indexOf(':')
          if (i > 0) (cross[q.slice(0, i)] ||= new Set()).add(q.slice(i + 1))
        }
      }
      return dts.map(dt => {
        const scr = dt.getAttribute('data-screen')
        // .test-scoped, not .testpane-scoped — same reader-borrow false positive as R4's walk (see
        // the comment there; fixed together 2026-08-20). hasTests counts nodes the same way.
        const tagged = new Set([...dt.querySelectorAll('.test .tags .tag[data-r]')]
          .filter(el => !(el.getAttribute('data-q') || '').includes(':'))   // bare only — see m1 note
          .map(el => el.getAttribute('data-r')))
        for (const rid of (cross[scr] || [])) tagged.add(rid)
        const rows = [...dt.querySelectorAll('.reqpane .req')]
        return {
          screen: scr,
          hasTests: dt.querySelectorAll('.test').length > 0,
          untagged: rows.filter(r => !tagged.has(r.getAttribute('data-r'))).length,
          untaggedGreen: rows
            .filter(r => !tagged.has(r.getAttribute('data-r')) && r.getAttribute('data-state') === 'proven')
            .map(r => r.getAttribute('data-r'))
        }
      })
    })
    expect(screens.some(s => s.hasTests && s.untagged > 0)).toBeTruthy()   // the case that makes it real
    for (const s of screens) {
      expect(s.untaggedGreen, s.screen + ' — no test tags these, so none may read proven').toEqual([])
    }
  })
})

test('The detail shows no wireframe or design affordance', async ({ page }) => {
  await coverReqs('R7')
  await openDetail(page)
  await checkReq('R7', async () => {
    const detail = page.locator('.dt[data-screen="board"]:not([hidden])')
    // specboard does not own the design: no design chip, no external-artifact affordance of any kind
    await expect(detail.locator('[data-design], .chip.design')).toHaveCount(0)
    // and nothing is rendered inside the tool — no wireframe/design iframe
    await expect(detail.locator('iframe')).toHaveCount(0)
  })
})

test('No acceptance gate — nothing on the detail waits to be accepted', async ({ page }) => {
  await coverReqs('R8')
  await openDetail(page)
  await checkReq('R8', async () => {
    const detail = page.locator('.dt[data-screen="board"]:not([hidden])')
    // There is NO gate (R8): a requirement is the source of truth the moment it is written, so the
    // detail has no gate bar and no accept button — nothing waits on a rubber-stamp.
    await expect(detail.locator('.gate')).toHaveCount(0)
    await expect(detail.locator('[data-act="accept"]')).toHaveCount(0)
    // nor any "did you build it" / draft gate — none ever existed in the two-ends model
    await expect(detail.locator('[data-gate]')).toHaveCount(0)
    await expect(detail.getByText(/Matches the design|approved design|Open draft/i)).toHaveCount(0)
    // the detail goes straight from its header to the reader (Focus is the default view) — and the
    // baked two-pane source stays in the DOM, hidden, feeding Focus and Grid (R13)
    await expect(detail.locator('.dtscroll > .focusov')).toHaveCount(1)
    await expect(detail.locator('.cols .pane')).toHaveCount(2)
    await expect(detail.locator('.cols')).toBeHidden()
  })
})

test('The detail offers a Focus / List / Flow toggle — Focus leads with the behavior, and media derives from status × beats', async ({ page }) => {
  await coverReqs('R13')
  // FOCUS is the default view — the reader opens straight away
  await page.goto('/#/board')
  await page.waitForSelector('.dt[data-screen="board"]:not([hidden]) .focusov')
  await checkReq('R13', async () => {
    const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
    const reqCount = await dt.locator('.reqpane .req').count()
    // the header toggle offers EXACTLY Focus / List / Flow (the frozen mockup contract, the human
    // 2026-08-21 — Grid became List; the router key stays 'grid'), Focus is active on open, and the
    // List is one row per requirement — the beat, threaded the exact row count
    await toggleViews(page, { ...treeShape(), reqs: reqCount })
    const ov = dt.locator('.focusov')

    // THE BEHAVIOR LEADS (R13, the frozen mockup): deep-link to R13 itself — a requirement that
    // carries a Given/When→Then block — via the #/<screen>/<rid> route the feature strip uses too.
    await page.goto('/#/board/R13')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText('R13')
    const beh = ov.locator('.fread .behavior')
    await expect(beh).toHaveCount(1)
    await expect(beh.locator('.brow')).toHaveCount(3)          // one Given + a When→Then beat
    await expect(beh).toContainText('Focus / List / Flow')
    // …and the PROSE is COLLAPSED beneath it, one click away — never repeated open under the shape
    const prose = ov.locator('.fread .fbody')
    await expect(prose).toBeHidden()
    await ov.locator('.fread .prose-t').click()
    await expect(prose).toBeVisible()
    await expect(prose).toContainText('The detail header carries a toggle')
    // the SCHEMATIC slot sits below the reading — R13's OWN drawn loop (dogfood: the board draws
    // its requirements). Derived from the behavior text by tools/viz.mjs (switch-views archetype)
    // and committed at spec/board/viz/R13.svg; fresh (text and drawing agree), so no grey, no ≠.
    const schem13 = ov.locator('.fleft .fschem')
    await expect(schem13.locator('.viz svg')).toHaveCount(1)
    await expect(schem13).not.toContainText('no schematic drawn yet')
    await expect(schem13).not.toHaveClass(/isstale/)
    await expect(schem13.locator('.figcap')).toContainText('schematic · the idea, not the real UI')
    await expect(schem13.locator('.figfoot')).toContainText('viz@')
    await expect(schem13.locator('.figfoot')).not.toContainText('≠')
    // …and a requirement the kit cannot draw keeps the honest placeholder (R2: scroll independence
    // fits no archetype — text-only, never a wrong picture)
    await page.goto('/#/board/R2')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText('R2')
    await expect(ov.locator('.fleft .fschem')).toContainText('no schematic drawn yet')
    await page.goto('/#/board/R13')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText('R13')

    // THE PROOF on the RIGHT — Run + ⋯ header and the proof line, the covering test's OWN node moved
    // in wired (no player rebuilt), exactly as before the media pane landed
    await expect(ov.locator('.feval .fphead')).toBeVisible()
    await expect(ov.locator('.feval .fpby')).toBeVisible()
    await expect(ov.locator('.feval .fev .test.infocus')).toHaveCount(1)
    await expect(ov.locator('.feval .fpacts > .runone')).toBeVisible()        // Run always shown in the header
    await expect(ov.locator('.feval .fpacts .fmenu .fmenubtn')).toHaveCount(1) // the rest behind ⋯
    await expect(ov.locator('.feval .fmenupop [data-steps]')).toHaveCount(1)
    await expect(ov.locator('.feval .fmenupop [data-log]')).toHaveCount(1)
    await ov.locator('.feval .fmenubtn').click()
    await ov.locator('.feval .fmenupop [data-log]').click()
    await expect(page.locator('#logsheet')).toHaveClass(/\bon\b/)
    await page.locator('#logsheet [data-logclose]').click()
    await expect(ov.locator('.fcols, .fopen')).toHaveCount(0)

    // MEDIA DEFAULTS DERIVE FROM STATUS × BEATS (D2; the frozen mockup). The status is FORCED
    // client-side onto real .req nodes — the established deterministic technique (the dogfood lag
    // makes live statuses stale mid-run) — while the baked EVIDENCE attributes (the D2 harvest's
    // frames, folded from real runs into spec/_results-index.json and baked as data-ev-*) stay real.
    const evId = await dt.locator('.reqpane .req[data-ev-after]').first().getAttribute('data-r')
    expect(evId, 'at least one requirement must carry harvested evidence').toBeTruthy()
    const force = (rid: string, st: string) =>
      dt.locator(`.reqpane .req[data-r="${rid}"]`).evaluate((el, s) => el.setAttribute('data-status', s), st)
    const reopen = async (rid: string) => {    // hash-route away and back so the reader rebuilds
      await page.goto('/#/board/' + (rid === 'R2' ? 'R3' : 'R2'))
      await page.goto(`/#/board/${rid}`)
      await expect(ov.locator('.fread .frmeta .fid')).toHaveText(rid)
    }

    // PASSED → the harvested frame pair, under the stills · gif · video toolbar, stills the default
    await force(evId!, 'passed')
    await reopen(evId!)
    const media = ov.locator('.feval .fmedia')
    await expect(media).toHaveCount(1)
    await expect(media.locator('.medbar button')).toHaveText(['stills', 'gif', 'video'])
    await expect(media.locator('.medbar button[data-m="frames"]')).toHaveClass(/\bon\b/)
    const framesPanel = media.locator('.fmpanel[data-m="frames"]')
    await expect(framesPanel).toBeVisible()
    await expect(framesPanel.locator('.fcell img')).not.toHaveCount(0)   // the harvested before/after pair
    await expect(framesPanel.locator('.fcap').first()).toContainText(/before|given/)
    // the TOOLBAR OVERRIDES the default — a client-side preference (localStorage), never stored in the tree
    await media.locator('.medbar button[data-m="video"]').click()
    await expect(media.locator('.fmpanel[data-m="video"]')).toBeVisible()
    await expect(framesPanel).toBeHidden()
    expect(await page.evaluate(() => localStorage.getItem('sbFocusMedia'))).toBe('video')
    await media.locator('.medbar button[data-m="frames"]').click()
    await expect(framesPanel).toBeVisible()

    // FAILED → the failed mark on the pane; no gif mode (the mockup skips it), video says what it
    // is. The stills are the NEWEST record's (D3): its own frames when the last run of this test was
    // a recorded one, else the harvested red after-frame — the framed branch is pinned by R14 (1b)
    // on a stub record, so here only the frameless branch asserts the exact red-frame cell.
    await force(evId!, 'failed')
    await reopen(evId!)
    await expect(media.locator('.medbar button[data-m="clip"]')).toHaveCount(0)
    await expect(media.locator('.medbar button[data-m="video"]')).toHaveText('video@fail')
    await expect(media.locator('.fmbar .fpv.fail')).toContainText('✗')
    // positive either way (review A-2): the newest record's own strip renders under the mark, or the
    // harvested red after-frame does — exactly one of the two, never a bare absence
    const rfCells = media.locator('.fmpanel[data-m="frames"] .fcell.rf')
    if (await rfCells.count() > 0) {
      await expect(rfCells.first()).toBeVisible()
      await expect(rfCells.first().locator('img')).toHaveCount(1)
      await expect(media.locator('.fmpanel[data-m="frames"] .fcell:not(.rf).hotbad')).toHaveCount(0)
    } else {
      await expect(media.locator('.fmpanel[data-m="frames"] .fcell.hotbad')).toHaveCount(1)
      await expect(media.locator('.fmpanel[data-m="frames"] .fcell.hotbad')).toBeVisible()
    }

    // CHANGED → the last proof media under a pinned-era watermark
    await force(evId!, 'changed')
    await reopen(evId!)
    await expect(media.locator('.fmbar')).toContainText('pinned era')
    await expect(media.locator('.wmark')).toBeVisible()
    await expect(media.locator('.wmark')).toContainText('re-run to re-verify')

    // UNTESTED → no media and no toolbar: the pane reads the honest line and offers the next move,
    // which opens the add-test prompt with this requirement pre-picked (R15 behavior, unchanged)
    await force(evId!, 'untested')
    await reopen(evId!)
    await expect(media.locator('.medbar')).toHaveCount(0)
    await expect(media.locator('.noev')).toContainText('no proof yet')
    await media.locator('.noev button').click()
    await expect(page.locator('#promptsheet')).toHaveClass(/\bon\b/)
    await expect(page.locator('#promptbody')).toContainText('spec/board/test.spec.ts')
    await page.locator('#promptsheet [data-promptclose]').click()
    await force(evId!, 'passed')   // leave the forced node in a media-bearing state for later reads
    await page.evaluate(() => localStorage.removeItem('sbFocusMedia'))

    // a WINDOWED pager: first and last page always anchored, ellipsis in the gap, next moves on
    const dots = dt.locator('.dtfoot .fdots .fdot')
    expect(await dots.count()).toBeLessThan(reqCount)
    await expect(dt.locator('.dtfoot .fdot[title^="R1 "]')).toHaveCount(1)
    await expect(dt.locator(`.dtfoot .fdot[title^="R${reqCount} "]`)).toHaveCount(1)
    await expect(dt.locator('.dtfoot .fdotgap')).not.toHaveCount(0)
    const firstId = (await ov.locator('.fread .frmeta .fid').textContent())!.trim()
    await dt.locator('.dtfoot .fnav.next').click()
    await expect(ov.locator('.fread .frmeta .fid')).not.toHaveText(firstId)

    // LEAVING FOCUS RESTORES THE BORROWED NODE: while the reader is open it holds one test's row;
    // switching views puts that node back WHOLE into the (hidden) source pane
    const inPane = await dt.locator('.testpane .test').count()

    // LIST → one collapsed row per requirement (state · id · title · beat count · test kind), and an
    // OPEN row is the FOCUS BODY ITSELF, in place — the same shared builder, an accordion of one
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await expect(dt.locator('.focusov')).toHaveCount(0)
    await expect(dt.locator('.testpane .test')).toHaveCount(inPane + 1)   // the borrowed row came home
    const list = dt.locator('.gridview')
    await expect(list).toBeVisible()
    await expect(dt.locator('.cols')).toBeHidden()
    await expect(list.locator('.lst-card')).toHaveCount(reqCount)
    await expect(list.locator('.lst-card .lst-head .lid').first()).not.toBeEmpty()
    await expect(list.locator('.lst-card .lst-head .lttl').first()).not.toBeEmpty()
    await expect(list.locator('.lst-card .lst-head .lpf')).toHaveCount(reqCount)  // every row wears its state
    const card13 = list.locator('.lst-card[data-r="R13"]')
    await card13.locator('.lst-head').click()
    await expect(card13).toHaveClass(/\bopen\b/)
    const open13 = card13.locator('.lst-body')
    await expect(open13.locator('.fpage')).toHaveCount(1)                 // the Focus body, verbatim
    await expect(open13.locator('.fread .fttl')).toHaveText(
      ((await card13.locator('.lst-head .lttl').textContent()) || '').trim())
    await expect(open13.locator('.fread .behavior')).toHaveCount(1)       // behavior leads here too
    await expect(open13.locator('.fleft .fschem .viz svg')).toHaveCount(1) // the drawn loop, in place too
    await expect(open13.locator('.feval .fphead')).toBeVisible()
    // the ACCORDION: opening another row closes this one — one open row at a time, ids never collide
    const card2 = list.locator('.lst-card[data-r="R2"]')
    await card2.locator('.lst-head').click()
    await expect(card2).toHaveClass(/\bopen\b/)
    await expect(card13).not.toHaveClass(/\bopen\b/)
    await expect(list.locator('.lst-body:not([hidden])')).toHaveCount(1)
    // closing the open row restores its borrowed test node to the pane
    await card2.locator('.lst-head').click()
    await expect(card2).not.toHaveClass(/\bopen\b/)
    await expect(dt.locator('.testpane .test')).toHaveCount(inPane + 1)

    // The proof line is COVERAGE-honest and reads the SAME word as the chip (board R4): "proved by"
    // only for a Passed requirement, "covered by … — not passed yet" otherwise. Same forced-status
    // technique as above; the coverage tags stay real, so .fpby resolves a genuine covering test.
    const [passedId, otherId] = await dt.locator('.reqpane .req').evaluateAll(
      els => els.slice(0, 2).map(el => el.getAttribute('data-r')))
    expect(otherId, 'R13 needs at least two requirements to exercise both branches').toBeTruthy()
    // park the hash on a THIRD page first: a goto to the URL the page is already on RELOADS it
    // (wiping the forced attributes), while a hash that differs is a same-document navigation
    await page.goto('/#/board/R3')
    await force(passedId!, 'passed')
    await force(otherId!, 'failed')
    await page.goto(`/#/board/${passedId}`)
    await expect(dt.locator('.focusov .fread .frmeta .fid')).toHaveText(passedId!)
    await expect(dt.locator('.focusov .fread .frmeta .fchip')).toHaveClass(/\bpassed\b/)
    await expect(dt.locator('.focusov .feval .fpby')).toContainText('proved by')
    await page.goto(`/#/board/${otherId}`)
    await expect(dt.locator('.focusov .fread .frmeta .fid')).toHaveText(otherId!)
    await expect(dt.locator('.focusov .fread .frmeta .fchip')).toHaveClass(/\bfailed\b/)
    await expect(dt.locator('.focusov .feval .fpby')).toContainText('covered by')
    await expect(dt.locator('.focusov .feval .fpby')).not.toContainText('proved by')
  })
})

// Board R13 — the FLOW view against the frozen mockup contract (the signed sentence, 2026-08-21):
// the chapter rail on the LEFT, the player on the RIGHT, each scrolling on its own (R2's principle),
// with the rail as the SCRUBBER over the ONE recording. Proven against a DETERMINISTIC record (the
// R10 stub pattern): chapters are derived SERVER-side (tools/flow.mjs) and ride the folded record
// like the proof frames do, so the client is driven with a fabricated record whose flow crosses
// screens and breaks mid-way. The honesty guarantee stays the point: a failing chapter stops the
// playback, and everything after it — recorded green or never reached at all — reads NOT-REACHED,
// so a Flow view can never present a broken run as fully green (rule 3).
test('Flow reads like Focus — the rail on the left scrubs the one recording, a failure stops it and the rest reads not-reached', async ({ page }) => {
  await coverReqs('R13')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  await checkReq('R13', async () => {
    // (0) the REAL /api/runs attaches server-derived chapters + kind to every record with steps —
    // the data path the client reads; break the server wiring and this fails before any stub
    const served = await page.evaluate(async () => {
      const d = await (await fetch('/api/runs')).json()
      const rec = (d.runs || []).flatMap((r: any) => Object.values(r.shotsByTest || {}))
        .find((o: any) => Array.isArray(o.steps) && o.steps.length) as any
      return rec ? { chapters: Array.isArray(rec.chapters), kind: typeof rec.kind } : null
    })
    expect(served, 'the committed run log should hold at least one record with steps').not.toBeNull()
    expect(served!.chapters, '/api/runs must attach server-derived chapters to each record').toBe(true)
    expect(served!.kind, '/api/runs must attach the derived unit/flow kind').toBe('string')

    // (1) STUB a flow record: three reached chapters (fabricated in the exact shape flow.mjs emits),
    // the SECOND one failing, plus a declared coverReqs set naming two screens the flow never
    // reached — dispatch (has a card) and howitworks (a hash route with NO card; must never crash).
    // The record also carries harvested proof FRAMES (Task 15) — the rail's chapter thumbnails.
    const chapters = [
      { title: 'Open the board detail', screen: 'board', t: 0, reqs: ['R1'], ok: true },
      { title: 'Cross to conflicts — the count agrees', screen: 'conflicts', t: 2000, reqs: ['R2'], ok: false },
      { title: 'Back on the board', screen: 'board', t: 4000, reqs: ['R10'], ok: true }
    ]
    const steps = [
      { label: 'Open the board detail', cat: 'test.step', depth: 0, ok: true, t: 0, d: 500 },
      { label: 'proves R1', cat: 'test.step', depth: 1, ok: true, t: 100, d: 50 },
      { label: 'Open /#conflicts', cat: 'pw:api', depth: 1, ok: true, t: 2000, d: 100 },
      { label: 'proves conflicts:R2', cat: 'test.step', depth: 1, ok: false, t: 2100, d: 50 },
      { label: 'The open count — got 1 · expected 2', cat: 'info', depth: 2, ok: false, t: 2150, d: 5 },
      { label: 'Open /#/board', cat: 'pw:api', depth: 1, ok: true, t: 4000, d: 100 },
      { label: 'proves R10', cat: 'test.step', depth: 1, ok: true, t: 4100, d: 50 }
    ]
    const frames = [
      { img: 'spec/board/screen.png', ok: true, cap: 'cards on the home board — got 4 · expected 4', req: 'R1', t: 150 },
      { img: 'spec/board/screen.png', ok: false, cap: 'The open count — got 1 · expected 2', req: 'conflicts:R2', t: 2200 }
    ]
    const caseRec = {
      shots: [], video: 'spec/_runs/rfl/a.webm', steps, frames, log: 'x', kind: 'flow', chapters,
      reqs: ['board:R1', 'conflicts:R2', 'board:R10', 'dispatch:R7', 'howitworks:R2'],
      at: '2026-08-18T00:00:00.000Z', ms: 6000, ok: false, commit: 'abc1234'
    }
    await page.route('**/api/runs', r => r.fulfill({ json: {
      watch: false, running: false,
      runs: [{ screen: 'board', runId: 'rfl', hasLog: false, at: '2026-08-18T00:00:00.000Z', ms: 6000,
        ok: false, total: 1, failed: 1, shotsByTest: { [R1_TITLE]: caseRec } }]
    } }))
    await page.reload()
    await expect(dt.locator('.focusov')).toBeVisible()
    await expect(dt.locator('.test .tmeta').first()).not.toBeEmpty()   // the fold settled

    // (2) the toggle's third view — Flow — no reader, no columns; ABOVE the split, the flow
    // SELECTOR row: one pill per flow, plus ＋ New flow keeping the CURRENT prompt-modal behavior
    // (the composer is Task 5 — the board hands Claude the prompt, it writes nothing)
    await dt.locator('.viewseg .vseg[data-view="flow"]').click()
    await expect(dt.locator('.viewseg .vseg[data-view="flow"]')).toHaveClass(/\bon\b/)
    await expect(dt.locator('.focusov')).toHaveCount(0)
    await expect(dt.locator('.cols')).toBeHidden()
    const fv = dt.locator('.flowview')
    await expect(fv).toBeVisible()
    const sel = fv.locator('.flowsel')
    await expect(sel.locator('.fsel', { hasText: R1_TITLE })).toHaveClass(/\bon\b/)  // the recorded flow leads
    // a flow-kind PLAN with no record still gets its pill — derived from the baked source, honestly unrun
    await expect(sel.locator('.fsel', { hasText: STORY_TITLE })).toContainText('not run yet')
    const plus = sel.locator('.fsel.newflow')
    await expect(plus).toContainText('New flow')
    await plus.click()
    await expect(page).toHaveURL(/#\/compose\/board$/)
    await expect(dt.locator('.composeview')).toBeVisible()
    await expect(page.locator('#promptsheet')).not.toHaveClass(/\bon\b/)
    await dt.locator('.composeview .cback').click()            // back to Flow — the rail is still there
    await expect(fv).toBeVisible()

    // (3) THE SPLIT (the signed R13 sentence — R2's principle): the chapter rail LEFT, the player
    // RIGHT, each scrolling on its OWN — and neither scrolls the page
    const split = fv.locator('.flsplit')
    await expect(split).toHaveCount(1)
    for (const s of ['.flrail', '.flmain']) {
      const o = await split.locator(s).evaluate(el => getComputedStyle(el).overflowY)
      expect(['auto', 'scroll'], s + ' must scroll on its own').toContain(o)
    }
    expect(await page.evaluate(() => document.documentElement.classList.contains('noscroll'))).toBeTruthy()
    // the ONE recording, PAUSED — the rail seeks it, never cuts it
    const video = split.locator('.flmain video')
    await expect(video).toHaveCount(1)
    await expect(video).toHaveJSProperty('paused', true)
    // the slim header: flow name + duration + run + ⋯ (Edit / open recording / Remove — R15 handoff)
    await expect(split.locator('.flhead .flttl')).toHaveText(R1_TITLE)
    await expect(split.locator('.flhead .flmeta')).toContainText('run abc1234')
    await expect(split.locator('.flhead .flmeta')).toContainText('cross-screen')
    await split.locator('.flhead .fmenubtn').click()
    const pop = split.locator('.flhead .fmenupop')
    await expect(pop.locator('button', { hasText: 'Edit this flow' })).toHaveCount(1)
    await expect(pop.locator('button', { hasText: 'Remove' })).toHaveCount(1)
    await expect(pop.locator('button', { hasText: 'recording' })).toHaveCount(1)
    await split.locator('.flhead .fmenubtn').click()   // close the menu again

    // (4) the RAIL derives everything from the record: 5 rows — 3 reached + 2 declared-never-reached
    const chaps = split.locator('.chstrip .ch')
    await expect(chaps).toHaveCount(5)
    await expect(chaps.nth(0).locator('.chno')).toContainText('beat 1')
    await expect(chaps.nth(0).locator('.chname')).toContainText('Open the board detail')
    await expect(chaps.nth(0)).toHaveClass(/\bp\b/)
    await expect(chaps.nth(0).locator('.chmk')).toHaveText('✓')     // a done chapter carries its ✓
    await expect(chaps.nth(0).locator('.flreq[data-r="R1"]')).toHaveCount(1)
    await expect(chaps.nth(0).locator('.thumb img')).toHaveCount(1) // the harvested frame is the thumbnail
    // the FAILING chapter wears its mark and NAMES its failing beat…
    await expect(chaps.nth(1)).toHaveClass(/\bf\b/)
    await expect(chaps.nth(1).locator('.chmk')).toHaveText('✗')
    await expect(chaps.nth(1)).toContainText('got 1 · expected 2')
    // …and RULE 3: the chapter AFTER it was recorded GREEN (ok:true in the stub) but follows a
    // failure, so it must read NOT-REACHED — this fails if the rail shows it green
    await expect(chaps.nth(2)).toHaveClass(/\bnr\b/)
    await expect(chaps.nth(2)).not.toHaveClass(/\bp\b/)
    await expect(chaps.nth(2).locator('.chmk')).toHaveText('◌')
    // the declared coverReqs screens the flow never reached trail as not-reached rows — dispatch's
    // chip is a real link (it has a card); howitworks renders its id INERTLY, no crash
    await expect(chaps.nth(3)).toHaveClass(/\bnr\b/)
    await expect(chaps.nth(3).locator('.flreq[data-r="R7"]')).toHaveCount(1)
    await expect(chaps.nth(4)).toHaveClass(/\bnr\b/)
    await expect(chaps.nth(4).locator('.flreq.inert')).toHaveCount(1)
    // a not-reached row is a rendered absence — never a seek target
    expect(await chaps.nth(2).evaluate(el => el.tagName)).not.toBe('BUTTON')

    // (5) THE RAIL IS THE SCRUBBER: clicking a chapter seeks the player, RINGS the current one and
    // captions it; clicking the FAILING chapter stops the playback there — the banner names the
    // failing beat and NEVER overlaps the caption (the caption clears while the banner shows)
    await chaps.nth(0).locator('.chname').click()
    await expect(chaps.nth(0)).toHaveClass(/\bcur\b/)
    await expect(split.locator('.flcap')).toContainText('chapter 1 of 5')
    await expect(split.locator('.flcap')).toContainText('proves R1')
    await chaps.nth(1).locator('.chname').click()
    await expect(chaps.nth(1)).toHaveClass(/\bcur\b/)
    await expect(chaps.nth(0)).not.toHaveClass(/\bcur\b/)
    const banner = split.locator('.flbanner')
    await expect(banner).toHaveClass(/\bshow\b/)
    await expect(banner).toHaveClass(/\bbad\b/)
    await expect(banner).toContainText('the flow stopped here')
    await expect(banner).toContainText('got 1 · expected 2')
    await expect(banner.locator('.flgo')).toHaveCount(1)            // ⟳ replay, right in the banner
    await expect(split.locator('.flcap')).toHaveText('')
    // seeking back to a green chapter clears the banner and the caption returns
    await chaps.nth(0).locator('.chname').click()
    await expect(banner).not.toHaveClass(/\bshow\b/)
    await expect(split.locator('.flcap')).toContainText('chapter 1 of 5')
    // the player carries its own small ⟳ replay
    await expect(split.locator('.flreplay')).toHaveCount(1)
    // a chapter THUMBNAIL zooms in the shared lightbox — a different intent from seeking
    await chaps.nth(0).locator('.thumb img').click()
    await expect(page.locator('#lb')).toBeVisible()
    await page.locator('#lbclose').click()

    // (6) a flow with NO record keeps the honest placeholder — never fake chapters
    await sel.locator('.fsel', { hasText: STORY_TITLE }).click()
    await expect(fv.locator('.flnone')).toContainText('Not run yet')
    await expect(fv.locator('.chstrip .ch')).toHaveCount(0)
    await sel.locator('.fsel', { hasText: R1_TITLE }).click()

    // (7) a requirement chip opens that requirement in FOCUS
    await fv.locator('.chstrip .ch').nth(0).locator('.flreq[data-r="R1"]').click()
    await expect(dt.locator('.focusov .fread .frmeta .fid')).toHaveText('R1')
    await expect(dt.locator('.viewseg .vseg[data-view="focus"]')).toHaveClass(/\bon\b/)

    // (8) a screen with NO flows keeps its empty state, with the same authoring affordance — the
    // composer, opened FOR that screen (its beats group first; a flow's file follows its first beat)
    await page.goto('/#/conflicts/flow')
    const cfv = page.locator('.dt[data-screen="conflicts"]:not([hidden]) .flowview')
    await expect(cfv.locator('.flempty')).toContainText('No flow tests')
    await cfv.locator('.flempty button').click()
    await expect(page).toHaveURL(/#\/compose\/conflicts$/)
    await expect(page.locator('.dt[data-screen="conflicts"]:not([hidden]) .composeview')).toBeVisible()
  })
})

test('The proof is scannable as frames — the media pane\'s stills ARE the strip, one surface', async ({ page }) => {
  await coverReqs('R14')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  // R1 is covered by exactly ONE test, so it is both the primary flow the default Focus page (R1)
  // embeds AND a row of the hidden baked pane — the two places the stubbed frames must appear.
  await checkReq('R14', async () => {
    // A run's record carries proof FRAMES — one still per checked value, cut from the recording at the
    // instant the check fired, each with its got-vs-expected (red on a failure). Stub a record that has
    // frames and drive it through the REAL client pipeline (the extraction that produces them is real
    // and runs OUTSIDE this deterministic suite, exactly like the recording it cuts from). The imgs
    // point at a served png so they load — this asserts the STRIP, not the pixels.
    const frames = [
      { img: 'spec/board/screen.png', ok: true,  cap: 'first value — got 7 · expected 7', req: 'R1' },
      { img: 'spec/board/screen.png', ok: true,  cap: 'second value — got 6 · expected 6', req: 'R1' },
      { img: 'spec/board/screen.png', ok: false, cap: 'third value — got 5 · expected 4', req: 'R1' },
      // the NEGATIVE (final review T3b L2): a qualified tag counts only for its OWN screen — this
      // frame proves dispatch:R1, so it must NOT appear in board R1's strip (count stays 3)
      { img: 'spec/board/screen.png', ok: true,  cap: 'foreign value — got 9 · expected 9', req: 'dispatch:R1' }
    ]
    await page.route('**/api/runs', r => r.fulfill({ json: {
      watch: false, running: false,
      runs: [{ screen: 'board', runId: 'rf', hasLog: false, at: '2026-08-13T00:00:00.000Z', ms: 6000,
        ok: false, total: 1, failed: 1, shotsByTest: { [R1_TITLE]: {
          shots: [], video: 'spec/_runs/rf/a.webm', frames, steps: [], log: 'x',
          at: '2026-08-13T00:00:00.000Z', ms: 6000, ok: false, commit: 'abc1234'
        } } }]
    } }))
    await page.reload()
    await expect(dt.locator('.focusov')).toBeVisible()
    await expect(dt.locator('.test .tmeta').first()).not.toBeEmpty()   // the fold settled
    // the media pane derives its panels from R1's status; the strip must not depend on the dogfood
    // lag (mid-run the live status is stale-by-source), so force the media-bearing status onto the
    // real node — the established deterministic technique — and rebuild the reader on it
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => el.setAttribute('data-status', 'passed'))
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()

    // (1) IN THE FOCUS READER the frames render as the MEDIA PANE'S STILLS (R14 as signed
    // 2026-08-22: one surface, not two): one cell per checked value, in order, each captioned with
    // its got-vs-expected; the failing value reads red.
    const ov = dt.locator('.focusov')
    const panel = ov.locator('.feval .fmedia .fmpanel[data-m="frames"]')
    const rf = panel.locator('.fcell.rf')
    await expect(rf).toHaveCount(3)                               // the three of THIS screen's R1 — not the foreign fourth
    await expect(panel.locator('.fcell.rf', { hasText: 'foreign value' })).toHaveCount(0)
    await expect(rf.nth(0)).toContainText('got 7 · expected 7')
    await expect(rf.nth(2)).toContainText('got 5 · expected 4')
    await expect(rf.nth(0)).not.toHaveClass(/\bhotbad\b/)
    await expect(rf.nth(2)).toHaveClass(/\bhotbad\b/)            // the failed value reads red
    await expect(rf.nth(0).locator('img')).toHaveCount(1)        // frames OF the recording, as images
    // a still is a thumbnail; a click opens it full in the existing lightbox (verify without pixels)
    await rf.nth(2).locator('img').click()
    await expect(page.locator('#lb')).toBeVisible()
    await page.locator('#lbclose').click()
    // ONE SURFACE (the signed merge): the moved test node's own strip is folded away in the focus
    // card — the stills view above is the only strip a reader sees; no label crowds it and the
    // moved test's header stays folded (the proof line replaces it)
    await expect(ov.locator('.feval .fev .pfstrip')).toBeHidden()
    await expect(ov.locator('.feval .fev .flabel')).toHaveCount(0)
    await expect(ov.locator('.feval .fev .test.infocus > .th')).toBeHidden()

    // (1b) D3 (the human, 2026-08-22): the media pane renders the NEWEST record's harvest whatever
    // its status — a FAILING run's own frames show (the value that broke, burned red) instead of
    // the strip being suppressed under a failed chip. The failed state is carried in the pane
    // itself: the bar wears the existing failed mark (✗ + bengara, hue never alone), the failing
    // value stays red, and video reads video@fail. Forced status again — the same technique.
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => el.setAttribute('data-status', 'failed'))
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    const rfF = ov.locator('.feval .fmedia .fmpanel[data-m="frames"] .fcell.rf')
    await expect(rfF).toHaveCount(3)                              // the failing run's frames DO render
    await expect(rfF.nth(2)).toHaveClass(/\bhotbad\b/)
    await expect(rfF.nth(2)).toContainText('got 5 · expected 4')
    await expect(ov.locator('.feval .fmedia .fmbar .fpv.fail')).toContainText('✗')   // the failed mark on the pane
    await expect(ov.locator('.feval .fmedia .medbar button[data-m="video"]')).toHaveText('video@fail')
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => el.setAttribute('data-status', 'passed'))
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    await expect(ov.locator('.feval .fmedia .fmbar .fpv.fail')).toHaveCount(0)      // and only on a failure

    // (2) AND THE STRIP IS THE TEST'S OWN: leave Focus — the borrowed node returns whole to the
    // hidden source pane, frames intact (count/class reads work on hidden rows) — "in the test's
    // evidence" survives the merge untouched
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    const tst = dt.locator('.testpane .test', { hasText: R1_TITLE }).first()
    // (the TEST's strip is every frame the test cut — all four, the foreign dispatch:R1 one included;
    // only the REQUIREMENT's stills view filters by screen)
    await expect(tst.locator('.pfstrip .pframe')).toHaveCount(4)
    await expect(tst.locator('.pfstrip .pframe').nth(2)).toHaveClass(/\bbad\b/)
    await expect(tst.locator('.pfstrip .pframe').nth(3).locator('.pfreq')).toHaveText('dispatch:R1')

    // (2b) Task 6 review A-1: the strip shown under a failed status is the run that FAILED it. R15
    // is covered by two tests; stub the first (DOM order) passing with green R15 frames and the
    // second failing with a red R15 frame — the pane must render the second's frames, not an
    // all-green strip under "✗ failed run".
    const A_TITLE = 'The ⋯ menus hand you a ready Claude prompt — the board authors nothing itself'
    const B_TITLE = '＋ New flow opens the composer — a derived library, the joint check, a truthful two-path button'
    await page.unroute('**/api/runs')
    await page.route('**/api/runs', r => r.fulfill({ json: {
      watch: false, running: false,
      runs: [{ screen: 'board', runId: 'rab', hasLog: false, at: '2026-08-13T02:00:00.000Z', ms: 6000,
        ok: false, total: 2, failed: 1, shotsByTest: {
          [A_TITLE]: { shots: [], video: 'spec/_runs/rab/a.webm', steps: [], log: 'x', ok: true, commit: 'abc1234',
            at: '2026-08-13T02:00:00.000Z', ms: 3000,
            frames: [{ img: 'spec/board/screen.png', ok: true, cap: 'A value — got 1 · expected 1', req: 'R15' }] },
          [B_TITLE]: { shots: [], video: 'spec/_runs/rab/b.webm', steps: [], log: 'x', ok: false, commit: 'abc1234',
            at: '2026-08-13T02:00:00.000Z', ms: 3000,
            frames: [{ img: 'spec/board/screen.png', ok: false, cap: 'B value — got 2 · expected 3', req: 'R15' }] }
        } }]
    } }))
    await page.goto('/#/board/R15')
    await page.reload()
    await expect(dt.locator('.focusov .fread .frmeta .fid')).toHaveText('R15')
    await expect(dt.locator('.test .tmeta').first()).not.toBeEmpty()
    await dt.locator('.reqpane .req[data-r="R15"]').evaluate(el => el.setAttribute('data-status', 'failed'))
    // rebuild the reader ON R15 (the view toggle reopens Focus at its default page, R1)
    await page.goto('/#/board/R2')
    await page.goto('/#/board/R15')
    await expect(dt.locator('.focusov .fread .frmeta .fid')).toHaveText('R15')
    const panelAB = dt.locator('.focusov .feval .fmedia .fmpanel[data-m="frames"]')
    await expect(panelAB.locator('.fcell.rf')).toHaveCount(1)
    await expect(panelAB.locator('.fcell.rf').first()).toContainText('B value — got 2 · expected 3')
    await expect(panelAB.locator('.fcell.rf').first()).toHaveClass(/\bhotbad\b/)
    await expect(panelAB.locator('.fcell.rf', { hasText: 'A value' })).toHaveCount(0)
    await expect(dt.locator('.focusov .feval .fmedia .fmbar .fpv.fail')).toContainText('✗')
    // the proof line names the test whose run failed, too — the pane and its header agree
    await expect(dt.locator('.focusov .feval .fpby b')).toHaveText(B_TITLE)

    // (3) NO VIDEO → NO STRIP, and NEWEST-RECORD-ONLY (D3): a record that cut no frames yields NO
    // run-frame cells — the harvested pair still stands, never a faked or separately-captured strip.
    // An OLDER record's frames must not stand in for the newest run either (that is how a green
    // strip from a past run would sit under a newer verdict): the stub keeps the framed record
    // behind a newer frameless one, and the strip stays empty.
    await page.unroute('**/api/runs')
    await page.route('**/api/runs', r => r.fulfill({ json: {
      watch: false, running: false,
      runs: [{ screen: 'board', runId: 'rf2', hasLog: false, at: '2026-08-13T01:00:00.000Z', ms: 6000,
        ok: true, total: 1, failed: 0, shotsByTest: { [R1_TITLE]: {
          shots: [], steps: [], log: 'x',
          at: '2026-08-13T01:00:00.000Z', ms: 6000, ok: true, commit: 'abc1234'
        } } },
      { screen: 'board', runId: 'rf', hasLog: false, at: '2026-08-13T00:00:00.000Z', ms: 6000,
        ok: false, total: 1, failed: 1, shotsByTest: { [R1_TITLE]: {
          shots: [], video: 'spec/_runs/rf/a.webm', frames, steps: [], log: 'x',
          at: '2026-08-13T00:00:00.000Z', ms: 6000, ok: false, commit: 'abc1234'
        } } }]
    } }))
    await page.reload()
    await expect(dt.locator('.focusov')).toBeVisible()
    await expect(dt.locator('.test .tmeta').first()).not.toBeEmpty()
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => el.setAttribute('data-status', 'passed'))
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    const panel2 = dt.locator('.focusov .feval .fmedia .fmpanel[data-m="frames"]')
    await expect(panel2.locator('.fcell')).not.toHaveCount(0)     // the harvested pair still stands
    await expect(panel2.locator('.fcell.rf')).toHaveCount(0)      // …but no strip — no frames, no fake
  })
})

// dispatch R7 — a finished run keeps the panel open AND refreshes the board's DERIVED state (a
// requirement's proven/unproven, a test's verdict) IN PLACE, without a reload. The records already
// refreshed live; the derived state is baked at build time, so the client re-fetches the rebuilt
// board.html and syncs it. Driven here through the exposed seam with a served board.html carrying the
// change a run would produce, so the sync is deterministic (no real run, no timing).
test('A finished run refreshes the board in place — no reload, the panel stays (dispatch R7)', async ({ page }) => {
  await coverReqs('dispatch:R7')
  await openDetail(page)
  // the cross-screen beat (spec/dispatch/steps.ts) — a flow composed from the board can chain it
  await checkReq('dispatch:R7', async () => { await refreshDerivedInPlace(page, { ...treeShape() }) })
})

// hudCheck is a CHECK, not a caption: it ASSERTS the got-vs-expected it paints on the recording's
// topbar. Without this a red run could show a passing-looking "expected 9% · got 9%" while a SEPARATE
// expect() elsewhere was the real failure — the confusing bar this guards against. (Harness guarantee,
// so it lives here where the board's own recordings depend on it; no requirement of its own.)
test('hudCheck asserts the value it paints — a mismatch throws, a match does not', async ({ page }) => {
  await page.goto('/')
  let threw = false
  try { await hudCheck('deliberate mismatch', 'expected-A', 'got-B') } catch { threw = true }
  expect(threw, 'hudCheck must throw when got !== expected').toBe(true)
  await hudCheck('a real match', 'X', 'X')   // a matching check never throws
})

test('Searching requirement text hides groups that miss', async ({ page }) => {
  await coverReqs('R9')
  // the beat needs the card count its predecessor gives (the joint) — threaded, never re-hardcoded
  const state = await openBoardHome(page)
  state.cards = state.screens
  await checkReq('R9', async () => { await searchRequirementText(page, state) })
})

// Board R16 (the human, 2026-08-21, with the frozen mockup) — home leads with a feature strip of six
// cards, each a link into the live example of itself on this board; a dismiss control hides it, and
// the dismissal is a CLIENT-SIDE preference, never stored in the tree.
test('Home leads with a dismissible feature strip of six cards', async ({ page }) => {
  await coverReqs('R16')
  await checkReq('R16', async () => {
    // no dismissal preference set ⇒ the strip renders
    await page.evaluate(() => localStorage.removeItem('sbFeats'))
    await page.reload()
    await page.waitForSelector('.card')
    const strip = page.locator('#featwrap')
    await expect(strip).toBeVisible()
    await expect(strip.locator('.feat')).toHaveCount(6)
    // the six features, named — beats · proof · drift · the three views · compose · honest gaps
    await expect(strip.locator('.feat[data-feat="beats"]')).toContainText('one Given, When→Then chained')
    await expect(strip.locator('.feat[data-feat="proof"]')).toContainText(/proof from real runs/i)
    await expect(strip.locator('.feat[data-feat="drift"]')).toContainText(/drift/i)
    await expect(strip.locator('.feat[data-feat="views"]')).toContainText('Focus · List · Flow')
    await expect(strip.locator('.feat[data-feat="compose"]')).toContainText(/compose a flow/i)
    await expect(strip.locator('.feat[data-feat="gaps"]')).toContainText(/honest gaps/i)
    // the strip sits ABOVE the areas
    const above = await page.evaluate(() => {
      const s = document.getElementById('featwrap'); const h = document.getElementById('home')
      return !!(s && h && (s.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING))
    })
    expect(above, 'the strip must precede the area cards').toBe(true)
    // a card OPENS the live example of itself: beats → a requirement whose reader leads with a
    // behavior block; the three views → the List view of a real screen
    await strip.locator('.feat[data-feat="beats"]').click()
    await expect(page.locator('.dt:not([hidden]) .focusov .fread .behavior')).toBeVisible()
    await page.locator('.dt:not([hidden]) .close').click()
    await page.waitForSelector('.card')
    await page.locator('#featwrap .feat[data-feat="views"]').click()
    const dtv = page.locator('.dt:not([hidden])')
    await expect(dtv.locator('.gridview')).toBeVisible()
    await expect(dtv.locator('.viewseg .vseg[data-view="grid"]')).toHaveClass(/\bon\b/)
    await dtv.locator('.close').click()
    // DISMISS hides the strip; the preference is client-side ONLY — it survives a reload, and
    // clearing the browser-side preference brings the strip back (a tree-stored dismissal would not)
    await page.locator('#featx').click()
    await expect(page.locator('#featwrap')).toBeHidden()
    await page.reload()
    await page.waitForSelector('.card')
    await expect(page.locator('#featwrap')).toBeHidden()
    await page.evaluate(() => localStorage.removeItem('sbFeats'))   // only THIS preference — never the media/schematic prefs later tests rely on
    await page.reload()
    await page.waitForSelector('.card')
    await expect(page.locator('#featwrap')).toBeVisible()
    // the compose card opens the COMPOSER itself (R13's "＋ New flow opens the composer") — and no
    // prompt modal rides on top of it (a leftover from when the card's live example was the R15
    // prompt handoff)
    await page.locator('#featwrap .feat[data-feat="compose"]').click()
    await expect(page).toHaveURL(/#\/compose\/[a-z-]+$/)
    await expect(page.locator('.dt:not([hidden]) .composeview')).toBeVisible()
    await expect(page.locator('#promptsheet')).not.toHaveClass(/\bon\b/)
    await page.locator('.dt:not([hidden]) .close').click()
  })
})

test('A test opens to its evidence and the log opens in a window', async ({ page }) => {
  await coverReqs('R10')
  await openDetail(page)
  await checkReq('R10', async () => {
    const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
    const ov = dt.locator('.focusov')
    // a test's evidence is reached through the READER now (R13): the covering test's OWN node,
    // moved in wired — its Run affordances ride along wherever the test is shown
    await expect(ov.locator('.feval .fev .test.infocus')).toHaveCount(1)
    await expect(ov.locator('.feval .fpacts [data-run]')).not.toHaveCount(0)
    // its steps fold rides the moved row (kept, hidden — the reading card shows the clone)
    await expect(ov.locator('.feval .fev .test.infocus .fold')).toHaveCount(1)
    // the whole log opens in a FLOATING window, not a full-viewport scrim (a scrim suppresses the
    // board's own paint) — via the ⋯ menu's wired Logs button (the real node, relocated)
    const sheet = page.locator('#logsheet')
    await expect(sheet).toBeHidden()
    await ov.locator('.feval .fmenubtn').click()
    await ov.locator('.feval .fmenupop [data-log]').click()
    await expect(sheet).toHaveClass(/on/)
    const covers = await sheet.locator('.box').evaluate(el => {
      const r = el.getBoundingClientRect()
      return r.width >= innerWidth - 1 && r.height >= innerHeight - 1
    })
    expect(covers).toBeFalsy()                               // a floating card, not a full-viewport overlay
  })
})

test('The guide opens as manager and staff — without, then with', async ({ page }) => {
  await coverReqs('R11')
  await page.goto('/#howitworks')
  await page.waitForSelector('#howview:not([hidden])')
  await checkReq('R11', async () => {
    const wt = page.locator('#walkthrough')
    await expect(wt.locator('.act')).toHaveCount(4)
    const w1 = wt.locator('.act[data-act="1"]'), w2 = wt.locator('.act[data-act="2"]')
    // the same three moments, told twice — the mirror IS the argument
    for (const a of [w1, w2]) {
      await expect(a.locator('.wmoment')).toHaveCount(3)
      await expect(a).toContainText('Assigning work')
      await expect(a).toContainText('Two weeks later')
      // …and every step of the pair is a DRAWN SCENE, not a paragraph. A caption under a mock is
      // the form the human accepted; four prose steps would satisfy every assertion above.
      await expect(a.locator('.wstep')).toHaveCount(4)
      await expect(a.locator('.wstep > .scene')).toHaveCount(4)
    }
    await expect(w1).toContainText('Done, boss')
    // 1 · the chat that scrolls away — the task pops, the thread leaves, nothing is written down
    const chat = w1.locator('.scene.s-chat')
    await expect(chat.locator('.sc-bub')).toHaveCount(3)
    await expect(chat).toContainText('Done, boss')
    await expect(chat).toContainText('nothing written down')
    // 2 · the wall you cannot review — greeked code and one readable green badge
    const wall = w1.locator('.scene.s-wall')
    await expect(wall.locator('.sc-gl')).toHaveCount(16)
    await expect(wall.locator('.chip.ok')).toContainText('40 tests passing')
    // 3 · two weeks later — the calendar flips twice, the feature cracks, the REQUIREMENT is
    //     rewritten instead of the code, and the counter lands on the third time
    const rot = w1.locator('.scene.s-rot')
    await expect(rot.locator('.sc-sheet')).toHaveCount(3)
    await expect(rot.locator('.sc-crack')).toHaveCount(1)
    await expect(rot.locator('.sc-old')).not.toBeEmpty()
    await expect(rot.locator('.sc-new')).not.toBeEmpty()
    await expect(rot).toContainText('same bug')
    await expect(rot.locator('.sc-roll')).toContainText('3rd')
    // 4 · the invisible green — the passing assertion beside the screen it never looked at
    const blind = w1.locator('.scene.s-blind')
    await expect(blind.locator('.chip.ok')).toContainText('test green')
    await expect(blind.locator('.chip.bad')).toContainText('stale')
    await expect(blind).toContainText('NOBODY LOOKED')
    await expect(blind.locator('.sc-fv')).toContainText('100')
    // the act's chips are the scene's chips — no second copy left over from the prose form
    await expect(w1.locator('.chip.ok')).toHaveCount(2)
    await expect(w1.locator('.chip.bad')).toHaveCount(1)
    // 1 · the written requirement — the bubble becomes a card that is canon the instant it exists
    //     (the human, 2026-08-17): no guess flag, no confirmation step, nothing waits on a person
    const req = w2.locator('.scene.s-req')
    await expect(req.locator('.sc-bub')).toHaveCount(1)
    await expect(req.locator('.sc-card')).toHaveCount(1)
    await expect(req.locator('.wflag')).toHaveCount(0)
    await expect(req.locator('.wconfirm')).toHaveCount(0)
    await expect(req.locator('.sc-canon')).toContainText(/canon/i)
    // 2 · review by watching — a recording player whose miniature golden scene shows the numbers
    const watch = w2.locator('.scene.s-watch')
    await expect(watch.locator('.sc-bar')).toHaveCount(3)
    await expect(watch.locator('.sc-cell')).toContainText('200')
    await expect(watch).toContainText('2,671,006.87')
    await expect(watch.locator('.sc-tag')).toContainText(/illustration/i)
    // 3 · the chip that flips — a code line mutates and BOTH halves of the flip are drawn
    const drift = w2.locator('.scene.s-drift')
    await expect(drift.locator('.sc-mut')).toHaveCount(1)
    await expect(drift.locator('.wproven')).toContainText('proven')
    await expect(drift.locator('.wunproven')).toContainText('unproven')
    // 4 · the mirror, drawn — three beats a side, each carrying its own mark
    const mir = w2.locator('.scene.s-mirror')
    await expect(mir.locator('.sc-bad .sc-row')).toHaveCount(3)
    await expect(mir.locator('.sc-ok .sc-row')).toHaveCount(3)
    await expect(mir.locator('.sc-bad .mk')).toHaveCount(3)
    await expect(mir.locator('.sc-ok .mk')).toHaveCount(3)
    // with names the mechanism once, only after the mirror
    await expect(w2).toContainText('computed')
    await expect(w2).toContainText('unproven')
    // the surviving acts still carry the goldens, the illustration label, and the reference
    const demo = wt.locator('.wdemo')
    await expect(demo.locator('.wpin')).toContainText(/illustration/i)
    await expect(demo).toContainText('2,400,000')
    await expect(demo).toContainText('2,671,006.87')
    await expect(page.locator('#fullmethod')).toHaveCount(1)
  })
})

// The scenes are the deliverable, so the SHAPE of their motion is asserted, not just their markup:
// every scene plays once when its step is revealed, ENDS (a looping animation never resolves the
// finished promise below, so this test would hang red), and HOLDS its end state — and under
// prefers-reduced-motion the very same end states are already on screen with no animation at all.
test('Acts 1 and 2 play once, hold, and stand still under reduced motion', async ({ page }) => {
  await coverReqs('R11')
  // opacity is the honest read of a held end state: the flag has really gone, the stamp has really
  // landed. getComputedStyle sees the animation's forwards fill, so a scene that never ran fails here.
  const op = (l: any) => l.evaluate((el: Element) => Number(getComputedStyle(el).opacity))
  const settle = (l: any) => l.evaluate(async (el: Element) => {
    const as = (el as any).getAnimations()
    await Promise.all(as.map((a: any) => a.finished))
    return as.length
  })
  await page.goto('/#howitworks')
  await page.waitForSelector('#walkthrough .act[data-act="2"]')
  await checkReq('R11', async () => {
    const w2 = page.locator('.act[data-act="2"]')
    const canon = w2.locator('.scene.s-req .sc-canon')
    expect(await settle(canon)).toBeGreaterThan(0)      // it really animates, and it really finishes
    expect(await op(canon)).toBe(1)                     // canon, and held — nothing waits on a person
    await expect(w2.locator('.scene.s-req .wflag')).toHaveCount(0)
    await expect(w2.locator('.scene.s-req .wconfirm')).toHaveCount(0)
    // revealing a later step RESTARTS its scene — the display toggle is the trigger, no JS timer
    await w2.locator('[data-wnext]').click()
    await w2.locator('[data-wnext]').click()
    await expect(w2.locator('.wstep.on')).toHaveAttribute('data-step', '3')
    const un = w2.locator('.scene.s-drift .wunproven')
    expect(await settle(un)).toBeGreaterThan(0)
    expect(await op(w2.locator('.scene.s-drift .wproven'))).toBeLessThan(0.1)
    expect(await op(un)).toBe(1)
    // and it HOLDS: nothing loops, nothing advances the step for you
    await page.waitForTimeout(1200)
    await expect(w2.locator('.wstep.on')).toHaveAttribute('data-step', '3')
    expect(await op(un)).toBe(1)
  })
  await checkReq('R11', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    await page.waitForSelector('#walkthrough .act[data-act="2"]')
    const req = page.locator('.act[data-act="2"] .scene.s-req')
    // no motion at all — and the end state is what you see
    expect(await req.evaluate((el: Element) => (el as any).getAnimations({ subtree: true }).length)).toBe(0)
    expect(await op(req.locator('.sc-canon'))).toBe(1)
    await expect(req.locator('.wflag')).toHaveCount(0)
    await expect(req.locator('.wconfirm')).toHaveCount(0)
    await page.emulateMedia({ reducedMotion: null })
  })
})

test('The walkthrough steps on click and holds — never auto-advances', async ({ page }) => {
  await coverReqs('R11')
  await page.goto('/#howitworks')
  await page.waitForSelector('#walkthrough .act[data-act="3"]')
  await checkReq('R11', async () => {
    const act = page.locator('.act[data-act="3"]')
    const steps = act.locator('.wstep')
    // only the first step of the act is shown initially
    await expect(act.locator('.wstep.on')).toHaveCount(1)
    await expect(steps.first()).toHaveClass(/\bon\b/)
    // Next advances exactly one step
    await act.locator('[data-wnext]').click()
    await expect(steps.nth(1)).toHaveClass(/\bon\b/)
    await expect(steps.first()).not.toHaveClass(/\bon\b/)
    // the golden-number reveal pins and STAYS — no auto-advance after a verdict
    await expect(act.locator('.wpinned')).toBeVisible()
    const shown = await act.locator('.wstep.on').getAttribute('data-step')
    await page.waitForTimeout(1200)
    await expect(act.locator('.wstep.on')).toHaveAttribute('data-step', shown)  // unchanged
    // Prev goes back
    await act.locator('[data-wprev]').click()
    await expect(steps.first()).toHaveClass(/\bon\b/)
  })
})

test('A deep-linked skill URL shows the skill detail on cold load', async ({ page }) => {
  await coverReqs('R11')
  await page.goto('/#howitworks/kg-deep')
  await page.waitForSelector('#howview:not([hidden])')
  await checkReq('R11', async () => {
    // Cold-loading a skill URL reveals its detail. The guide's routing (R11) owns this: #skilldetail
    // lives inside the collapsed #fullmethod <details>, so the router must OPEN that disclosure or the
    // deep page renders blank — the regression Task 1 deferred to the controller pass.
    await expect(page.locator('#skilldetail')).toBeVisible()
    await expect(page.locator('#howoverview')).toBeHidden()
    await expect(page.locator('.flow-panel.open[data-skill="kg-deep"]')).toHaveCount(1)
  })
})

test('The guide ends with the derived next action, and there is no rail', async ({ page }) => {
  await coverReqs('R12')
  await checkReq('R12', async () => {
    // the six-step home rail is gone
    await page.goto('/')
    await page.waitForSelector('.card')
    await expect(page.locator('#jrail')).toHaveCount(0)
    await expect(page.locator('#jchip')).toHaveCount(0)
    // the walkthrough closes on a single derived next action
    await page.goto('/#howitworks')
    await page.waitForSelector('#walkthrough .act[data-act="4"]')
    const cta = page.locator('.act[data-act="4"] .wcta')
    await expect(cta).toHaveCount(1)
    await expect(cta).not.toBeEmpty()
    // EXACT text, not a permissive regex: the static '/kg-deep <screen>' literal this task removed
    // would itself have satisfied a loose /kg-deep|proven|.../i check, so that alone could not tell a
    // real derivation from the old hardcoded string left behind (rule 2 — an assertion that would
    // still pass with the requirement deleted proves nothing). This repo's own journey is always
    // folded (every requirement here is proven), so wCtaAction always takes its folded branch on this
    // tree — assert that EXACT sentence; only a real journey() read produces it.
    //
    // FOLDED MEANS SETTLED, NOT YOUR-TURN: CLAUDE.md is absolute that indigo means one thing only —
    // "your turn" — but this board is permanently folded (nothing left to derive), so the closing CTA
    // must NOT wear the your-turn indigo pill (.wcta-act). Select the CTA via the stable .wcta wrapper
    // (never renamed) so this survives either class the pill happens to carry.
    await expect(cta.locator('.wcta-act')).toHaveCount(0)
    await expect(cta.locator('.wcta-settled')).toHaveCount(1)
    await expect(cta.locator('.wcta-settled')).toHaveText(
      'Every derivable fact already holds — this project\'s requirements are proven.'
    )
  })
})

// Board R15 — the board hands you a PROMPT; it never writes a requirement or a test itself. The ⋯
// menus (one on the requirement in the Focus reader, one folded into the proof header's existing
// menu) each open the prompt window: a READY Claude prompt carrying the screen, the exact file, the
// target and the kg-e2e discipline, with a Copy button. The honesty half is asserted too: the prompt
// lives in a read-only <pre> and the sheet carries no form/textarea — no in-board editor, no write.
test('The ⋯ menus hand you a ready Claude prompt — the board authors nothing itself', async ({ page }) => {
  await coverReqs('R15')
  await openDetail(page)
  await checkReq('R15', async () => {
    const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
    const ov = dt.locator('.focusov')
    const sheet = page.locator('#promptsheet')
    const body = page.locator('#promptbody')

    // THE REQUIREMENT ⋯ (reading side): reword · add · remove — each a prompt, never an editor
    const rmenu = ov.locator('.fread .frmeta .fmenu')
    await expect(rmenu.locator('.fmenubtn')).toHaveCount(1)
    await rmenu.locator('.fmenubtn').click()
    await expect(rmenu.locator('.fmenupop [data-prompt="reword"]')).toContainText(/reword/i)
    await expect(rmenu.locator('.fmenupop [data-prompt="addreq"]')).toContainText(/add a requirement/i)
    await expect(rmenu.locator('.fmenupop [data-prompt="removereq"]')).toContainText(/remove/i)
    const reqId = ((await ov.locator('.fread .frmeta .fid').textContent()) || '').trim()
    await rmenu.locator('.fmenupop [data-prompt="reword"]').click()
    await expect(sheet).toHaveClass(/\bon\b/)
    // pre-loaded: the exact file, the target requirement, and the discipline — verbatim phrases
    await expect(body).toContainText('spec/board/prd.md')
    await expect(body).toContainText(reqId)
    await expect(body).toContainText('write the failing test first')
    await expect(body).toContainText('assert something that would fail without it')
    await expect(body).toContainText('never weaken a test to go green')
    // a Copy button rides the sheet header, wired to the shared [data-copy] handler
    await expect(sheet.locator('.bh [data-copy="promptbody"]')).toBeVisible()
    // HONESTY: the prompt is read-only — a <pre>, no form, no textarea, no input; the board writes nothing
    expect(await body.evaluate(el => el.tagName)).toBe('PRE')
    await expect(sheet.locator('form, textarea, input')).toHaveCount(0)
    // the requirement picker shows only for the test prompts — empty here
    await expect(page.locator('#promptpick .pmchip')).toHaveCount(0)
    await sheet.locator('[data-promptclose]').click()
    await expect(sheet).not.toHaveClass(/\bon\b/)

    // R15 anatomy (2026-08-19, the human): "Add a test to cover it" rides the REQUIREMENT ⋯ too, so an
    // UNTESTED requirement — the one that most needs a test — can ask for one without a test menu to
    // start from. Opening it from a requirement pre-picks that requirement in the cover set.
    await rmenu.locator('.fmenubtn').click()
    const rAddTest = rmenu.locator('.fmenupop [data-prompt="addtest"]')
    await expect(rAddTest).toHaveCount(1)
    await expect(rAddTest).toContainText(/add a test/i)
    await rAddTest.click()
    await expect(sheet).toHaveClass(/\bon\b/)
    await expect(body).toContainText('spec/board/test.spec.ts')
    // the picker pre-picks the requirement being read — its id names the cover line
    const rcover = (((await body.textContent()) || '').split('\n').find(l => /cover these requirements/i.test(l)) || '')
    expect(rcover).toContain(reqId)
    await sheet.locator('[data-promptclose]').click()
    await expect(sheet).not.toHaveClass(/\bon\b/)

    // THE TEST ⋯ — folded into the proof header's EXISTING menu, below Run-in-background/Logs/Steps,
    // separated by a divider: add · edit · remove a test
    const menu = ov.locator('.feval .fpacts .fmenu')
    await menu.locator('.fmenubtn').click()
    const pop = menu.locator('.fmenupop')
    await expect(pop.locator('.fmdiv')).toHaveCount(1)
    await expect(pop.locator('[data-prompt="addtest"]')).toContainText(/add a test/i)
    await expect(pop.locator('[data-prompt="edittest"]')).toContainText(/edit/i)
    await expect(pop.locator('[data-prompt="removetest"]')).toContainText(/remove/i)
    // the run/log items still lead the menu — the divider sits between them and the authoring items
    expect(await pop.locator('[data-steps]').count()).toBe(1)
    await pop.locator('[data-prompt="addtest"]').click()
    await expect(sheet).toHaveClass(/\bon\b/)
    await expect(body).toContainText('spec/board/test.spec.ts')
    await expect(body).toContainText('tag the requirement with checkReq')
    await expect(body).toContainText('keep every asserted value visible in the recording')

    // THE PICKER: every one of this screen's requirement ids as toggle chips; toggling one rewrites
    // the prompt's "cover these requirements" line (the requirement LIST also names ids, so the
    // assertion reads the cover line itself, not the whole prompt)
    const reqCount = await dt.locator('.reqpane .req').count()
    const chips = page.locator('#promptpick .pmchip')
    await expect(chips).toHaveCount(reqCount)
    const coverLine = async () =>
      (((await body.textContent()) || '').split('\n').find(l => /cover these requirements/i.test(l)) || '')
    const before = await coverLine()
    expect(before).toContain(reqId)                     // the requirement being read is pre-selected
    // pin the chip by its id — a live `:not(.on)` locator would re-resolve to the NEXT off chip
    // the moment the click lands, and the .on assertion would read the wrong element
    const offId = ((await page.locator('#promptpick .pmchip:not(.on)').first().textContent()) || '').trim()
    const off = page.locator('#promptpick .pmchip').filter({ hasText: new RegExp('^' + offId + '$') })
    expect(before).not.toContain(offId)
    await off.click()
    await expect(off).toHaveClass(/\bon\b/)
    const after = await coverLine()
    expect(after).not.toBe(before)                      // the toggle really rewrote the prompt
    expect(after).toContain(offId)                      // and the cover line now names the toggled id
    await sheet.locator('[data-promptclose]').click()
  })
})

// THE FLOW COMPOSER (board R13: "＋ New flow opens the composer (R15 family)"; D4 of the beats spec as
// amended 2026-08-21 by the human — deterministic-first). Three honesty claims, each an assertion that
// the old prompt-modal board fails: (1) the library is DERIVED from behavior blocks + tests ONLY — a
// node exists exactly where a beat function, a tagging test, or a behavior block does, and a
// requirement with none has no node; (2) the joint check — a beat whose `needs` nothing before it
// gives is a named GAP, its filler pinned, and the chain holds once the filler is in; (3) the
// two-path button is TRUTHFUL — "composed instantly, no AI" only while every chained beat is a
// function-shaped, proven step; otherwise "runs in Claude", naming the blocking beat.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { build } from '../../tools/build-board.mjs'
const INDEX_FILE = 'spec/_results-index.json'
// the beat metadata read INDEPENDENTLY of the module under test (final review m8: the oracle used
// to be parseBeats itself) — a plain regex over each `{ fn: '…', proves: '…' }` entry of steps.ts
const beatsOf = (src: string) => {
  const out: Array<{ fn: string, proves: string }> = []
  const body = /export\s+const\s+BEATS\s*=\s*\[([\s\S]*?)\n\]/.exec(src)?.[1] || ''
  for (const m of body.matchAll(/\{\s*fn:\s*'([A-Za-z_$][\w$]*)'\s*,\s*proves:\s*'(R\d+)'/g)) out.push({ fn: m[1], proves: m[2] })
  return out
}
const expectedLibrary = async (page: any) => {
  // derive the expected node set from the BAKED panes (what the board itself shows) + steps.ts on
  // disk (the beat metadata, read by an independent regex) — never from the composer or its module
  const screens: Array<{ name: string, reqs: Array<{ id: string, behavior: boolean }>, tags: string[] }> =
    await page.locator('.dt[data-screen]').evaluateAll((dts: any[]) => dts.map(dt => ({
      name: dt.dataset.screen,
      reqs: [].slice.call(dt.querySelectorAll('.reqpane .req')).map((r: any) => ({
        id: r.dataset.r, behavior: !!r.querySelector('.behavior') })),
      tags: [].slice.call(dt.querySelectorAll('.testpane .test .tags .tag')).map((t: any) =>
        (t.dataset.q.includes(':') ? t.dataset.q : dt.dataset.screen + ':' + t.dataset.q))
    })))
  const covered = new Set(screens.flatMap(s => s.tags))
  const ids: string[] = []
  const none: string[] = []
  for (const s of screens) {
    const stepsFile = 'spec/' + s.name + '/steps.ts'
    const beats = existsSync(stepsFile) ? beatsOf(readFileSync(stepsFile, 'utf8')) : []
    if (s.name === 'board') expect(beats.length, 'the board declares its four beats').toBe(4)
    const beatCovered = new Set<string>()
    for (const b of beats) { ids.push('b:' + s.name + ':' + b.fn); beatCovered.add(b.proves) }
    for (const r of s.reqs) {
      if (beatCovered.has(r.id)) continue
      if (covered.has(s.name + ':' + r.id)) ids.push('i:' + s.name + ':' + r.id)
      else if (r.behavior) ids.push('o:' + s.name + ':' + r.id)
      else none.push(s.name + ':' + r.id)
    }
  }
  return { ids, none }
}

test('＋ New flow opens the composer — a derived library, the joint check, a truthful two-path button', async ({ page }) => {
  await coverReqs('R13', 'R15')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  await page.evaluate(() => { try { localStorage.removeItem('sbComposeDraft:board') } catch (e) {} })
  const cv = dt.locator('.composeview')
  await checkReq('R13', async () => {
    // ＋ New flow ROUTES to the composer (#/compose/<screen>) — the prompt modal no longer opens
    await dt.locator('.viewseg .vseg[data-view="flow"]').click()
    await dt.locator('.flowsel .fsel.newflow').click()
    await expect(page).toHaveURL(/#\/compose\/board$/)
    await expect(cv).toBeVisible()
    await expect(page.locator('#promptsheet')).not.toHaveClass(/\bon\b/)

    // (1) LIBRARY HONESTY — exactly the derived node set, and none for a requirement with nothing
    const { ids, none } = await expectedLibrary(page)
    const shown: string[] = await cv.locator('.lrow[data-node]').evaluateAll((els: any[]) => els.map(e => e.dataset.node))
    expect(shown.length, 'the library is not empty').toBeGreaterThan(0)
    expect(new Set(shown)).toEqual(new Set(ids))
    // a requirement with neither a test nor a behavior block derives NO node. Since 1413ac1 (the
    // human, 2026-08-22) every requirement on this tree leads with beats, so `none` is empty here
    // and the rule's pinning lives in tools/compose.test.mjs ('THE HONESTY RULE'); the set
    // equality above still fails on any node the tree did not earn. (The old "at least one such
    // requirement" assertion pinned a tree shape, not the rule — rule 4: the test was the wrong side.)
    for (const q of none) await expect(cv.locator(`.lrow[data-node$=":${q}"]`)).toHaveCount(0)
    // a beat node is the board's own steps.ts beat; an inline node says so (a flow using it runs via Claude)
    await expect(cv.locator('.lrow[data-node="b:board:openDetailReader"][data-kind="beat"]')).toHaveCount(1)
    await expect(cv.locator('.lrow[data-node="i:board:R3"][data-kind="inline"] .lneed')).toContainText(/inline test/i)

    // (2) THE JOINT CHECK — chain toggleViews (needs `detail`) straight after the Given (gives `home`)
    await expect(cv.locator('.vchain .crow2.given')).toHaveCount(1)           // the fixture, set once
    await cv.locator('.lrow[data-node="b:board:toggleViews"] .lname2').click()
    await expect(cv.locator('.vchain .crow2[data-node="b:board:toggleViews"]')).toHaveCount(1)
    await expect(cv.locator('.csum .schip.warn')).toContainText('1 gap')
    await expect(cv.locator('.vchain .cconn.gap .jlab .kc')).toHaveText(['detail'])   // the missing token, named
    // the filler (openDetailReader gives `detail`) is PINNED first in the library, whatever the filter
    const filler = cv.locator('.lrow.hint')
    await expect(filler).toHaveCount(1)
    await expect(filler).toHaveAttribute('data-node', 'b:board:openDetailReader')
    expect(await cv.locator('.lrow[data-node]').first().getAttribute('data-node')).toBe('b:board:openDetailReader')
    await cv.locator('.csearch').fill('zzz-no-such-beat')
    await expect(cv.locator('.lrow[data-node]')).toHaveCount(1)                 // only the pin survives the filter
    await expect(cv.locator('.lrow[data-node]').first()).toHaveClass(/\bhint\b/)
    await cv.locator('.csearch').fill('')
    // adding the filler closes the gap — inserted BEFORE the beat that needed it, and the path holds
    await filler.locator('.lname2').click()
    await expect(cv.locator('.vchain .cconn.gap')).toHaveCount(0)
    await expect(cv.locator('.csum .schip.ok')).toContainText('path holds')
    const order: string[] = await cv.locator('.vchain .crow2[data-node]').evaluateAll((els: any[]) => els.map(e => e.dataset.node))
    expect(order).toEqual(['b:board:openDetailReader', 'b:board:toggleViews'])

    // (3) THE TWO-PATH BUTTON — the rule RENDERED, and proven BOTH ways unconditionally. The client
    // reads each beat's `proven` off the JSON island (its only source; the server re-derives before
    // it writes), so the flags are FORCED there — the established deterministic technique (the
    // dogfood lag stales the live fold by one run after a source edit) — and the composer is
    // re-entered so it renders from them. Neither branch is skipped on the tree's current fold
    // (final review M5: a proof conditional on its own subject's state was a rule-3 hole).
    const forceProven = async (unproven: string[]) => {
      await page.evaluate((ids) => {
        (window as any).__BOARD__.compose.nodes.forEach((n: any) => { if (n.kind === 'beat') n.proven = !ids.includes(n.id) })
      }, unproven)
      await page.goto('/#/board')
      await page.goto('/#/compose/board')          // re-enter: the draft keeps the chain, the flags re-read
      await expect(cv).toBeVisible()
      await expect(cv.locator('.vchain .crow2[data-node]')).toHaveCount(2)
    }
    const add = cv.locator('.cactions .cadd')
    const why = cv.locator('.cactions .cwhy')
    // every chained beat function-shaped + proven ⇒ composed instantly, no AI
    await forceProven([])
    await expect(add).toHaveAttribute('data-path', 'deterministic')
    await expect(add).toContainText(/composed instantly, no AI/i)
    await expect(why).toContainText(/no model involved/)
    // one chained beat not currently proven ⇒ the Claude path, THAT beat's requirement named
    await forceProven(['b:board:toggleViews'])
    await expect(add).toHaveAttribute('data-path', 'claude')
    await expect(add).toContainText(/runs in Claude/i)
    await expect(why).toContainText('R13')
    await expect(why).not.toContainText('R2')
    await forceProven([])
    await expect(add).toHaveAttribute('data-path', 'deterministic')
    // chain an INLINE beat (R3 — a tagging test, no step function) ⇒ the Claude path, blocker named
    await cv.locator('.lrow[data-node="i:board:R3"] .lname2').click()
    await expect(add).toHaveAttribute('data-path', 'claude')
    await expect(add).toContainText(/runs in Claude/i)
    await expect(why).toContainText('R3')
    // remove it again — the verdict flips back; nothing about this was stored in the tree
    await cv.locator('.vchain .crow2[data-node="i:board:R3"] .vx').click()
    await expect(add).toHaveAttribute('data-path', 'deterministic')
    await expect(why).not.toContainText('R3')
  })
  await checkReq('R15', async () => {
    // the manual fallbacks of the R15 family: ⧉ Copy prompt and a read-only view of the prompt
    // carrying the exact file, the declared cover set and the kg-e2e discipline
    await expect(cv.locator('.cactions .ccopy')).toContainText(/copy prompt/i)
    const pre = cv.locator('.cprompt pre')
    await expect(pre).toBeHidden()
    await cv.locator('.cactions .ctog').click()
    await expect(pre).toBeVisible()
    await expect(pre).toContainText('spec/board/test.spec.ts')
    await expect(pre).toContainText("coverReqs('R2', 'R13')")
    await expect(pre).toContainText('failing test FIRST')
    await expect(pre).toContainText('never weaken a test to go green')
    expect(await pre.evaluate(el => el.tagName)).toBe('PRE')
  })
})

// The composer's SERVER half: the deterministic endpoint runs the same composeCheck + emitFlow the
// unit tests pin and REFUSES honestly — a gap, an inline beat, a missing name — and the Claude-path
// job refuses before it would ever spawn. `dryRun` returns exactly what would be written without
// writing (the suite must not edit its own running spec file); the real write is the same code one
// flag away, proven by the composed demo flow this repo carries (Task 5 report).
test('The compose endpoint composes deterministically and refuses honestly — no job spawns on a refusal', async ({ page, request }) => {
  await coverReqs('R13')
  await openDetail(page)
  // The server derives proof from the index on disk at EVERY request — so the two answers that
  // matter (composed · refused-as-stale) are proven against a DETERMINISTIC index, never the live
  // fold (final review M5: an expectation read off the subject's own derived state skipped the
  // positive branch on the dogfood lag and went green with the emitter deleted). The board's own
  // entry is patched in place — ranAt pushed past every source (nothing stale) or to zero (every
  // pass stale by source) — and the exact prior bytes restored in `finally`, then the board rebuilt
  // to them so no later test opens onto a fixture index (the _modes precedent, injectIndex).
  const patchBoardIndex = (mut: (e: any) => void) => {
    const before = readFileSync(INDEX_FILE, 'utf8')
    const idx = JSON.parse(before)
    expect(idx.board, 'the board has folded at least once').toBeTruthy()
    mut(idx.board)
    writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2) + '\n')
    return () => writeFileSync(INDEX_FILE, before)
  }
  const fresh = (e: any) => {
    e.ranAt = Date.now() + 10 * 60 * 1000       // newer than any source — no pass is stale
    delete e.provenHashes                       // and no pin can flip a pass to Changed
    for (const t of e.tests) for (const k of Object.keys(t.reqs || {})) if (/^board:R(1|2|13)$/.test(k)) t.reqs[k] = 'pass'
  }
  const stale = (e: any) => { e.ranAt = 0 }    // older than every source — every pass stale by source
  await checkReq('R13', async () => {
    let restore = patchBoardIndex(fresh)
    try {
      const ok = await request.post('/api/compose', { data: { chain: ['b:board:countHomeCards', 'b:board:openDetailReader'], name: 'scratch flow', dryRun: true } })
      expect(ok.status(), 'compose (R1, R2 proven): ' + await ok.text()).toBe(200)
      const out = await ok.json()
      expect(out.path).toBe('spec/board/test.spec.ts')
      expect(out.dryRun).toBe(true)
      // (this literal once baked a phantom 29th case — both scanners are anchored at line start now,
      // fix round 1 B-4, so a quoted test( inside a string is exactly what this line also proves)
      expect(out.text).toContain("test('scratch flow'")
      expect(out.text).toContain("coverReqs('R1', 'R2')")
      expect(out.text).toContain("checkReq('R1', async () => { await countHomeCards(page, state) })")
      expect(out.text).toContain('const state = await openBoardHome(page)')
      // the SAME chain against proofs gone stale by source (m2): refused, and the reason is "run
      // first" — proven-but-stale is told apart from never-proven; the emitter never composes on a
      // stale Then
      restore(); restore = patchBoardIndex(stale)
      const st = await request.post('/api/compose', { data: { chain: ['b:board:countHomeCards', 'b:board:openDetailReader'], name: 'scratch flow', dryRun: true } })
      expect(st.status(), 'compose (R1/R2 stale): ' + await st.text()).toBe(409)
      expect(await st.text()).toMatch(/^R1, R2 are proven, but stale by source — run spec\/board first$/)
    } finally { restore(); build() }
    // the gap: toggleViews needs `detail` and nothing before it gives it — asked on the FRESH index
    // so the joint check, not the proof check, is what refuses
    restore = patchBoardIndex(fresh)
    try {
      const gap = await request.post('/api/compose', { data: { chain: ['b:board:toggleViews'], name: 'gap', dryRun: true } })
      expect(gap.status(), await gap.text()).toBe(409)
      expect(await gap.text()).toMatch(/needs detail/)
    } finally { restore(); build() }
    // no name: refused before anything else, whatever the fold says
    const noname = await request.post('/api/compose', { data: { chain: ['b:board:countHomeCards'], name: '  ', dryRun: true } })
    expect(noname.status(), await noname.text()).toBe(409)
    expect(await noname.text()).toMatch(/name the flow/i)
    // a flow name that is not one printable line is refused whatever the fold says (B-2): a line
    // terminator would end the composed header comment inside a file Playwright executes
    const nl = await request.post('/api/compose', { data: { chain: ['b:board:countHomeCards'], name: 'a\nb', dryRun: true } })
    expect(nl.status(), await nl.text()).toBe(409)
    expect(await nl.text()).toMatch(/flow name/i)
    const nlj = await request.post('/api/compose-job', { data: { chain: ['b:board:countHomeCards'], name: 'a\u2028b' } })
    expect(nlj.status(), await nlj.text()).toBe(400)
    expect(await nlj.text()).toMatch(/flow name/i)
    // and a cross-site page cannot reach either path: a foreign Origin is refused before any handler
    const xo = await request.post('/api/compose', { headers: { origin: 'http://evil.example' }, data: { chain: ['b:board:countHomeCards'], name: 'x', dryRun: true } })
    expect(xo.status(), await xo.text()).toBe(403)
    // an inline beat: the deterministic path refuses whatever the fold says, naming the Claude path
    const inl = await request.post('/api/compose', { data: { chain: ['b:board:countHomeCards', 'i:board:R3'], name: 'inline', dryRun: true } })
    expect(inl.status(), await inl.text()).toBe(409)
    expect(await inl.text()).toMatch(/R3/)
    expect(await inl.text()).toMatch(/not function-shaped \+ proven — the Claude path/)
    // the Claude path: an empty chain is refused up front — no detached claude job is ever spawned
    // for nothing (a live job needs a login and minutes; the suite never starts one)
    const job = await request.post('/api/compose-job', { data: { chain: [], name: 'nothing' } })
    expect(job.status()).toBe(400)
    expect(await job.text()).toMatch(/chain at least one beat/i)
  })
})

// ── COMPOSED FLOW: 'Home, the detail, then a finished run refreshes it in place — composed' (deterministic emitter — tools/compose.mjs) ─────────────
// Every beat below is an authored step function, red-first-proven in its unit home
// (spec/<screen>/steps.ts); this file's first full run passing is the composition's validity
// (CLAUDE.md rule 1 addendum, the human 2026-08-21). No model was involved and no graph is
// stored — this is ordinary authored-test material from the moment it was written.
test('Home, the detail, then a finished run refreshes it in place — composed', async ({ page }) => {
  await coverReqs('R1', 'R2', 'dispatch:R7')
  // the fixture Given, once — the board home, freshly loaded — specboard's own four screens in three areas
  const state = await openBoardHome(page)
  // beat 1 — proves R1
  await flowStep('count the home cards — one per screen, titles and a cover', async () => {
    await checkReq('R1', async () => { await countHomeCards(page, state) })
  })
  // beat 2 — proves R2
  await flowStep('open the board detail — reading and proof side by side', async () => {
    await checkReq('R2', async () => { await openDetailReader(page, state) })
  })
  // beat 3 — proves dispatch:R7
  await flowStep('a finished run refreshes the board in place — no reload', async () => {
    await checkReq('dispatch:R7', async () => { await refreshDerivedInPlace(page, state) })
  })
})
