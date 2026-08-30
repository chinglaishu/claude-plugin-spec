import { test, expect, checkReq, coverReqs, hudCheck, flowStep, reveal } from '../_base'
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
  // the card's STILL opens the screen in Focus, exactly like the rest of the card (the frozen
  // mockup, Task 8) — it is not a lightbox zoom, which is what every other thumbnail does
  await checkReq('R1', async () => {
    const first = page.locator('#home .card').first()
    const name = await first.getAttribute('data-screen')
    await first.locator('.cshot img').click()
    await expect(page.locator('#lb')).toBeHidden()
    await expect(page.locator(`.dt[data-screen="${name}"]:not([hidden]) .focusov`)).toBeVisible()
    await expect(page).toHaveURL(new RegExp('#/' + name + '$'))
  })
  // the header crumb names THIS project — package.json's name, with a tagline from spec/_config.json
  // when one is authored; "dogfooding itself" is specboard's own default, derived, never hardcoded
  await checkReq('R1', async () => {
    await expect(page.locator('.top .crumb')).toHaveText('specboard · dogfooding itself')
    await expect(page.locator('.top .crumb')).toHaveAttribute('data-project', 'specboard')
  })
})

test('A requirement and its proof are read together in one card that scrolls inside itself', async ({ page }) => {
  await coverReqs('R2')
  // the beat opens the detail itself (its When) and asserts the storyline row's three cells plus the
  // card's internal scroll (R2 as reworded 2026-08-28 — the two-container reader is gone)
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
    // the STORYLINE — one row per beat — heads the open row. Since the human's 2026-08-28 redesign
    // the authored prose ALWAYS follows it in full: the 'Full requirement' chevron is gone, because a
    // requirement is the thing the board exists to show and half of it behind a toggle made the
    // reader guess whether there was more. Both halves must be visible with NO interaction at all.
    await expect(body.locator('.fread .fstory .sbrow').first()).toBeVisible()
    await expect(body.locator('.fread .prose-t')).toHaveCount(0)           // no fold control left…
    await expect(body.locator('.fread > .ffoot button')).toHaveCount(0)    // …and nothing else in the footer either
    await expect(body.locator('.fread .fbody p, .fread .fbody ul').first()).toBeVisible()
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
    // The recording narrates from INSIDE the page (R10, reworded 2026-08-28): this very checkReq
    // painted the product-tour CALLOUT — a light dim, a ring on the asserted element, and a card
    // naming the requirement by id AND title beside that beat's When → Then in the prd's own words.
    // The burned-in topbar, its R-chip strip and its expected · got claim line are GONE; the got
    // value now shows only on a failure, and every check's full got/expected is recorded as the
    // test's step evidence instead (checked below on the mocked run).
    //
    // The overlay is painted only under a board recording (spec/_base.ts renderOverlay) — it is
    // burn-in for the video, and a plain `npm run e2e` must leave the page's geometry alone. Both
    // branches are real: under a recording the callout must carry the requirement's own words, and
    // without one nothing may be injected at all.
    //
    // Corrected 2026-08-29 (rule 4 — the TEST was the wrong side). NO RING, NO OVERLAY (the human,
    // 2026-08-28, e33e49c): renderOverlay now hides — and never creates — the overlay while nothing
    // is ringed, and checkReq opens every beat by clearing the previous ring. So at the top of this
    // beat `#__specboard-focus` does not exist yet, and asserting it was attached there was
    // unsatisfiable under a recording; the test only ever "passed solo" because a plain run takes
    // the else-branch. RING SOMETHING FIRST — which is what the paragraph above actually claims
    // ("a ring on the asserted element") — then assert the card that must appear beside it. Under a
    // plain run reveal() paints nothing (paintFocus is recording-gated), so the else-branch keeps
    // its full power: nothing may be injected even after a reveal.
    await reveal(dt.locator('.focusov .fread .frmeta .fid'))
    const focusOv = page.locator('#__specboard-focus')
    const call = focusOv.locator('.sb-call')
    if (process.env.BOARD_RECORD) {
      await expect(focusOv).toBeAttached()
      await expect(focusOv.locator('.sb-ring')).toBeVisible()   // the ring the callout is anchored to
      await expect(call).toBeVisible()
      await expect(call).toContainText('R10')
      // ONE SENTENCE, THE CURRENT SMALL STEP (the human, 2026-08-30: "only have to include the text
      // for current small step (as less text as possible) — and both the schematic and proof need to
      // have exact same text"). RULE 4, and the human's decision is the reason: this beat used to
      // assert the card carried the requirement TITLE and BOTH the When and the Then. It carries
      // neither the title nor both lines now — the card is the id chip and the line THIS scene
      // proves, chosen by tools/callout-text.mjs, the very rule tools/viz.mjs draws the schematic's
      // card by. We are mid-assertion here (the verdict has not landed), so the scene is the When.
      await expect(call).toContainText('When')
      await expect(call).not.toContainText('Then')
      await expect(call).not.toContainText(await titleOf('R10'))
      // …and it really is the prd's own When, not a label with nothing behind it
      const beatsR10 = prdBeats('R10')
      expect(beatsR10 && beatsR10.beats.length > 0, 'R10 carries a behavior block').toBe(true)
      expect(plain(await call.innerText()), 'the card carries this beat\'s own When, in full')
        .toContain(plain(beatsR10!.beats[0].when))
      await expect(focusOv.locator('.sb-veil')).toHaveCount(1)  // the light dim under it
    } else {
      await expect(focusOv).toHaveCount(0)                     // a plain run paints nothing into the page
    }
    await hudCheck('first check', 1, 1)
    await hudCheck('second check', 2, 2)

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
    // Task 16 #1 (the human, 2026-08-24): the media pane's video mode plays the screen's COMMITTED
    // recording — baked as data-ev-video from the fold, NOT the run's transient _runs .webm — seeked
    // to THIS requirement's beat (data-ev-vwin, ms into the recording). Give R1 a committed video the
    // way the fold bakes it, then rebuild the reader: the video panel is built (a fresh .rec.evrec,
    // never the OLD relocated .rec.playable) and plays that committed src, its label naming the beat.
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => {
      el.setAttribute('data-status', 'passed')
      el.setAttribute('data-ev-video', 'spec/board/evidence/committed.webm')
      el.setAttribute('data-ev-vwin', '1000:2000')
    })
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    // the ONE video for the whole requirement (2026-08-28: the per-pane stills · gif · video toolbar
    // is gone — the per-beat frames ride their own rows now, so the band's panel IS the video)
    const vpanel = ov.locator('.feval .fmedia .fmpanel', { has: page.locator('.frecwrap') })
    await expect(vpanel.locator('.rec.evrec')).toBeAttached()
    await expect(vpanel.locator('.rec video')).toHaveAttribute('src', 'spec/board/evidence/committed.webm')
    // the committed video is seeked to this beat — the honest label names where the beat sits (from vwin)
    await expect(vpanel.locator('.fvlab')).toContainText('this beat at 0:01')
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

    // the player never CROPS the frame: the narration callout is burned into the recording, and an
    // object-fit that fills-and-crops (cover) would slice its edges off in display. No toolbar to
    // switch any more — the band's one video is simply there (2026-08-28).
    const fit = await vpanel.locator('.rec video').evaluate(el => getComputedStyle(el).objectFit)
    expect(fit).toBe('contain')

    // the CALLOUT SURVIVES a navigation — a beat that walks to another page keeps its narration
    // (renderOverlay repaints on framenavigated). Recording-gated, exactly like the paint above.
    await page.reload()
    if (process.env.BOARD_RECORD) {
      await expect(call).toBeVisible()
      await expect(call).toContainText('R10')
    } else {
      await expect(focusOv).toHaveCount(0)
    }
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

test('R10 — the Flow player plays the VOICED recording when a run produced one', async ({ page }) => {
  // Voice-over (init R6): a voiced run's record carries BOTH the silent video and a voiced mp4, and
  // the player must play the voiced one. Since Task 16 #1 (the human, 2026-08-24) the Focus MEDIA
  // pane plays the screen's COMMITTED (silent) recording seeked to the beat; the narrated walkthrough
  // is the FLOW view's player, which prefers the voiced cut (client.js buildFlow: one.voiced ||
  // one.video). Deterministic through the REAL client pipeline via a stubbed /api/runs — a real
  // voiced run needs piper, which the suite cannot assume (board R10 rule 3).
  await coverReqs('R10')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  await checkReq('R10', async () => {
    // a flow-kind record (the shape flow.mjs emits), one reached chapter, carrying BOTH the silent
    // .webm and the voiced .mp4 the voice-over pipeline produced beside it
    const caseRec = {
      shots: [], video: 'spec/_runs/rv/a.webm', voiced: 'spec/_runs/rv/a.voiced.mp4',
      kind: 'flow', chapters: [{ title: 'Open the board detail', screen: 'board', t: 0, reqs: ['R1'], ok: true }],
      steps: [{ label: 'Open the board detail', cat: 'test.step', depth: 0, ok: true, t: 0, d: 100 },
        { label: 'proves R1', cat: 'test.step', depth: 1, ok: true, t: 50, d: 50 }],
      at: '2026-08-14T00:00:00.000Z', ms: 4000, ok: true, commit: 'abc1234'
    }
    await page.route('**/api/runs', r => r.fulfill({ json: {
      watch: false, running: false,
      runs: [{ screen: 'board', runId: 'rv', hasLog: false, at: '2026-08-14T00:00:00.000Z', ms: 4000,
        ok: true, total: 1, failed: 0, shotsByTest: { [R1_TITLE]: caseRec } }]
    } }))
    await page.reload()
    await expect(dt.locator('.test .tmeta').first()).not.toBeEmpty()   // the fold settled
    // the Flow view's player is the narrated walkthrough — its <video> prefers the VOICED cut; the
    // same record's silent a.webm would play without init R6
    await dt.locator('.viewseg .vseg[data-view="flow"]').click()
    const fplay = dt.locator('.flowview .flplay video')
    await expect(fplay).toBeAttached()
    const src = await fplay.getAttribute('src')
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
    await expect(body.locator('.feval .fptop .fpname')).toContainText(flow)   // the proof header names this very test, resolved by tag
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
    // (There USED to be an `expect(screens.some(s => s.hasTests && s.untagged > 0)).toBeTruthy()`
    // here — "the case that makes it real", written when conflicts had one test and five
    // requirements. Removed 2026-08-29, rule 4: 8962dea's tag backfill left ZERO untagged
    // requirements board-wide, so that line pinned a TREE SHAPE — a coverage gap — and a good change
    // that closed the last gap correctly broke it. Same correction, same reasoning, as the composer
    // test's own "at least one such requirement" removal below.
    //
    // Be honest about what that costs: while the tree has no untagged requirement, the loop below is
    // VACUOUS, so this beat now proves the first half of R6's Then (a tag plus an assertion is what
    // buys green — anyMulti above) and stands as a standing regression net for the second half, not
    // as live proof of it. The second half IS proven deterministically, against a fabricated screen
    // that always carries an untagged requirement, by spec/_modes/test.spec.ts — 'unproven — a
    // requirement with no passing test reads unproven'. It is deliberately NOT cross-tagged to
    // board:R6 from there: a cross-screen checkReq('board:…') in _modes made a board requirement
    // proven-via-cross-tag while the board's own chip lagged in the pane, and broke this very walk
    // (see the note at spec/_modes/test.spec.ts, 'renders — a Changed requirement …').)
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
    // THE HEADER ROW (R13, reworded 2026-08-25): the top bar names the screen with its area · route
    // beneath; the reading card's header reads `R13  ✓ Passed  <title>  ⋯` on ONE row — the title
    // joined the meta line and the position (n of N) MOVED OFF it to the pager (R17), so it no longer
    // repeats here.
    await expect(dt.locator('.dth .dname h2')).toHaveText('Board')
    await expect(dt.locator('.dth .dname .dsub')).toHaveText('Core · /')
    await expect(ov.locator('.fread .frmeta .fttl')).toContainText('Three views')       // the title is IN the header row
    await expect(ov.locator('.fread .frmeta .fcount')).toHaveCount(0)                    // the counter is gone (it lives in the pager)
    await expect(ov.locator('.fread .frmeta .fmenu .fmenubtn')).toHaveCount(1)           // the ⋯ rides the header's far edge
    // THE STORYLINE — A ROW PER BEAT, THREE CELLS WIDE (R13, reworded 2026-08-28 by the human):
    // each Given / When→Then beat carries its own drawn frame, its own words and its own harvested
    // proof, side by side under a `schematic · behavior · proof` header row. R13 is 1 beat →
    // given + then = TWO rows. The separate .fschem box and the old .fleft column are GONE.
    const story = ov.locator('.fread .fstory')
    await expect(story).toHaveCount(1)
    await expect(ov.locator('.fleft, .fschem, .storycap')).toHaveCount(0)   // the retired reader's containers
    // the HEADER ROW names the three cells — the one row that says what they ARE (2026-08-28)
    // (reordered 2026-08-30, rule 4 — the human removed the column-order toggle and fixed the story
    // BEHAVIOUR FIRST, so the header names its three cells in that one order now)
    await expect(story.locator('.sbwrap .sbhead .sbhc')).toHaveText(['behavior', 'schematic', 'proof'])
    // one row per phase: a drawn still (.sbframe svg), its beat text (.sbtext) and that beat's own
    // proof (.sbproof) — no standalone behavior grid, no single looping whole-drawing
    const rows = story.locator('.sbwrap .sbrow')
    await expect(rows).toHaveCount(2)                                     // given + one beat
    await expect(rows.nth(0)).toHaveClass(/bgiven/)
    await expect(rows.nth(0).locator('.sbframe .pcbox .camsub svg')).toHaveCount(1)  // the still is paired INSIDE the row
    await expect(rows.nth(0).locator('.sbtext')).toContainText('Given')
    await expect(rows.nth(0).locator('.sbproof')).toHaveCount(1)          // …and so is its proof cell
    await expect(rows.nth(1).locator('.sbtext')).toContainText('Then')
    await expect(rows.nth(1).locator('.sbtext')).toContainText('render in that view')   // the real Then text
    await expect(rows.nth(1).locator('.sbproof')).toHaveCount(1)
    await expect(story.locator('.sbwrap .behavior')).toHaveCount(0)       // a paired storyline has no plain grid
    await expect(story.locator('.sbwrap .viz svg')).toHaveCount(0)        // and no single whole-animation drawing here
    await expect(story).not.toContainText('no schematic drawn yet')
    await expect(story).not.toHaveClass(/isstale/)
    await expect(story).toHaveAttribute('data-vizhash', /.+/)
    await expect(story).not.toContainText('≠')
    // …and the AUTHORED PROSE IS ALWAYS SHOWN beneath the rows (the human, 2026-08-28): the
    // 'Full requirement' toggle is gone, so the text is readable with NO interaction at all — a
    // reader that hid half of it behind a chevron fails here, and there is no chevron to click.
    const prose = ov.locator('.fread .fbody')
    await expect(prose).toBeVisible()
    await expect(prose).toContainText('The detail header carries a toggle')
    await expect(ov.locator('.fread .prose-t')).toHaveCount(0)             // no fold control left…
    await expect(ov.locator('.fread > .ffoot button')).toHaveCount(0)      // …and nothing else in the footer either
    // NO TOGGLE (the human, 2026-08-26): storyboard and loop COMBINED — each row loops its OWN beat,
    // so there is no storyboard/loop switch and no separate whole-animation mode.
    await expect(story.locator('[data-sm]')).toHaveCount(0)
    // the GIVEN row is a state — a parked still (no data-loop). Every When->Then row LOOPS its beat:
    // it carries data-loop and its --ph is SCRUBBED across the beat's own time-window, so it MOVES
    // over time. This asserts the motion the old parked stills did not have.
    await expect(rows.nth(0).locator('.sbframe[data-loop]')).toHaveCount(0)   // given parked
    const beatFr = rows.nth(1).locator('.sbframe')
    await expect(beatFr).toHaveAttribute('data-loop', '1')
    // ONE STORY, ONE CLOCK (2026-08-29, the human: "same story order, comparable timing"). The beat's
    // drawing no longer runs a clock of its own: its PROOF cell loops the beat's harvested frames,
    // and the drawing parks on the scene each of those frames belongs to — so the two halves of a row
    // can never be showing different moments of the same beat. Proven by DRIVING it: the drawing
    // publishes one park point per scene (data-viz-subphases), the proof carries exactly one dot per
    // scene, and clicking a dot moves --ph to that scene's park point. (This replaces a wall-clock
    // sampler of --ph, which measured that the cell moved but not that it moved WITH anything — and
    // which now has to catch a stepper's hold to see motion at all. Deterministic, and it proves more.)
    const phOf = () => beatFr.evaluate(f => parseFloat((f as HTMLElement).style.getPropertyValue('--ph')))
    const sub = await beatFr.evaluate(f => String((f.querySelector('svg') || { getAttribute: () => '' })
      .getAttribute('data-viz-subphases') || '').split('|')[0].trim().split(/\s+/).map(Number))
    expect(sub.length, 'the drawing publishes a park point per scene of this beat').toBeGreaterThan(1)
    const pdots = rows.nth(1).locator('.sbproof .pdots .pd')
    await expect(pdots).toHaveCount(sub.length)          // both halves agree on how many scenes the beat has
    const slow = ov.locator('.fread > .fbar select.pspd')
    await slow.selectOption('0.25')                      // holds stretch, so a driven step is observable
    await pdots.nth(sub.length - 1).click()
    await expect.poll(phOf, { timeout: 8000 }).toBeCloseTo(sub[sub.length - 1], 2)
    await pdots.nth(0).click()
    await expect.poll(phOf, { timeout: 8000 }).toBeCloseTo(sub[0], 2)
    await slow.selectOption('1')
    // ONE reader bar, ONE speed (the human, 2026-08-28 — superseding the per-pane dropdowns): the
    // schematic frames, every beat cell's stepper and the video are views of the SAME beat, so they
    // play at one pace. Beside it, the COLUMN-ORDER pair, each button naming the order it produces.
    const fbar = ov.locator('.fread > .fbar')
    await expect(fbar).toHaveCount(1)
    const spdS = fbar.locator('select.pspd')
    await expect(spdS).toHaveCount(1)                                   // exactly one, for the whole reader
    await expect(ov.locator('.fread select.pspd')).toHaveCount(1)       // …and none anywhere else in it
    await expect(spdS).toHaveValue('1')
    await expect(spdS.locator('option')).toHaveText(['0.25×', '0.5×', '1×', '1.5×', '2×', '4×'])
    // RULE 4, 2026-08-30 — the CODE was right and this line was the wrong side, because the human
    // decided the toggle away: "remove the toggle of schematic first or behavior first, just always
    // be behaviour first". The bar carried a segmented column-order pair here; it does not any more,
    // so the assertion becomes the R8 assert-the-gone shape. (What the ONE fixed order guarantees —
    // the words leading every row, the header over the cell it names — is board R21's own
    // requirement, which asserts it in full.)
    // …and the reader's OTHER control, the play mode (board R20, the human 2026-08-30): auto ↔ step,
    // auto live. The column-order pair that stood here is gone (board R21) — scoped to the BAR,
    // never the whole reader, because R13's own authored prose still quotes the retired control by
    // name and the prose is the human's to reword (rule 5).
    await expect(fbar.locator('.medbar.pmode button')).toHaveText(['auto', 'step'])
    await expect(fbar.locator('.medbar')).toHaveCount(1)
    await expect(fbar).not.toContainText('schematic first')
    await expect(fbar).not.toContainText('behavior first')
    // A MULTI-BEAT requirement loops EVERY beat: R4 has 3 beats → given (parked) + 3 LOOPING rows
    await page.goto('/#/board/R4')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText('R4')
    const r4rows = ov.locator('.fread .fstory .sbwrap .sbrow')
    await expect(r4rows).toHaveCount(4)
    await expect(r4rows.locator('.sbframe .pcbox .camsub svg')).toHaveCount(4)
    await expect(r4rows.locator('.sbproof')).toHaveCount(4)              // every row carries its own proof cell
    await expect(r4rows.nth(1).locator('.sbtext')).toContainText('When')
    await expect(r4rows.nth(3).locator('.sbtext')).toContainText('Then')
    await expect(r4rows.nth(0).locator('.sbframe[data-loop]')).toHaveCount(0)         // given parked
    await expect(ov.locator('.fread .fstory .sbframe[data-loop]')).toHaveCount(3)     // three beats loop
    // (the honest placeholder a requirement with NO committed drawing keeps — the labelled beats,
    // never a wrong picture — is board R18's own requirement now, drafted 2026-08-28: the drawing is
    // a MIRROR of the real UI, so what happens when there is no measured layout to mirror belongs to
    // that requirement. Its assertions were moved out of here into the R18 test verbatim.)
    await page.goto('/#/board/R13')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText('R13')

    // THE PROOF on the RIGHT — the header NAMES the covering test (R13/R5, reworded 2026-08-25): a
    // pass/fail/none MARK, then the test's own name, then the wired Run + ⋯. No "THE PROOF" label, no
    // "proven by", no unit/flow badge, no "+N more cover it".
    await expect(ov.locator('.feval .fphead')).toBeVisible()
    await expect(ov.locator('.feval .fptop .fpname')).not.toBeEmpty()                 // the covering test's name heads the proof
    await expect(ov.locator('.feval .fptop .fpm')).toHaveClass(/\b(pass|fail|none)\b/) // the honesty mark leads it
    await expect(ov.locator('.feval .fpby')).toHaveCount(0)                           // the old PROVEN BY proof line is gone
    await expect(ov.locator('.feval .fprun')).toHaveCount(0)          // no separate "last run" line any more
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
    // Task 16 #1: the video button exists only for a COMMITTED video — whether THIS requirement is
    // covered by its screen's primary recording is harvest state, so the toolbar legs below force
    // the baked video attributes on (the same deterministic technique as the forced status; the
    // real committed artifact is pinned by the R14 test's leg (a))
    await dt.locator(`.reqpane .req[data-r="${evId}"]`).evaluate(el => {
      el.setAttribute('data-ev-video', 'spec/board/evidence/stub-committed.webm')
      el.setAttribute('data-ev-vwin', '2000:4000')
    })
    const force = (rid: string, st: string) =>
      dt.locator(`.reqpane .req[data-r="${rid}"]`).evaluate((el, s) => el.setAttribute('data-status', s), st)
    const reopen = async (rid: string) => {    // hash-route away and back so the reader rebuilds
      await page.goto('/#/board/' + (rid === 'R2' ? 'R3' : 'R2'))
      await page.goto(`/#/board/${rid}`)
      await expect(ov.locator('.fread .frmeta .fid')).toHaveText(rid)
    }

    // PASSED → the per-beat PROOF CELLS carry the harvest (the human, 2026-08-28: the frames moved
    // onto the rows they belong to), and the band beneath them carries only what belongs to the
    // WHOLE requirement — the covering test's bar and ONE video. The stills · gif · video toolbar
    // and its stored preference went with the split: there is no pane-wide mode left to remember.
    await force(evId!, 'passed')
    await reopen(evId!)
    const media = ov.locator('.feval .fmedia')
    await expect(media).toHaveCount(1)
    // the band header reads `<test name> · proves R<n> · run <id>` — the run id is the covering
    // test's newest record's commit
    await expect(media.locator('.fmbar .fmname')).not.toBeEmpty()
    await expect(media.locator('.fmbar')).toContainText('proves ' + evId)
    await expect(media.locator('.fmbar .frun')).toHaveText(/^run \S+$/)
    await expect(media.locator('.medbar')).toHaveCount(0)            // no pane toolbar any more…
    await expect(media.locator('.fmpanel[data-m]')).toHaveCount(0)   // …and no named panes behind it
    expect(await page.evaluate(() => localStorage.getItem('sbFocusMedia')),
      'no pane-wide media preference is stored any more').toBeNull()
    // the ONE video for the whole requirement, seeked to this requirement's moment
    const vidPanel = media.locator('.fmpanel', { has: page.locator('.frecwrap') })
    await expect(vidPanel.locator('video')).toHaveCount(1)
    await expect(vidPanel.locator('.fvlab')).toContainText('the full flow that proves this')

    // THE BEAT'S OWN PROOF CELL — Task 13's frame-stepper, moved onto the row it proves. It AUTO-RUNS
    // (the human, 2026-08-28): the beat's before → after loops on the reader's shared speed, exactly
    // as the schematic beside it loops that beat's motion, with ONE dot per frame, the mono n / N
    // count and dot-click jump. There is NO mode switch: the loop is the only mode a proof cell has
    // (the human, 2026-08-28 — a toolbar over two frames asked a question nobody had).
    const proofCells = ov.locator('.fread .fstory .sbrow .sbproof')
    const playCell = proofCells.filter({ has: page.locator('.pcplay') }).first()
    await expect(playCell).toHaveCount(1)          // a harvested beat plays; a row with no frames says so
    const stepper = playCell.locator('.pcplay .fsteps-wrap')
    const frameN = await stepper.locator('.fsteps img').count()
    expect(frameN, "the beat's harvested pair at least — a loop needs frames to play").toBeGreaterThan(1)
    // the frames are fetched EAGERLY (release pass M-1): they stack display:none, and a lazy img
    // is never fetched while hidden — the first loop at 4× flashed blank. Every frame has decoded
    // (natural width — a positive, not an attribute's absence) well before the loop shows it
    await expect.poll(() => stepper.locator('.fsteps img').evaluateAll(
      (els: HTMLImageElement[]) => els.every(i => i.complete && i.naturalWidth > 0)), { timeout: 1000 }).toBe(true)
    // EXACT dots: one per frame, and the count spelled out beside them in mono
    await expect(stepper.locator('.pdots .pd')).toHaveCount(frameN)
    await expect(stepper.locator('.fstepn')).toHaveText(new RegExp(`^\\d+ / ${frameN}$`))
    // the loop is the ONLY mode: no mode toolbar in the cell at all, and it is already running
    await expect(playCell.locator('.pcmodes')).toHaveCount(0)
    await expect(stepper).toBeVisible()
    // 0.25× BEFORE the dot jump, so nothing can race the auto-advance (every hold is 4× long)
    await spdS.selectOption('0.25')
    await stepper.locator('.pdots .pd').last().click()
    await expect(stepper.locator('.pdots .pd').last()).toHaveClass(/\bcur\b/)
    await expect(stepper.locator('.fstepn')).toHaveText(`${frameN} / ${frameN}`)
    await expect(stepper.locator('.fsteps img.on')).toHaveCount(1)
    // the CURRENT dot advances LIVE at the reader's ONE chosen pace. 4× bounds every hold at ~1.5s,
    // so the count must move within seconds — REAL timers + polling, argued: Playwright's fake clock
    // would also freeze the board's own SSE/fold timers this very screen is proving, and a fast real
    // pace makes the wait bounded without touching them.
    await spdS.selectOption('4')
    const stepAt = await stepper.locator('.fstepn').textContent()
    await expect.poll(() => stepper.locator('.fstepn').textContent(), { timeout: 15000 }).not.toBe(stepAt)
    await spdS.selectOption('1')
    // THE SHARED CAMERA (the human, 2026-08-28): where the harvest recorded a focus box, the row's
    // proof and the drawing beside it are aimed at the SAME region by ONE toggle, so the two halves
    // of a row can never end up framing different things. (No focus box in the harvest ⇒ no toggle:
    // the cells stay honestly full-frame rather than inventing a crop.)
    const zoomRow = ov.locator('.fread .fstory .sbrow').filter({ has: page.locator('.pczoom') }).first()
    const zoomBtn = playCell.locator('.pczoom')
    if (await zoomRow.count()) {
      const zoomedPair = () => zoomRow.evaluate(el => [
        !!el.querySelector('.sbproof .pcbox.zoomed'), !!el.querySelector('.sbframe .pcbox.zoomed')])
      await expect(zoomRow.locator('.pczoom')).toContainText('full frame')   // zoom is the default
      await zoomRow.locator('.pczoom').click()
      expect(await zoomedPair(), 'full frame drops BOTH cells of the row together').toEqual([false, false])
      await expect(zoomRow.locator('.pczoom')).toContainText('zoom to the component')
      await zoomRow.locator('.pczoom').click()
      const back = await zoomedPair()
      expect(back[0], 'the drawing and the proof are aimed together, never one alone').toBe(back[1])
      await expect(zoomRow.locator('.pczoom')).toContainText('full frame')
    }
    // the frame ON SHOW is still a real frame you can open: clicking it puts THAT frame in the
    // shared lightbox. Read at FULL FRAME, so the click lands on the whole image rather than on a
    // camera-transformed sliver.
    const zoomedNow = !!(await zoomBtn.count()) && ((await zoomBtn.textContent()) || '').includes('full frame')
    if (zoomedNow) await zoomBtn.click()
    const shown = stepper.locator('.fsteps img.on')
    await expect(shown).toHaveCount(1)
    const stillSrc = (await shown.getAttribute('src'))!
    await shown.click()
    await expect(page.locator('#lb')).toBeVisible()
    expect((await page.locator('#lbimg').getAttribute('src'))!, 'the zoom shows the frame that was playing')
      .toContain(stillSrc.split('?')[0].split('/').pop()!)
    await page.locator('#lbclose').click()
    if (zoomedNow) await zoomBtn.click()

    // FAILED → the failed mark on the band, and the failing run's own frames beneath it. The stills
    // are the NEWEST record's (D3): its own frames when the last run of this test was a recorded
    // one, else the harvested red after-frame — the framed branch is pinned by R14 (1b) on a stub
    // record, so here only the frameless branch asserts the exact red-frame cell.
    await force(evId!, 'failed')
    await reopen(evId!)
    await expect(media.locator('.fmbar .fpv.fail')).toContainText('✗')
    const failStrip = media.locator('.fmpanel', { has: page.locator('.fstrip') })
    // positive either way (review A-2): the newest record's own strip renders under the mark, or the
    // harvested red after-frame does — exactly one of the two, never a bare absence
    const rfCells = failStrip.locator('.fcell.rf')
    if (await rfCells.count() > 0) {
      await expect(rfCells.first()).toBeVisible()
      await expect(rfCells.first().locator('img')).toHaveCount(1)
      await expect(failStrip.locator('.fcell:not(.rf).hotbad')).toHaveCount(0)
    } else {
      await expect(failStrip.locator('.fcell.hotbad')).toHaveCount(1)
      await expect(failStrip.locator('.fcell.hotbad')).toBeVisible()
    }

    // CHANGED → the last proof media under a pinned-era watermark
    await force(evId!, 'changed')
    await reopen(evId!)
    await expect(media.locator('.fmbar')).toContainText('pinned era')
    await expect(media.locator('.wmark')).toBeVisible()
    await expect(media.locator('.wmark')).toContainText('re-run to re-verify')

    // UNTESTED → no media at all: the band reads the honest line and offers the next move, which
    // opens the add-test prompt with this requirement pre-picked (R15 behavior, unchanged)
    await force(evId!, 'untested')
    await reopen(evId!)
    await expect(media.locator('.fmpanel')).toHaveCount(0)   // no frames, no video — nothing to show
    await expect(media.locator('.noev')).toContainText('no proof yet')
    await media.locator('.noev button').click()
    await expect(page.locator('#promptsheet')).toHaveClass(/\bon\b/)
    await expect(page.locator('#promptbody')).toContainText('spec/board/test.spec.ts')
    await page.locator('#promptsheet [data-promptclose]').click()
    await force(evId!, 'passed')   // leave the forced node in a media-bearing state for later reads

    // the pager IS the map (board R17, the human 2026-08-23): every requirement is a dot — the
    // window-and-ellipsis pager of Task 8 is gone, since a map that hides entries is not a map
    const dots = dt.locator('.dtfoot .fdots .fdot')
    await expect(dots).toHaveCount(reqCount)
    // first and last in prd order — read off the baked rows, since families (board R17) order
    // sections by family, so the last id is no longer R<N>
    const firstRid = await dt.locator('.reqpane .req').first().getAttribute('data-r')
    const lastRid = await dt.locator('.reqpane .req').last().getAttribute('data-r')
    await expect(dots.first()).toHaveAttribute('title', new RegExp(`^${firstRid} `))
    await expect(dots.last()).toHaveAttribute('title', new RegExp(`^${lastRid} `))
    await expect(dt.locator('.dtfoot .fdotgap')).toHaveCount(0)
    const firstId = (await ov.locator('.fread .frmeta .fid').textContent())!.trim()
    await dt.locator('.dtfoot .fnav.next').click()
    await expect(ov.locator('.fread .frmeta .fid')).not.toHaveText(firstId)
    // the mockup's pager: the hint at the right, 30px pages, the current page ringed in ink (NOT
    // inverted — Run all is the detail's one inverted element, the design system's rule; the mockup's
    // sumi fill is a listed divergence), and ← → paging one requirement at a time from the keyboard
    await expect(dt.locator('.dtfoot .fpk')).toHaveText('← → to review one by one')
    const curDot = dt.locator('.dtfoot .fdot.cur')
    expect(await curDot.evaluate(el => getComputedStyle(el).borderColor)).toBe('rgb(28, 27, 24)')
    expect(await curDot.evaluate(el => el.getBoundingClientRect().height)).toBe(30)
    // rule 2 (review B-3): computed, not inline — a CSS-inverted current page must fail this
    expect(await curDot.evaluate(el => getComputedStyle(el).backgroundColor), 'the current page is not inverted').toBe('rgba(0, 0, 0, 0)')
    expect(await dt.locator('.btn.pri').count(), 'Run all is the detail\'s one inverted element').toBe(1)
    const secondId = (await ov.locator('.fread .frmeta .fid').textContent())!.trim()
    await page.keyboard.press('ArrowLeft')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(firstId)
    await page.keyboard.press('ArrowRight')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(secondId)

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
    await expect(open13.locator('.fread .fstory .sbrow')).toHaveCount(2)  // the storyline leads here too (given + 1 beat)
    await expect(open13.locator('.fread .fstory .sbframe .pcbox .camsub svg')).toHaveCount(2) // each row's drawn still, in place too
    await expect(open13.locator('.fread .fstory .sbhead .sbhc')).toHaveCount(3)   // …under the same three column names
    await expect(open13.locator('.fread .fbody')).toBeVisible()          // and the prose in full, no toggle
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

    // The proof header's MARK is COVERAGE-honest (board R4/R3): a ✓ (pass) only for a Passed
    // requirement, a ✗ (fail) under a failed run — the honesty cue that replaced the "proven by /
    // covered by" WORD when the header became the covering test's name (2026-08-25). Same forced-status
    // technique as above; the coverage tags stay real, so the header resolves a genuine covering test.
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
    await expect(dt.locator('.focusov .feval .fptop .fpm')).toHaveClass(/\bpass\b/)   // ✓ — proven
    await page.goto(`/#/board/${otherId}`)
    await expect(dt.locator('.focusov .fread .frmeta .fid')).toHaveText(otherId!)
    await expect(dt.locator('.focusov .fread .frmeta .fchip')).toHaveClass(/\bfailed\b/)
    await expect(dt.locator('.focusov .feval .fptop .fpm')).toHaveClass(/\bfail\b/)   // ✗ — a failed run never reads as green
    await expect(dt.locator('.focusov .feval .fptop .fpm')).not.toHaveClass(/\bpass\b/)
  })
})

// ── THE STORYLINE READER'S OWN REQUIREMENTS (R18–R21, drafted 2026-08-28 on the human's behalf from
// the redesign they ordered and reviewed this session) ────────────────────────────────────────────
// The four behaviours below were built and asserted inside the R13 test above; giving them their own
// ids means giving them their own PROOF, so the assertions that belong to each were MOVED here, not
// copied — a requirement proven under somebody else's tag is not proven at all (R4/R6). What is new
// is what the split exposed: R19's camera equality, R20's already-running loop, R21's persistence.
import { parseBehavior } from '../../tools/behavior.mjs'

// The board's own harvested SPECIMENS: a requirement whose beats were photographed WITH their layout
// skeletons and whose mirror drawing is committed beside them, in a form that splits beat by beat
// (phases = beats + 1, which is what pairs a drawing to the rows). Read off the fold and the tree, so
// these tests follow the harvest rather than pinning one id forever.
const mirrorSpecimens = () => {
  const idx = JSON.parse(readFileSync('spec/_results-index.json', 'utf8'))
  const ev = (idx.board && idx.board.evidence) || {}
  const out: Array<{ rid: string, beat: any, svg: string }> = []
  for (const rid of Object.keys(ev)) {
    const beat = ((ev[rid] || {}).beats || [])[0]
    const file = 'spec/board/viz/' + rid + '.svg'
    if (!beat || !beat.before || !beat.after || !beat.layoutBefore) continue
    if (!existsSync(file) || !existsSync(beat.layoutBefore)) continue
    const svg = readFileSync(file, 'utf8')
    const phases = (/data-viz-phases="([^"]*)"/.exec(svg) || ['', ''])[1].split(/\s+/).filter(Boolean)
    const beats = Number((/data-viz-beats="(\d+)"/.exec(svg) || ['', '0'])[1])
    if (!beats || phases.length !== beats + 1) continue
    out.push({ rid, beat, svg })
  }
  return out
}
// the requirement's authored beats, read straight from the prd — the oracle for what BOTH sides of a
// row must be saying (parseBehavior is the same parser the board and the viz pass each use, read
// here independently of either render)
const prdBeats = (rid: string) => {
  const md = readFileSync('spec/board/prd.md', 'utf8')
  const i = md.indexOf('\n## ' + rid + ' — ')
  if (i < 0) return null
  const j = md.indexOf('\n## ', i + 1)
  return parseBehavior(md.slice(i, j < 0 ? undefined : j)) as
    { given: string, beats: Array<{ when: string, then: string }> } | null
}
const plain = (s: string) => String(s || '').replace(/[`*]/g, '').replace(/\s+/g, ' ').trim()

// Board R18 — THE SCHEMATIC MIRRORS THE REAL UI. The drawn half of a row is derived from the app's
// own measured layout (the skeleton captured beside every evidence frame), not from the shape of the
// sentence — which is what makes a row a comparison instead of an illustration. And where no layout
// was ever measured, the board draws NOTHING rather than a guess.
test('The schematic mirrors the real UI — the app\'s own measured layout, or honestly no picture', async ({ page }) => {
  await coverReqs('R18')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  const ov = dt.locator('.focusov')

  // beat 1 — a HARVESTED requirement's drawing IS its page. The oracle is the harvest itself: the
  // fold names the layout skeleton each beat was measured from, and the committed drawing must carry
  // that geometry. An archetype kit — a fixed handful of shapes, no layout pin, no relation to the
  // measured page — fails every line of this.
  await checkReq('R18', async () => {
    const spec = mirrorSpecimens()[0]
    expect(spec, 'a board requirement harvested WITH its layout skeleton, drawing committed').toBeTruthy()
    const layout = JSON.parse(readFileSync(spec.beat.layoutBefore, 'utf8'))
    expect(layout.w, 'the skeleton records the viewport it was measured in').toBeGreaterThan(0)
    await page.goto('/#/board/' + spec.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(spec.rid)
    const svg = ov.locator('.fread .fstory .sbwrap .sbrow .sbframe .pcbox .camsub svg').first()
    await expect(svg, 'the drawing pairs beat by beat, so every row carries its own frame').toHaveCount(1)
    await reveal(svg)
    // the MARKS of the mirror, read off the board's own rendered drawing (not the file)
    await expect(svg).toHaveAttribute('data-viz-kind', 'wireframe')
    await expect(svg).toHaveAttribute('data-viz-layout', /^[0-9a-f]{16}$/)   // the geometry's own pin
    await expect(svg).toHaveAttribute('aria-label', /the app.s own layout/)
    await hudCheck('the drawing is derived from the app\'s layout', 'ui-mirror',
      await svg.getAttribute('data-viz-archetype'))
    // …and it is TIED to the measurement, two ways. (a) the frame is the measured VIEWPORT: 600 wide
    // at the page's own aspect (tools/viz.mjs clamps the height into 180…900).
    const wantH = Math.round(Math.min(900, Math.max(180, 600 * (layout.h / layout.w))))
    await hudCheck('…at the measured viewport\'s own aspect', '0 0 600 ' + wantH,
      await svg.getAttribute('viewBox'))
    // (b) the drawing carries the measured page BOX FOR BOX: one shape per drawable element, give or
    // take the kinds that merge or drop. A drawing derived from the sentence has no such relation —
    // its shape count is a property of the archetype, not of this page.
    const S = 600 / layout.w
    const px = (v: number) => Math.round(v * S * 10) / 10
    const drawable = (layout.els || []).filter((e: any) => px(e.w) >= 4 && px(e.h) >= 2.5).length
    expect(drawable, 'the skeleton measured a real page, not a stub').toBeGreaterThan(20)
    const shapes = await svg.evaluate(el => {
      const g = el.querySelector('.wf0') || el.querySelector('g')
      return g ? g.children.length : 0
    })
    expect(shapes, 'the drawing carries the measured page, box for box — not a fixed archetype kit')
      .toBeGreaterThan(drawable * 0.4)
    expect(shapes, 'and it draws THIS page, not an inflated one').toBeLessThan(drawable * 3)
  })

  // beat 2 — NO LAYOUT, NO PICTURE (moved here verbatim from the R13 test, 2026-08-28: the honest
  // placeholder is what the MIRROR does when there is nothing to mirror, so it belongs to R18).
  // FORCED through the real pipeline: the ui-mirror pass draws every harvested requirement, so no
  // live specimen lacks a drawing — serve board.html with one requirement's baked schematic stripped
  // and let the client parse it as drawing-less, end to end.
  await checkReq('R18', async () => {
    // the DOCUMENT itself is served at '/' (the static server maps it to board.html), so match both —
    // a '**/board.html' pattern alone lets the reload sail past the stub
    const stripR2 = (u: URL) => u.pathname === '/' || u.pathname === '/board.html'
    await page.route(stripR2, async rt => {
      const res = await rt.fetch(); const html = await res.text()
      // scope to THE BOARD SCREEN's R2 — every screen on this board has an R2 of its own
      const scr = html.indexOf('data-screen="board"')
      const i = html.indexOf('data-r="R2"', scr); const j = html.indexOf('data-r="R3"', i)
      const seg = html.slice(i, j).replace(/<figure class="schematic"[\s\S]*?<\/figure>/, '')
      await rt.fulfill({ body: html.slice(0, i) + seg + html.slice(j), contentType: 'text/html' })
    })
    await page.goto('/#/board/R2')
    await page.reload()
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText('R2')
    const r2story = ov.locator('.fread .fstory')
    await reveal(r2story)
    await expect(r2story).toContainText('no schematic drawn yet')
    await expect(r2story.locator('.sbframe svg')).toHaveCount(0)         // no picture where none was drawn
    await expect(r2story.locator('.sbframe .noschem').first()).toBeVisible()
    await expect(r2story.locator('.sbrow .sbtext .sbstep').first()).toBeVisible()   // the labelled beats still show
    await expect(r2story.locator('.sbrow').first().locator('.sbtext')).toContainText('Given')
    await page.unroute(stripR2)                          // syncDerived's later fetches read the true board
  })
})

// Board R19 — A BEAT ROW IS A COMPARISON. The two cells are the same view of the same moment: one
// camera aims both, and both carry that beat's own words. The Given row is the context row and
// carries neither.
//
// The FOCUS RECT is the one piece of the harvest the board's own suite does not produce on every
// beat: tools/evidence.mjs lifts it from the ring the run painted, and a check that never calls
// reveal() rings nothing. So it is forced onto the real row here — the established deterministic
// technique used all through this file — with the frames, the windows and the layouts left real.
const FOCUS = { x: 500, y: 300, w: 240, h: 80, vw: 1440, vh: 900 }
const armFocus = async (dt: any, rid: string) =>
  dt.locator(`.reqpane .req[data-r="${rid}"]`).evaluate((el: Element, focus: any) => {
    const beats = JSON.parse(el.getAttribute('data-ev-beats') || '[]')
    const b1 = beats.filter((b: any) => Number(b.n) === 1)[0]
    if (!b1) return null
    if (!b1.focus) b1.focus = focus
    el.setAttribute('data-ev-beats', JSON.stringify(beats))
    return b1.focus
  }, FOCUS)
// the region a camera box actually frames, read back OUT of its own transform, as a fraction of the
// media it frames — which is the whole page on both sides, so the two cells are comparable even
// though one is a drawing at its own viewBox and the other a screenshot at its own pixel size
const framedRegion = (box: any) => box.evaluate((el: Element) => {
  const sub = (el.querySelector('.fsteps img.on') || el.querySelector('.camsub')) as HTMLElement
  if (!sub) return null
  const t = getComputedStyle(sub).transform
  if (!t || t === 'none') return null
  const m = new DOMMatrixReadOnly(t)
  const mw = sub.offsetWidth; const mh = sub.offsetHeight; const s = m.a
  if (!(mw > 0 && mh > 0 && s > 0)) return null
  return {
    x: -m.e / (s * mw), y: -m.f / (s * mh),
    w: (el as HTMLElement).clientWidth / (s * mw), h: (el as HTMLElement).clientHeight / (s * mh)
  }
})

test('A beat row is a comparison — one camera on one region, one beat in both cells', async ({ page }) => {
  await coverReqs('R19')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  const ov = dt.locator('.focusov')
  const spec = mirrorSpecimens()[0]
  expect(spec, 'a board requirement harvested with a beat pair and a mirror drawing').toBeTruthy()

  // beat 1 — ONE CAMERA, ONE REGION. Both cells zoom together, and the rectangle each one actually
  // frames — computed back out of its own transform — is the same fraction of the same page, aimed
  // at the focused component. Aim one cell somewhere else and this fails.
  await checkReq('R19', async () => {
    const focus = await armFocus(dt, spec.rid)
    expect(focus, 'the requirement carries a harvested beat to frame').toBeTruthy()
    // a hash hop REBUILDS the reader off the forced attribute; a goto to the URL the page is already
    // on would reload and wipe it, so the hop always lands somewhere else first
    await page.goto('/#/board/' + (spec.rid === 'R2' ? 'R3' : 'R2'))
    await page.goto('/#/board/' + spec.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(spec.rid)
    const row = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1)     // beat 1's own row
    await reveal(row)
    const drawn = row.locator('.sbframe .pcbox')
    const shot = row.locator('.sbproof .pcbox')
    await expect(drawn).toHaveClass(/\bzoomed\b/)
    await expect(shot).toHaveClass(/\bzoomed\b/)
    // the frames must have DECODED before their laid-out height means anything
    await expect.poll(() => row.locator('.sbproof .fsteps img').evaluateAll(
      (els: HTMLImageElement[]) => els.length > 0 && els.every(i => i.complete && i.naturalWidth > 0)),
    { timeout: 5000 }).toBe(true)
    const a = await framedRegion(drawn)
    const b = await framedRegion(shot)
    expect(a, 'the drawing is under a camera').toBeTruthy()
    expect(b, 'and so is the proof').toBeTruthy()
    for (const k of ['x', 'y', 'w', 'h'] as const) {
      expect(Math.abs(a[k] - b[k]), `the drawing and the proof frame the same region (${k})`).toBeLessThan(0.03)
    }
    // …and that region is aimed at the FOCUSED COMPONENT: the ringed box's centre lies inside both
    const cx = (focus.x + focus.w / 2) / focus.vw
    const cy = (focus.y + focus.h / 2) / focus.vh
    for (const [name, r] of [['the drawing', a], ['the proof', b]] as Array<[string, any]>) {
      expect(cx > r.x && cx < r.x + r.w, name + ' is aimed at the focused component (x)').toBe(true)
      expect(cy > r.y && cy < r.y + r.h, name + ' is aimed at the focused component (y)').toBe(true)
    }
    await hudCheck('one camera, one region', 'same region', Math.abs(a.x - b.x) < 0.03 && Math.abs(a.w - b.w) < 0.03 ? 'same region' : 'two regions')
  })

  // beat 2 — ONE BEAT, BOTH SIDES. The row's words and the drawing beside them are two derivations
  // of ONE prd sentence (the board's render, and the viz pass's), so they must not disagree; and the
  // Given row carries the Given alone — whole page, no beat, no camera control.
  await checkReq('R19', async () => {
    const beh = prdBeats(spec.rid)
    expect(beh && beh.beats.length > 0, spec.rid + ' must carry a behavior block').toBe(true)
    const story = ov.locator('.fread .fstory')
    // a drawing whose text has moved past its pin is a DIFFERENT beat — it reads grey and waits for
    // the viz pass; a comparison cannot be made against it, so the row demands a fresh one
    await expect(story, 'the drawing is fresh — a stale one draws another beat').not.toHaveClass(/\bisstale\b/)
    const row = story.locator('.sbwrap .sbrow').nth(1)
    await reveal(row.locator('.sbtext'))
    const words = plain(await row.locator('.sbtext').innerText())
    expect(words, 'the row shows the prd\'s own When').toContain(plain(beh!.beats[0].when))
    expect(words, '…and its own Then').toContain(plain(beh!.beats[0].then))
    // the DRAWING carries the same beat — viz.mjs writes each beat's When → Then into the picture it
    // draws and into the label that names it, derived from the prd independently of the board's render
    const label = plain((await row.locator('.sbframe .pcbox .camsub svg').getAttribute('aria-label')) || '')
    expect(label, 'the drawing is labelled with the very beat the words say')
      .toContain(plain('beat 1: ' + beh!.beats[0].when + ' → ' + beh!.beats[0].then))
    // …and the drawn CALLOUT is the current small step, one sentence per scene (the human,
    // 2026-08-30). Added here because this is the requirement that owns "the words agree across the
    // row": a card that stacked the title, the When AND the Then said three things at a moment when
    // only one of them was true, and the burn-in beside it said a different one. So: every scene of
    // the drawing that carries a callout carries exactly ONE of the two labels, and none of them
    // carries the requirement's title.
    // …and the THIRD surface — the card burned into the recording the proof frames are cut from —
    // is on the SAME beat and says the SAME one line. This is the leg that catches the drift R19
    // exists to forbid: until 2026-08-30 the drawing said the When alone mid-beat while the burn-in
    // already claimed the Then, and both stacked the requirement title on top of it. Recording-gated
    // like every other assertion about the burn-in (spec/_base.ts paints nothing without one), and
    // the else-branch keeps its own power: nothing may be injected into the page at all.
    //
    // (Asserted on the BURNED card rather than the drawn one on purpose: the board's own harvest
    // records no ring — its specs read the page with reveal(), not proveVisible() — so its committed
    // drawings carry no overlay to read a card off. The DRAWN side of the same rule is pinned where
    // it can actually fail, in tools/viz.test.mjs, against a harvest that has one.)
    await reveal(row.locator('.sbtext'))
    const call19 = page.locator('#__specboard-focus .sb-call')
    if (process.env.BOARD_RECORD) {
      await expect(call19).toBeVisible()
      const said = plain(await call19.innerText())
      // this is the SECOND checkReq('R19') of the test, so the callout has advanced to R19's second
      // beat — BEAT_CURSOR counts checkReq calls per id (spec/_base.ts), clamped to the last
      const bs19 = prdBeats('R19')!.beats
      const b19 = bs19[Math.min(1, bs19.length - 1)]
      expect(said, 'the burned card names the requirement').toContain('R19')
      expect(said, 'and carries this beat\'s own When, mid-assertion').toContain(plain(b19.when))
      expect(said.includes(plain(b19.then)), 'and NOT the Then — one sentence, the current step').toBe(false)
      const titleR19 = (await dt.locator('.reqpane .req[data-r="R19"] .rt').textContent() || '').trim()
      expect(said.includes(plain(titleR19)), 'and no requirement title — the id chip is the whole tag').toBe(false)
      await hudCheck('one sentence per scene', 'the When alone', said.includes(plain(b19.then)) ? 'both lines' : 'the When alone')
    } else {
      await expect(page.locator('#__specboard-focus')).toHaveCount(0)
    }
    // THE GIVEN ROW — the context row: the whole page on both sides, the Given alone, no camera toggle
    const given = story.locator('.sbwrap .sbrow').first()
    await expect(given).toHaveClass(/\bbgiven\b/)
    await expect(given.locator('.sbtext .sbk')).toHaveCount(1)
    await expect(given.locator('.sbtext .sbk')).toContainText('Given')
    await expect(given.locator('.pcbox.zoomed')).toHaveCount(0)      // whole page, both cells
    await expect(given.locator('.pczoom')).toHaveCount(0)            // and nothing to aim
  })
})

// Board R20 — THE PROOF PLAYS ITSELF. One mode, no toolbar, already running, zoomed onto the focus
// with the whole frame one toggle away; and the Given row, which has one frame and nothing to loop,
// stays the captioned still it is.
test('The proof plays itself — already looping, zoomed, the whole frame one toggle away', async ({ page }) => {
  await coverReqs('R20')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  const ov = dt.locator('.focusov')
  const spec = mirrorSpecimens()[0]
  expect(spec, 'a board requirement harvested with a beat pair').toBeTruthy()

  await checkReq('R20', async () => {
    await armFocus(dt, spec.rid)
    await page.goto('/#/board/' + (spec.rid === 'R2' ? 'R3' : 'R2'))   // hop, so the reader rebuilds
    await page.goto('/#/board/' + spec.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(spec.rid)
    const row = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1)
    const cell = row.locator('.sbproof')
    await reveal(cell)
    // NO MODE SWITCH EXISTS — not a mode that defaults to the loop: there is no toolbar in the cell
    await expect(cell.locator('.pcmodes')).toHaveCount(0)
    const stepper = cell.locator('.pcplay .fsteps-wrap')
    await expect(stepper).toBeVisible()
    const frameN = await stepper.locator('.fsteps img').count()
    expect(frameN, 'the beat harvested a pair — a loop needs frames to play').toBeGreaterThan(1)
    await expect(stepper.locator('.pdots .pd')).toHaveCount(frameN)
    await expect(stepper.locator('.fstepn')).toHaveText(new RegExp(`^\\d+ / ${frameN}$`))
    // ALREADY RUNNING: nothing has been clicked, and the count moves on its own at the reader's one
    // speed. 4× bounds every hold at ~1.5s, so the wait is bounded — real timers, because a fake
    // clock would freeze the board's own SSE/fold timers this very screen is proving.
    const spd = ov.locator('.fread > .fbar select.pspd')
    await spd.selectOption('4')
    const at = await stepper.locator('.fstepn').textContent()
    await expect.poll(() => stepper.locator('.fstepn').textContent(), { timeout: 15000 }).not.toBe(at)
    await spd.selectOption('1')
    // ZOOMED BY DEFAULT — and the whole frame is exactly ONE toggle away, and one toggle back
    const zb = cell.locator('.pczoom')
    await expect(zb).toContainText('full frame')                 // i.e. it is zoomed right now
    await expect(row.locator('.pcbox.zoomed')).toHaveCount(2)    // the drawing and the proof together
    await zb.click()
    await expect(row.locator('.pcbox.zoomed')).toHaveCount(0)
    await expect(zb).toContainText('zoom to the component')
    await hudCheck('the whole frame is one toggle away', '0 zoomed cells',
      (await row.locator('.pcbox.zoomed').count()) + ' zoomed cells')
    await zb.click()
    await expect(row.locator('.pcbox.zoomed')).toHaveCount(2)
  })

  // the GIVEN row is a STATE, not an action: one frame, so nothing to loop and nothing to step
  await checkReq('R20', async () => {
    const given = ov.locator('.fread .fstory .sbwrap .sbrow').first()
    await reveal(given.locator('.sbproof'))
    await expect(given.locator('.sbproof .pcplay')).toHaveCount(0)
    await expect(given.locator('.sbproof .fsteps-wrap')).toHaveCount(0)
    await expect(given.locator('.sbproof .pcstrip .pcfig img')).toHaveCount(1)   // the one still
    await expect(given.locator('.sbproof .pccap')).not.toBeEmpty()               // captioned, honestly
  })

})

// Board R20, second half — AUTO ↔ STEP (the human, 2026-08-30: "add a display mode for the small
// steps — now it only has auto play; enable click to go to the next small step"). The loop stays the
// DEFAULT — that is the sentence R20 already carries, and the test above proves it still runs with
// nothing clicked. Beside it, ONE reader-wide control holds the story still so a person can walk a
// beat a scene at a time, both cells together. Its own test, not another beat of the one above: the
// walk is real waiting (a held loop can only be proven by watching it not move) and it deserves its
// own clock rather than eating that test's.
test('The proof steps on click — auto is still the default, and step holds the story', async ({ page }) => {
  await coverReqs('R20')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  const ov = dt.locator('.focusov')
  const spec = mirrorSpecimens()[0]
  expect(spec, 'a board requirement harvested with a beat pair').toBeTruthy()

  await checkReq('R20', async () => {
    await armFocus(dt, spec.rid)
    await page.goto('/#/board/' + (spec.rid === 'R2' ? 'R3' : 'R2'))   // hop, so the reader rebuilds
    await page.goto('/#/board/' + spec.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(spec.rid)
    const bar = ov.locator('.fread > .fbar')
    const mode = bar.locator('.medbar.pmode')
    const row = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1)
    const cell = row.locator('.sbproof')
    const stepper = cell.locator('.pcplay .fsteps-wrap')
    await reveal(mode)
    await expect(mode.locator('button')).toHaveText(['auto', 'step'])
    await expect(mode.locator('button.on')).toHaveText('auto')      // the loop is still the default
    // the drawing's own park points — one per scene of this beat, the same list the loop steps
    const sub = await row.locator('.sbframe').evaluate(f => String((f.querySelector('svg') || { getAttribute: () => '' })
      .getAttribute('data-viz-subphases') || '').split('|')[0].trim().split(/\s+/).map(Number))
    expect(sub.length, 'the drawing publishes a park point per scene of this beat').toBeGreaterThan(1)
    const phOf = () => row.locator('.sbframe').evaluate(f => parseFloat((f as HTMLElement).style.getPropertyValue('--ph')))
    const nOf = async () => Number(((await stepper.locator('.fstepn').textContent()) || '0 / 0').split('/')[0].trim())
    const spd = bar.locator('select.pspd')
    await spd.selectOption('4')            // 4× bounds every hold at ~1.5s, so "did not move" is a real wait

    // STEP HOLDS. Nothing clicked, three seconds at 4× — time for two hops in auto — and the counter
    // has not moved. Real timers, because a fake clock would freeze the board's own fold timers.
    await mode.locator('button', { hasText: 'step' }).click()
    await expect(mode.locator('button.on')).toHaveText('step')
    const held = await nOf()
    await page.waitForTimeout(3000)
    expect(await nOf(), 'in step mode the loop holds until you ask for the next scene').toBe(held)
    await hudCheck('step mode holds the scene', 'frame ' + held, 'frame ' + (await nOf()))
  })

  await checkReq('R20', async () => {
    const bar = ov.locator('.fread > .fbar')
    const row = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1)
    const cell = row.locator('.sbproof')
    const stepper = cell.locator('.pcplay .fsteps-wrap')
    const sub = await row.locator('.sbframe').evaluate(f => String((f.querySelector('svg') || { getAttribute: () => '' })
      .getAttribute('data-viz-subphases') || '').split('|')[0].trim().split(/\s+/).map(Number))
    const phOf = () => row.locator('.sbframe').evaluate(f => parseFloat((f as HTMLElement).style.getPropertyValue('--ph')))
    const nOf = async () => Number(((await stepper.locator('.fstepn').textContent()) || '0 / 0').split('/')[0].trim())
    await reveal(cell)
    // A CLICK ON THE PROOF CELL ADVANCES ONE SCENE — and the drawing beside it comes with it, to the
    // park point of that very scene, because both are moved by the same show() the loop uses. (The
    // cell itself is the affordance: the dots are the jump-map, and a per-row "next" button would
    // multiply chrome down every row of every requirement.)
    const from = await nOf()
    const next = from % sub.length + 1
    await stepper.click({ timeout: 8000 })
    // (the click is CONSUMED by the step: every board <img> otherwise opens the shared lightbox, and
    // a step that also threw a full-screen frame over the row would be no kind of step — proven by
    // the assertions that follow, which cannot run under an open lightbox)
    await expect.poll(nOf, { timeout: 6000 }).toBe(next)
    await expect.poll(phOf, { timeout: 6000 }).toBeCloseTo(sub[next - 1], 2)
    // …and it WRAPS: walk the whole way round and land back where the click left us
    for (let k = 0; k < sub.length; k++) await stepper.click({ timeout: 8000 })
    await expect.poll(nOf, { timeout: 6000 }).toBe(next)
    // the dots still JUMP while stepping — the mode holds the clock, it does not take the map away
    await cell.locator('.pdots .pd').first().click({ timeout: 8000 })
    await expect.poll(nOf, { timeout: 6000 }).toBe(1)
    await expect.poll(phOf, { timeout: 6000 }).toBeCloseTo(sub[0], 2)
    // and no media toolbar has crept back in with the mode — this is a PLAY mode (R20's absence)
    await expect(cell.locator('.pcmodes')).toHaveCount(0)
    // …nor did the shared lightbox open over the row while we stepped it
    await expect(page.locator('#lb')).toBeHidden()
    await hudCheck('a click steps both halves of the row', 'scene 1', 'scene ' + (await nOf()))

    // READER-WIDE AND SESSION-HELD, like the speed beside it: page on and the next requirement opens
    // held too, and nothing about it is written down…
    await page.goto('/#/board/R4')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText('R4')
    await expect(ov.locator('.fread > .fbar .medbar.pmode button.on')).toHaveText('step')
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => /mode|play|step/i.test(k))),
      'the play mode is session-scoped — never stored').toEqual([])
    // …and AUTO re-arms what step held
    await page.goto('/#/board/' + spec.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(spec.rid)
    const back = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1).locator('.sbproof .pcplay .fsteps-wrap')
    await reveal(back)
    await ov.locator('.fread > .fbar .medbar.pmode button', { hasText: 'auto' }).click()
    const at2 = await back.locator('.fstepn').textContent()
    await expect.poll(() => back.locator('.fstepn').textContent(), { timeout: 12000 }).not.toBe(at2)
    await bar.locator('select.pspd').selectOption('1')
  })
})

// Board R21 — THE READER READS BEHAVIOUR FIRST. Reworked 2026-08-30, rule 4 with the human's own
// decision as the reason: "remove the toggle of schematic first or behavior first, just always be
// behaviour first". The old test asserted the toggle RE-DEALT the story; the toggle is gone, so this
// asserts the two things that replaced it — the ONE fixed order, measured on every row of a
// multi-beat requirement and carried to the next requirement you page to, and the control's ABSENCE
// (the R8 assert-the-gone precedent: no segmented pair, no order class, nothing stored).
test('The reader reads behaviour first — one fixed order, and no control to change it', async ({ page }) => {
  await coverReqs('R21')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  const ov = dt.locator('.focusov')
  const story = () => ov.locator('.fread .fstory')
  // measured, never a class read: which cell actually sits at each row's left edge
  const leadCells = () => story().locator('.sbwrap .sbrow').evaluateAll(rows => rows.map(el => {
    const cells = [].slice.call(el.children) as HTMLElement[]
    return cells.slice().sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0]
      .className.split(' ')[0]
  }))
  // the worst distance between a header label and the cell it names, across EVERY row — a header that
  // ends up over the column beside the one it names shows up here as a whole column's width
  const headDrift = () => story().evaluate(el => {
    const heads = [].slice.call(el.querySelectorAll('.sbwrap .sbhead .sbhc')) as HTMLElement[]
    const rows = [].slice.call(el.querySelectorAll('.sbwrap .sbrow')) as HTMLElement[]
    if (heads.length !== 3 || !rows.length) return 9999
    let worst = 0
    for (const r of rows) {
      const cells = ['.sbtext', '.sbframe', '.sbproof'].map(s => r.querySelector(s) as HTMLElement)
      for (let i = 0; i < 3; i++) {
        if (!cells[i]) return 9999
        worst = Math.max(worst, Math.abs(heads[i].getBoundingClientRect().left - cells[i].getBoundingClientRect().left))
      }
    }
    return Math.round(worst)
  })

  await checkReq('R21', async () => {
    // R4 has three beats — four rows — so "every row" is a real claim, not one row twice
    await page.goto('/#/board/R4')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText('R4')
    await reveal(story())
    const lead = await leadCells()
    expect(lead.length, 'a multi-beat requirement lays out several rows').toBeGreaterThan(2)
    expect(lead.every(c => c === 'sbtext'), 'the words lead EVERY row: ' + lead.join(' · ')).toBe(true)
    // the header names them in that order, and each label really starts over its own cell
    await expect(story().locator('.sbwrap .sbhead .sbhc')).toHaveText(['behavior', 'schematic', 'proof'])
    await hudCheck('the header sits over the cells it names', '0px drift', (await headDrift()) + 'px drift')
    expect(await headDrift(), 'every header label starts over the cell it names').toBeLessThan(2)
  })

  await checkReq('R21', async () => {
    // THE CONTROL IS GONE, and so is everything it needed. Not "defaults to behaviour first" — there
    // is no segmented pair in the reader, no order class on the story, and no stored preference; a
    // reader that kept the toggle and merely pre-selected one stop fails here.
    // the reader's bar carries the PLAY-MODE pair and nothing else — no second segmented control,
    // which is what a surviving column-order toggle would be
    await expect(ov.locator('.fread .medbar')).toHaveCount(1)
    await expect(ov.locator('.fread .medbar')).toHaveClass(/\bpmode\b/)
    // the CONTROL, not the word: R21's own prose still describes the toggle it used to have, and the
    // prose is the human's to reword (rule 5). So the ban is on the reader's control bar.
    await expect(ov.locator('.fread > .fbar')).not.toContainText('schematic first')
    await expect(ov.locator('.fread > .fbar')).not.toContainText('behavior first')
    await expect(story()).not.toHaveClass(/\bord-bsp\b/)
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => /ord|colorder|column/i.test(k))),
      'there is no column order to store any more').toEqual([])
    // …and it is the same one order on the next requirement you page to — not a per-requirement taste
    await page.goto('/#/board/R13')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText('R13')
    await reveal(story())
    const lead = await leadCells()
    expect(lead.every(c => c === 'sbtext'), 'the next requirement reads behaviour first too').toBe(true)
    await expect(story().locator('.sbwrap .sbhead .sbhc')).toHaveText(['behavior', 'schematic', 'proof'])
    expect(await headDrift(), 'and its header came with it').toBeLessThan(2)
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

test('The proof is scannable as frames — one still per checked value, cut from the recording', async ({ page }) => {
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
          // a shot, like every real record: the player's cover — without it a played-out .rec has
          // no backgroundImage and the rebuilt pane could not re-adopt it (unreal; Task 11's
          // rebuild leg below rides the adopt)
          shots: ['spec/board/screen.png'], video: 'spec/_runs/rf/a.webm', frames, steps: [], log: 'x',
          at: '2026-08-13T00:00:00.000Z', ms: 6000, ok: false, commit: 'abc1234'
        } } }]
    } }))
    await page.reload()
    await expect(dt.locator('.focusov')).toBeVisible()
    await expect(dt.locator('.test .tmeta').first()).not.toBeEmpty()   // the fold settled
    // the proof band derives its panels from R1's status; the strip must not depend on the dogfood
    // lag (mid-run the live status is stale-by-source), so force the strip-bearing status onto the
    // real node — the established deterministic technique — and rebuild the reader on it. Since the
    // human's 2026-08-28 split the RUN's own frames ride the band under a FAILURE (the per-beat
    // harvest rides the beat rows), so `failed` is the status this strip belongs to.
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => el.setAttribute('data-status', 'failed'))
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()

    // (1) IN THE FOCUS READER the run's frames render as the proof band's FILMSTRIP: one cell per
    // checked value, in order, each captioned with its got-vs-expected; the failing value reads red.
    const ov = dt.locator('.focusov')
    const panel = ov.locator('.feval .fmedia .fmpanel', { has: page.locator('.fstrip') })
    const rf = panel.locator('.fcell.rf')
    await expect(rf).toHaveCount(3)                               // the three of THIS screen's R1 — not the foreign fourth
    // Task 15 (the human, 2026-08-24): a strip that carries run-frames is the FILMSTRIP — it keeps
    // the horizontal scroll (fixed .rf cells, one row), marked with the class the stacked
    // before/after pair must NOT get; without the mark the pair-stacking CSS would stack this too
    await expect(panel.locator('.fstrip')).toHaveClass(/\bfilmstrip\b/)
    const rowTops = await panel.locator('.fcell').evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().top)))
    expect(new Set(rowTops).size, 'the filmstrip lays every cell in one row').toBe(1)
    // Task 16 #3 (the human, 2026-08-24): the GIVEN cell is a real cell — the same fixed sizing as
    // the .rf cells, never a flex:1 sliver crushed to ~2px by them — and the strip actually scrolls
    // sideways through ALL cells when they overflow the pane (fixed cells inside overflow-x:auto).
    const cellWs = await panel.locator('.fcell').evaluateAll(
      els => els.map(el => Math.round(el.getBoundingClientRect().width)))
    expect(new Set(cellWs).size, 'the given cell has the SAME fixed sizing as the .rf cells').toBe(1)
    expect(cellWs[0], 'and that size is a real frame width, not a collapsed sliver').toBeGreaterThan(120)
    // …and the FAR cell is reachable however wide the reader is: the strip scrolls sideways, and
    // scrolled to its end the last cell sits fully inside the pane (before the fix the fixed cells
    // simply ran off the edge with no way to reach them). Stated as reachability rather than as a
    // fixed overflow amount, because the card's width moved with the 2026-08-28 one-card reader.
    const stripScroll = await panel.locator('.fstrip.filmstrip').evaluate(el => {
      el.scrollLeft = 99999
      const cells = el.querySelectorAll('.fcell')
      const last = cells[cells.length - 1].getBoundingClientRect()
      const box = el.getBoundingClientRect()
      const r = { max: el.scrollWidth - el.clientWidth, at: el.scrollLeft, ox: getComputedStyle(el).overflowX,
        lastRight: last.right, boxRight: box.right }
      el.scrollLeft = 0
      return r
    })
    expect(['auto', 'scroll'], 'the filmstrip scrolls sideways rather than crushing its cells').toContain(stripScroll.ox)
    expect(stripScroll.at, 'and it scrolls all the way to the far cell').toBeGreaterThan(stripScroll.max - 2)
    expect(stripScroll.lastRight, 'scrolled to the end, the far cell sits fully inside the pane')
      .toBeLessThanOrEqual(stripScroll.boxRight + 2)
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
    // THE SPLIT IS HONEST (the human, 2026-08-28): the RUN's frames stay in the band; a beat row's
    // cell plays only that beat's own HARVESTED pair. Borrowing a run frame onto a beat row would
    // claim the harvest photographed something it never did (rule 3), so the two must not mix.
    const beatCell = ov.locator('.fread .fstory .sbrow .sbproof').filter({ has: page.locator('.pcplay') }).first()
    await expect(beatCell).toHaveCount(1)
    await expect(beatCell.locator('.fsteps img')).toHaveCount(2)   // before → after, the harvested pair
    await expect(beatCell).not.toContainText('third value')        // never the run strip's captions
    // Task 16 #1 (the human, 2026-08-24): the band's ONE video is the screen's COMMITTED recording —
    // seeked to THIS requirement's own moment. Driven deterministically by forcing the baked
    // attributes onto the real row (the established technique; the artifact itself is pinned by
    // leg (a) at the end). 9000:12500 = a stub beat window inside the recording.
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => {
      el.setAttribute('data-ev-video', 'spec/board/evidence/stub-committed.webm')
      el.setAttribute('data-ev-vwin', '9000:12500')
    })
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    const vp = ov.locator('.feval .fmedia .fmpanel', { has: page.locator('.frecwrap') })
    // Task 15's bug guard, restated for the 2026-08-28 sizing: the recording keeps its own RATIO
    // under a 900px width cap (the human: real height, no letterbox bars), so "fills the pane" is no
    // longer a fraction of an ~1700px reader. The guarded failure mode is unchanged — a 300px
    // thumbnail cover — so pin a big absolute width AND the kept aspect (16:10 recording).
    // (Only the width: the aspect leg would need loaded metadata, and this stub 404s by design —
    // an unloaded video sits exactly on the 300×150 default ratio, so a ratio pin here would flake.)
    const vW = await vp.locator('.frecwrap .rec').evaluate(el => el.getBoundingClientRect().width)
    expect(vW, 'the proof recording renders large, never a thumbnail cover').toBeGreaterThan(600)
    // (b) the player exists up front (the committed file IS the surface — no cover click) and it
    // OPENS AT THIS REQUIREMENT'S MOMENT: currentTime = window.from, the default playback start
    // position, readable before a byte of the file loads
    await expect(vp.locator('video')).toHaveCount(1)
    await expect.poll(() => vp.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(9, 1)
    // (c) the label is honest: whose flow this is, and where the beat sits — derived from the window
    await expect(vp.locator('.fvlab')).toContainText('the full flow that proves this')
    await expect(vp.locator('.fvlab')).toContainText('this beat at 0:09–0:12')
    // Task 13 — the reader's ONE dropdown drives the VIDEO too (the human, 2026-08-28: one control
    // per reader, not one per pane — the schematic, every beat's stepper and the video are views of
    // the same beat): playbackRate follows the selection across the native 0.25×–4× range.
    expect(await vp.locator('video').evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1)
    const spd14 = ov.locator('.fread > .fbar select.pspd')
    await expect(spd14).toHaveCount(1)                          // exactly one speed control in the reader
    await spd14.selectOption('0.25')
    expect(await vp.locator('video').evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(0.25)
    await spd14.selectOption('4')
    expect(await vp.locator('video').evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(4)
    await spd14.selectOption('2')
    expect(await vp.locator('video').evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(2)
    // session-scoped only: no speed preference lands in storage
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => /spd|speed/i.test(k)))).toEqual([])
    // the reader rebuilt under a standing 2×: paging away and back rebuilds the pane off the baked
    // attributes — the fresh player is re-rated AND re-seeked at build, never a silent snap back
    await page.goto('/#/board/R2')
    await page.goto('/#/board/R1')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText('R1')
    await expect(spd14).toHaveValue('2')
    await expect(vp.locator('video')).toHaveCount(1)
    await expect.poll(() => vp.locator('video').evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(2)
    await expect.poll(() => vp.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(9, 1)
    // back to 1× for the rest of the test
    await spd14.selectOption('1')
    await expect(spd14).toHaveValue('1')

    // (1b) D3 (the human, 2026-08-22): the band renders the NEWEST record's frames under a FAILURE
    // (the value that broke, burned red) instead of the strip being suppressed under a failed chip.
    // The failed state is carried in the band itself: the bar wears the existing failed mark
    // (✗ + bengara, hue never alone) and the failing value stays red. Forced status, same technique.
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => el.setAttribute('data-status', 'failed'))
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    const rfF = ov.locator('.feval .fmedia .fmpanel .fcell.rf')
    await expect(rfF).toHaveCount(3)                              // the failing run's frames DO render
    await expect(rfF.nth(2)).toHaveClass(/\bhotbad\b/)
    await expect(rfF.nth(2)).toContainText('got 5 · expected 4')
    await expect(ov.locator('.feval .fmedia .fmbar .fpv.fail')).toContainText('✗')   // the failed mark on the band
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => el.setAttribute('data-status', 'passed'))
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    await expect(ov.locator('.feval .fmedia .fmbar .fpv.fail')).toHaveCount(0)      // and only on a failure
    // …and a PASSED requirement's band carries no run strip at all — the per-beat harvest on the
    // rows is its proof, so a green run's frames never crowd the band (2026-08-28)
    await expect(ov.locator('.feval .fmedia .fcell')).toHaveCount(0)

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
    const panelAB = dt.locator('.focusov .feval .fmedia .fmpanel', { has: page.locator('.fstrip') })
    await expect(panelAB.locator('.fcell.rf')).toHaveCount(1)
    await expect(panelAB.locator('.fcell.rf').first()).toContainText('B value — got 2 · expected 3')
    await expect(panelAB.locator('.fcell.rf').first()).toHaveClass(/\bhotbad\b/)
    await expect(panelAB.locator('.fcell.rf', { hasText: 'A value' })).toHaveCount(0)
    await expect(dt.locator('.focusov .feval .fmedia .fmbar .fpv.fail')).toContainText('✗')
    // the proof line names the test whose run failed, too — the pane and its header agree
    await expect(dt.locator('.focusov .feval .fptop .fpname')).toHaveText(B_TITLE)   // the covering test's name heads the proof (2026-08-25)

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
    // FAILED again, so the band's strip branch is the one under test: the newest record cut no
    // frames, so there are NO run-frame cells at all — only the harvested red after-frame stands.
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => el.setAttribute('data-status', 'failed'))
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    const panel2 = dt.locator('.focusov .feval .fmedia .fmpanel', { has: page.locator('.fstrip') })
    await expect(panel2.locator('.fcell')).not.toHaveCount(0)     // the harvested frame still stands
    await expect(panel2.locator('.fcell.rf')).toHaveCount(0)      // …but no run strip — no frames, no fake

    // THE HARVESTED PAIR ITSELF lives on the beat rows now (the human, 2026-08-28): it is read
    // beside the words it proves, PLAYED as the beat's own loop — one camera box filling the cell,
    // each frame a REAL frame (never a sliver) and still zoomable. Back to passed, where the rows
    // are the whole proof.
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => el.setAttribute('data-status', 'passed'))
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    const cellP = dt.locator('.focusov .fread .fstory .sbrow .sbproof').filter({ has: page.locator('.pcplay') }).first()
    // read the frame at FULL FRAME: the camera is a VIEW, so the whole screenshot is always one click
    // away — and the geometry below (and the lightbox click) must measure the frame, not a crop
    const zoomP = cellP.locator('.pczoom')
    if (await zoomP.count() && ((await zoomP.textContent()) || '').includes('full frame')) await zoomP.click()
    const playing = cellP.locator('.pcplay .fsteps img.on')
    await expect(playing).toHaveCount(1)
    const pairGeom = await cellP.evaluate(el => {
      const box = el.querySelector('.pcplay') as HTMLElement
      return { boxW: box.getBoundingClientRect().width, cellW: el.getBoundingClientRect().width }
    })
    expect(pairGeom.boxW / pairGeom.cellW, 'the loop fills its cell — never a sliver').toBeGreaterThan(0.8)
    // …and its zoom is NEAR-FULLSCREEN: the harvest frame is drawn across the stage, not at
    // native size in the middle of it (object-fit contained — measure the drawn bitmap, not the box)
    await playing.click()
    await expect(page.locator('#lb')).toBeVisible()
    await page.waitForFunction(() => (document.getElementById('lbimg') as HTMLImageElement).naturalWidth > 0)
    const lbFrac = await page.locator('#lbimg').evaluate((el: HTMLImageElement) => {
      const r = el.getBoundingClientRect(); const a = el.naturalWidth / el.naturalHeight
      return Math.min(r.width, r.height * a) / window.innerWidth
    })
    expect(lbFrac, 'the lightbox zoom is near-fullscreen').toBeGreaterThan(0.8)
    // the Actual-size escape hatch still renders native pixels — the frame exactly as cut,
    // whatever the house harvest width is (640 before Task 16 #2, 1280 since; the exact width is
    // disk state pinned by tools/evidence.test.mjs, not by this surface)
    await page.locator('#lbzoom').click()
    await expect.poll(() => page.locator('#lbimg').evaluate((el: HTMLImageElement) =>
      Math.round(el.getBoundingClientRect().width) - el.naturalWidth)).toBe(0)
    await page.locator('#lbclose').click()

    // (d) Task 16 #1: with NO committed video NO player is built at all — never a broken player over
    // a missing file (red-first: the old surface offered the transient _runs recording here, which a
    // fresh clone never has). The band says so in words instead, and the beat rows stay the proof.
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => {
      el.removeAttribute('data-ev-video'); el.removeAttribute('data-ev-vwin')
    })
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    await expect(ov.locator('.feval .fmedia video')).toHaveCount(0)
    await expect(ov.locator('.feval .fmedia .fvlab')).toContainText('no recording committed for this screen yet')
    await expect(ov.locator('.fread .fstory .sbrow .sbproof .fsteps img').first()).toBeAttached()

    // (a) Task 16 #1: the committed artifact is REAL — the fold's evidence entries point `video`
    // at a content-hash-named .webm under the screen's committed evidence dir, and the file exists
    // in the tree (the same source the bake reads; red until the first recorded board run commits
    // one, then a video-less CLI fold must KEEP it — the carry this pins).
    const idx = JSON.parse(readFileSync('spec/_results-index.json', 'utf8'))
    const withVideo = Object.values((idx.board && idx.board.evidence) || {})
      .filter((e: any) => e && e.video && e.video.path) as any[]
    expect(withVideo.length, 'at least one board requirement carries a committed video').toBeGreaterThan(0)
    for (const e of withVideo) {
      expect(e.video.path).toMatch(/^spec\/board\/evidence\/[0-9a-f]{12}\.webm$/)
      expect(existsSync(e.video.path), 'the committed video exists on disk: ' + e.video.path).toBe(true)
      expect(typeof e.video.from, 'the seek offset rides the video, frozen at commit').toBe('number')
    }
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
    // (.sbk is the beat LABEL — Given / When N / Then N — so it exists only where a behavior block
    // does: a prose-only requirement's single row carries a bare .sbv and would fail this)
    await expect(page.locator('.dt:not([hidden]) .focusov .fread .fstory .sbrow .sbtext .sbk').first()).toBeVisible()
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
  // RULE 4, 2026-08-30 — of the two sides, the TEST was the wrong one. The settled assertion below
  // leaned on "this repo's own journey is always folded", but folded (tools/journey.mjs) needs
  // EVERY step done, and the `config` step's fact is `existsSync('spec/_config.json')` — a file git
  // does not track. It happens to sit on the machines this suite was written on, so the settled
  // branch held here and could NEVER hold on a clean checkout: CI derived the honest earlier action
  // ("Set up", J_ACT.config) and .wcta-settled read 0 (run 33296656854). The board was right; the
  // test was reading undeclared local machine state. (The other two untracked leftovers are
  // innocent: _crawl.json is not needed — the `crawl` step is satisfied by `anyPrd`, four prd.md
  // files, and does not exist on this machine either — and _conflicts.json is not a journey input
  // at all.) So the test now SEEDS the fact it asserts, the way the conflicts and init specs seed
  // _conflicts.json / _crawl.json, and puts the tree back itself; spec/_state-guard.ts's TOOL_STATE
  // already lists _config.json, so the guard is the backstop either way.
  const CONFIG_FILE = 'spec/_config.json'
  const hadConfig = existsSync(CONFIG_FILE)
  if (!hadConfig) {
    // the MINIMUM that makes journey()'s config step true — deliberately no `tagline` and no
    // `project` block, so the header crumb R1 asserts ('specboard · dogfooding itself') keeps
    // deriving from package.json exactly as it does with no config at all
    writeFileSync(CONFIG_FILE, JSON.stringify({ mode: 'start', baseUrl: 'http://localhost:5173', routes: [] }, null, 2) + '\n')
  }
  // journey() is read at BUILD time (build-board's wCtaAction), not by the client, so the page has
  // to be rebuilt on the seeded fact before it is navigated to.
  build()
  try {
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
      // still pass with the requirement deleted proves nothing). With every journey fact now HELD ON
      // PURPOSE — the seed above for `config`, the tree itself for the rest (a prd.md exists, and a
      // requirement is proven) — wCtaAction takes its folded branch, so assert that EXACT sentence;
      // only a real journey() read produces it. Nothing here is weakened: delete the derivation and
      // this still fails, and it now fails on a clean checkout for a REAL reason or not at all.
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
  } finally {
    // a seeded file is this test's own litter: remove it and rebuild, so no later test in the run
    // opens onto a board built on a fixture (the R13 precedent below). A config that was already
    // there is the human's and is not touched at all.
    if (!hadConfig) { rmSync(CONFIG_FILE, { force: true }); build() }
  }
})

// Board R12, second half — WHAT GATES CI, ON THE BOARD (the human, 2026-08-30: "user need to be
// clear that they can add tests for CI check, and what tests are added"). The chooser is
// spec/_ci.json and tools/ci-select.mjs is the resolver the GitHub workflow itself runs; the board
// reads the same file through the same resolver at BUILD time and marks the cards that gate. Nothing
// is stored — which is the whole claim, so it is proven by SEEDING a different chooser, rebuilding,
// and watching the marks follow (the R12 seeding precedent above; the state guard is the backstop
// and this test puts the file back itself).
test('The home cards say which screens gate CI, derived from spec/_ci.json', async ({ page }) => {
  await coverReqs('R12')
  const CI_FILE = 'spec/_ci.json'
  const had = existsSync(CI_FILE) ? readFileSync(CI_FILE, 'utf8') : null
  const marked = async () => page.locator('#home .card').evaluateAll(cards => cards
    .filter(c => c.querySelector('.kchip.ci'))
    .map(c => c.getAttribute('data-screen')).sort())
  const all = async () => page.locator('#home .card').evaluateAll(cards =>
    cards.map(c => c.getAttribute('data-screen')).sort())
  try {
    await checkReq('R12', async () => {
      // (a) THE COMMITTED CHOOSER: the cards it names wear the mark and the ones it leaves out do
      // not. Read the file here, independently of the board, so this is a comparison and not a
      // restatement — and demand that the two sets actually DIFFER, or the assertion would hold
      // just as well for a board that marked everything.
      const chosen: string[] = JSON.parse(readFileSync(CI_FILE, 'utf8')).screens
      await page.goto('/')
      await page.waitForSelector('#home .card')
      const cards = await all()
      const want = cards.filter(n => chosen.includes(n)).sort()
      const out = cards.filter(n => !chosen.includes(n))
      expect(out.length, 'this project deliberately leaves a screen out of the gate — otherwise the mark proves nothing').toBeGreaterThan(0)
      await reveal(page.locator('#home .card .kchip.ci').first())
      expect(await marked(), 'the marked cards are exactly the screens spec/_ci.json chose').toEqual(want)
      await hudCheck('the CI mark derives from the chooser', want.join(' '), (await marked()).join(' '))
      // the mark says what it is, in the chip pattern the kind counts already use
      await expect(page.locator(`#home .card[data-screen="${want[0]}"] .kchip.ci`)).toContainText('CI')
    })

    await checkReq('R12', async () => {
      // (b) SEED A DIFFERENT CHOOSER and rebuild: the marks move with it. A stored flag could not do
      // this — it would still be marking yesterday's screens.
      const only = (await all()).filter(n => n !== 'board')[0]
      writeFileSync(CI_FILE, JSON.stringify({ screens: [only] }, null, 2) + '\n')
      build()
      await page.goto('/')
      await page.reload()                       // the mark is BAKED, so the page has to be re-fetched
      await page.waitForSelector('#home .card')
      await reveal(page.locator(`#home .card[data-screen="${only}"]`))
      expect(await marked(), 'only the seeded screen gates now').toEqual([only])
      await expect(page.locator('#home .card[data-screen="board"] .kchip.ci')).toHaveCount(0)
      await hudCheck('a different chooser moves the mark', only, (await marked()).join(' '))

      // (c) NO CHOOSER AT ALL is the resolver's own rule — every screen runs — so every card wears it
      rmSync(CI_FILE, { force: true })
      build()
      await page.reload()
      await page.waitForSelector('#home .card')
      expect(await marked(), 'an absent chooser widens the gate back to every screen').toEqual(await all())

      // …and the guide names the file, so a person can find the chooser without reading the workflow
      await page.goto('/#howitworks')
      await page.waitForSelector('#walkthrough')
      await expect(page.locator('#howview')).toContainText('spec/_ci.json')
    })
  } finally {
    if (had == null) rmSync(CI_FILE, { force: true })
    else writeFileSync(CI_FILE, had)
    build()
  }
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
  // `mut` runs on the board's entry; `all` on EVERY screen's entry. Coverage is board-wide (R5: a
  // qualified tag proves another screen's requirement), so board:R1 / board:R2 also carry passes
  // recorded on init's and dispatch's composed flows — patching the board entry alone left those
  // current whenever the previous fold was fresh, and the stale branch composed (200) on every
  // second run (Task 9: runs 2 and 4 red, 1 and 3 green). The stale branch must stale the whole fold.
  const patchBoardIndex = (mut: (e: any) => void, all?: (e: any) => void) => {
    const before = readFileSync(INDEX_FILE, 'utf8')
    const idx = JSON.parse(before)
    expect(idx.board, 'the board has folded at least once').toBeTruthy()
    mut(idx.board)
    if (all) for (const e of Object.values(idx)) all(e)
    writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2) + '\n')
    return () => writeFileSync(INDEX_FILE, before)
  }
  const fresh = (e: any) => {
    e.ranAt = Date.now() + 10 * 60 * 1000       // newer than any source — no pass is stale
    delete e.provenHashes                       // and no pin can flip a pass to Changed
    for (const t of e.tests) for (const k of Object.keys(t.reqs || {})) if (/^board:R(1|2|13)$/.test(k)) t.reqs[k] = 'pass'
  }
  // Older than every source AND made against source that has since changed. Staleness is
  // CONTENT-AWARE since 2026-08-30 (spec-store movedSince): the fold pins the tree's content
  // (`srcHashes`) beside the run, and an old clock alone is no longer drift — a clean checkout
  // restamps every mtime without changing a byte, which is exactly the CI false positive that
  // rule cost us. So this fixture now simulates the real thing: the clock AND the fingerprints.
  const stale = (e: any) => {
    e.ranAt = 0
    if (e.srcHashes) for (const k of Object.keys(e.srcHashes)) e.srcHashes[k] = 'moved-since-this-run'
  }
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
      restore(); restore = patchBoardIndex(stale, stale)   // every screen's records — board-wide coverage
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

// R17 — requirement FAMILIES (the human, 2026-08-23): `### n · family — gloss` lines between a
// prd's sections group the requirements that follow. The oracle here is the prd.md itself, read
// INDEPENDENTLY of the parser under test (a plain line scan for `###` and `## Rn` in document
// order) — an authored fact, so no family name, count or position is pinned as a literal. Families
// carry no state: every mark the map shows is derived from the requirement it names.
import { rmSync } from 'node:fs'
import { makeDocumentScreen } from '../_fixture'
const prdFamilies = (text: string) => {
  const fams: Array<{ heading: string, n: string, name: string, ids: string[] }> = []
  let cur: { heading: string, n: string, name: string, ids: string[] } | null = null
  const loose: string[] = []
  for (const line of text.split('\n')) {
    const f = /^###\s+(.+)$/.exec(line)
    if (f) { cur = { heading: f[1].trim(), n: (/^(\S+)\s+·\s+/.exec(f[1]) || ['', ''])[1], name: f[1].replace(/^\S+\s+·\s+/, '').replace(/\s+—.*$/, '').trim(), ids: [] }; fams.push(cur); continue }
    const r = /^##\s+(R\d+)\s+—/.exec(line)
    if (r) (cur ? cur.ids : loose).push(r[1])
  }
  return { fams, loose, ids: [...loose, ...fams.flatMap(f => f.ids)] }
}
// the pager dots carry state by HUE alone now (R17, the human 2026-08-25) — no shoulder glyph.
// each derived state paints the whole dot: a strong-hue border + number over the state's tint fill
// (untested stays the neutral resting dot). Computed rgb of the design tokens, so a dot that loses
// its status colour fails — the same discipline the ink-ring cur-dot assertion already uses.
const DOT_BORDER = { passed: 'rgb(77, 92, 55)', changed: 'rgb(47, 74, 99)', failed: 'rgb(141, 74, 56)', 'not-reached': 'rgb(138, 100, 18)', untested: 'rgb(205, 199, 184)' }
const DOT_FILL = { passed: 'rgb(234, 236, 225)', changed: 'rgb(230, 234, 238)', failed: 'rgb(242, 232, 228)', 'not-reached': 'rgb(246, 238, 218)', untested: 'rgba(0, 0, 0, 0)' }

test('Requirements sub-group within a screen — family headers on the card and in List, the Focus counter, and the pager that is the jump-map', async ({ page }) => {
  await coverReqs('R17')
  const prd = prdFamilies(readFileSync('spec/board/prd.md', 'utf8'))
  expect(prd.fams.length, 'the board prd must carry families for this test to mean anything').toBeGreaterThan(1)
  const card = page.locator('#home .card[data-screen="board"]')

  // the HOME CARD: family header rows between the requirement rows, in prd order, each shown
  // family complete (the "… N more" fold cuts only at a family boundary)
  await checkReq('R17', async () => {
    const heads = card.locator('.rl .fam')
    await expect(heads.first()).toBeVisible()
    const shown = await heads.allTextContents()
    expect(shown.map(s => s.trim()), 'card families read in prd order').toEqual(prd.fams.slice(0, shown.length).map(f => f.heading))
    // walk the rows: under each header, exactly its ids in order — no family cut in half
    const seq = await card.locator('.rl > li').evaluateAll(els => els.map(e =>
      e.classList.contains('fam') ? 'fam' : e.classList.contains('more') ? 'more' : (e.querySelector('.id')?.textContent || '')))
    const want: string[] = []
    for (const f of prd.fams.slice(0, shown.length)) { want.push('fam'); want.push(...f.ids) }
    const rows = seq.filter(x => x !== 'more')
    expect(rows, 'every shown family carries all its requirements, in order').toEqual(want)
    if (shown.length < prd.fams.length) {
      const rest = prd.ids.length - rows.filter(x => x !== 'fam').length
      await expect(card.locator('.rl .more')).toHaveText('… ' + rest + ' more')
    }
  })

  // the LIST view: the same header rows over their rows
  await checkReq('R17', async () => {
    await page.goto('/#/board/grid')
    const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
    await expect(dt.locator('.gridview')).toBeVisible()
    await expect(dt.locator('.gridview .lst-fam')).toHaveText(prd.fams.map(f => f.heading))
    const seq = await dt.locator('.gridview > .lst-fam, .gridview > .lst-card').evaluateAll(els => els.map(e =>
      e.classList.contains('lst-fam') ? 'fam' : (e.getAttribute('data-r') || '')))
    const want: string[] = [...prd.loose]
    for (const f of prd.fams) { want.push('fam'); want.push(...f.ids) }
    expect(seq).toEqual(want)
  })

  // FOCUS: the counter reads `<family> · n of N`, and THE PAGER IS THE MAP (the human, 2026-08-23 —
  // the top block and the number list navigated the same requirements twice): one group per family
  // carrying its `<n> · <name>` label, a thin separator between groups, one marked dot per
  // requirement in prd order, the current one ringed, the title one hover (or keyboard focus) away
  await checkReq('R17', async () => {
    const rid = 'R17'
    await page.goto('/#/board/' + rid)
    const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
    await expect(dt.locator('.focusov .fid')).toHaveText(rid)
    // the header counter is GONE (2026-08-25) — the family + position live in the pager below, which
    // this test verifies in full; a leftover "<family> · n of N" here would be the old chrome
    await expect(dt.locator('.focusov .fcount')).toHaveCount(0)
    const bar = dt.locator('.dtfoot .fpager')
    await expect(bar).toBeVisible()
    // the family labels, in prd order — the short name (before the em-dash gloss) after its number
    const groups = bar.locator('.fdots .ffam')
    await expect(groups).toHaveCount(prd.fams.length + (prd.loose.length ? 1 : 0))
    await expect(bar.locator('.ffam .ffl')).toHaveText(prd.fams.map(f => f.n + ' · ' + f.name))
    await expect(bar.locator('.fdots .fdotfam'), 'one separator between each pair of families').toHaveCount(prd.fams.length - 1 + (prd.loose.length ? 1 : 0))
    // every requirement is a dot, in prd order, under its family — no window, no ellipsis
    const dots = bar.locator('.fdot')
    await expect(dots).toHaveCount(prd.ids.length)
    expect(await dots.evaluateAll(els => els.map(e => e.getAttribute('data-r')))).toEqual(prd.ids)
    // each dot's VISIBLE text is the requirement's own id now (the human, 2026-08-26): a sequential
    // 1..N position read as an id and clashed with the R-id it sat beside (pager said "15", header
    // said "R10"). The dot, the header, the prd (## R10) and the tag (checkReq('R10')) now agree.
    expect(await dots.allInnerTexts().then(t => t.map(x => x.replace(/\s+/g, '')))).toEqual(prd.ids)
    for (let k = 0; k < prd.fams.length; k++) {
      const f = prd.fams[k]
      const g = groups.nth(k + (prd.loose.length ? 1 : 0))
      await expect(g.locator('.ffl')).toHaveText(f.n + ' · ' + f.name)
      expect(await g.locator('.fdot').evaluateAll(els => els.map(e => e.getAttribute('data-r'))), 'family ' + f.n + ' holds exactly its requirements').toEqual(f.ids)
    }
    // NO shoulder glyph anywhere — state is the dot's own hue now (R17, 2026-08-25)
    await expect(bar.locator('.fdot .fm')).toHaveCount(0)
    // every dot's data-status is the requirement's own (the baked row's), never a family state, and
    // the dot WEARS that state as a hue: border + fill match the state's tokens (the cur dot, ink-ringed,
    // is the sole exception and is checked separately below)
    const dotStates = await dots.evaluateAll(els => els.map(e => ({
      r: e.getAttribute('data-r'), st: e.getAttribute('data-status'), cur: e.classList.contains('cur'),
      border: getComputedStyle(e).borderTopColor, bg: getComputedStyle(e).backgroundColor
    })))
    for (const d of dotStates) {
      const baked = await dt.locator('.reqpane .req[data-r="' + d.r + '"]').getAttribute('data-status')
      expect(d.st, d.r + ' dot mirrors its requirement state').toBe(baked)
      if (d.cur) continue
      expect(d.border, d.r + ' (' + d.st + ') dot wears its state hue').toBe(DOT_BORDER[d.st as keyof typeof DOT_BORDER])
      expect(d.bg, d.r + ' (' + d.st + ') dot fills with its state tint').toBe(DOT_FILL[d.st as keyof typeof DOT_FILL])
    }
    // the current dot is ringed in ink, not inverted (the detail's one inverted element is Run all)
    const cur = bar.locator('.fdot.cur')
    await expect(cur).toHaveCount(1)
    await expect(cur).toHaveAttribute('data-r', 'R17')
    expect(await cur.evaluate(el => getComputedStyle(el).borderColor)).toBe('rgb(28, 27, 24)')
    expect(await cur.evaluate(el => getComputedStyle(el).backgroundColor), 'the current dot is not inverted').toBe('rgba(0, 0, 0, 0)')
    // the title is one hover away, and one keyboard focus away — a title attr AND a visible bubble
    const firstId = prd.ids[0]
    const firstTitle = (await dt.locator('.reqpane .req[data-r="' + firstId + '"] .rt').textContent())!.trim()
    const d1 = bar.locator('.fdot[data-r="' + firstId + '"]')
    await expect(d1).toHaveAttribute('title', new RegExp('^' + firstId + ' — ' + firstTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    const bubble = (el: Element) => { const s = getComputedStyle(el, '::after'); return s.visibility === 'visible' && s.opacity !== '0' && s.content.includes(el.getAttribute('data-r') || '\u0000') }
    expect(await d1.evaluate(bubble), 'no bubble at rest').toBe(false)
    await d1.hover()
    await expect.poll(() => d1.evaluate(bubble), { message: 'the bubble shows on hover' }).toBe(true)
    await page.mouse.move(0, 0)
    await expect.poll(() => d1.evaluate(bubble)).toBe(false)
    await bar.locator('.fnav.prev').focus()
    await page.keyboard.press('Tab')
    await expect(d1).toBeFocused()
    await expect.poll(() => d1.evaluate(bubble), { message: 'the bubble shows on keyboard focus' }).toBe(true)
    // a dot click jumps to that requirement; ‹ › and ← → still page one at a time
    await d1.click()
    await expect(dt.locator('.focusov .fid')).toHaveText(firstId)
    await expect(bar.locator('.fdot.cur')).toHaveAttribute('data-r', firstId)
    await bar.locator('.fnav.next').click()
    await expect(dt.locator('.focusov .fid')).toHaveText(prd.ids[1])
    await page.keyboard.press('ArrowLeft')
    await expect(dt.locator('.focusov .fid')).toHaveText(firstId)
    await expect(bar.locator('.fpk')).toHaveText('← → to review one by one')
    // the old top block is GONE — the pager is the only map (Focus and List alike)
    await expect(page.locator('.reqmap, .tocg, .tocit')).toHaveCount(0)
    await page.goto('/#/board/grid')
    await expect(dt.locator('.gridview')).toBeVisible()
    await expect(page.locator('.reqmap')).toHaveCount(0)
  })

  // a screen with NO families renders exactly as today — no header element anywhere, no map,
  // the counter a bare `n of N`
  await checkReq('R17', async () => {
    const name = makeDocumentScreen('plainfolk')
    try {
      const stubCard = page.locator('#home .card[data-screen="' + name + '"]')
      await expect(async () => {
        build()
        await page.goto('/')
        await expect(stubCard).toHaveCount(1)
      }).toPass({ timeout: 15000 })
      await expect(stubCard.locator('.rl li')).toHaveCount(1)
      await expect(stubCard.locator('.rl .fam')).toHaveCount(0)
      const dt = page.locator('.dt[data-screen="' + name + '"]:not([hidden])')
      await expect(async () => {
        build()
        await page.goto('/#/' + name)
        await expect(dt.locator('.focusov')).toBeVisible()
      }).toPass({ timeout: 15000 })
      await expect(dt.locator('.focusov .fcount')).toHaveCount(0)   // no header counter (2026-08-25) — the pager's one dot is the position
      await expect(dt.locator('.reqmap')).toHaveCount(0)
      await expect(dt.locator('.gridview .lst-fam')).toHaveCount(0)
      // the same bar: one hue-carrying dot (no glyph), no family label, no separator
      await expect(dt.locator('.dtfoot .fdot')).toHaveCount(1)
      await expect(dt.locator('.dtfoot .fdot .fm')).toHaveCount(0)
      await expect(dt.locator('.dtfoot .fdot[data-status]')).toHaveCount(1)
      await expect(dt.locator('.dtfoot .ffl')).toHaveCount(0)
      await expect(dt.locator('.dtfoot .fdotfam')).toHaveCount(0)
    } finally {
      rmSync('spec/' + name, { recursive: true, force: true })
      build()
    }
  })
})
