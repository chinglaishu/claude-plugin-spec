import { test, expect, checkReq, coverReqs, hudCheck, flowStep, reveal, proveVisible, MISSING, intentGap } from '../_base'
// the board's own composable beats (the beat-function convention, Task 5): the assertion bodies the
// tests below were proven red-first with, lifted into exported step functions so the composer can
// chain them — each test keeps its checkReq AROUND the call, so the proof's power is unchanged
import { openBoardHome, countHomeCards, searchRequirementText, openDetailReader, toggleViews } from './steps'
import { refreshDerivedInPlace, noRebuildWhileRunning } from '../dispatch/steps'
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
  // ONE BLOCK, ONE BEAT (phase 6 fix round 2, the controller's I1). R1 has ONE beat and this test
  // made three checkReq calls for it: the cursor clamps every one of them onto beat 1, so the two
  // after the first were harvesting R1.b1's pictures while being about their own leg. The three
  // legs are one beat's moments — the cards, the still that opens its screen, the crumb that names
  // the project — so they are one block, in the order a reader walks them. Nothing was weakened:
  // every assertion below is the assertion that was here.
  await checkReq('R1', async () => {
    await countHomeCards(page, state)
    // the home cover falls back to a still when a run has no video (R10) — keep board's own cover fresh
    await page.screenshot({ path: 'spec/board/screen.png', fullPage: false })
    // the card's STILL opens the screen in Focus, exactly like the rest of the card (the frozen
    // mockup, Task 8) — it is not a lightbox zoom, which is what every other thumbnail does
    const first = page.locator('#home .card').first()
    const name = await first.getAttribute('data-screen')
    await first.locator('.cshot img').click()
    await expect(page.locator('#lb')).toBeHidden()
    await expect(page.locator(`.dt[data-screen="${name}"]:not([hidden]) .focusov`)).toBeVisible()
    await expect(page).toHaveURL(new RegExp('#/' + name + '$'))
    // the header crumb names THIS project — package.json's name, with a tagline from spec/_config.json
    // when one is authored; "dogfooding itself" is specboard's own default, derived, never hardcoded
    //
    // PROVED WITH A RINGED, PHOTOGRAPHED VALUE (2026-09-04, the review's I1). This beat asserted the
    // crumb with a bare expect, so the run rang nothing, recorded no claim, and the board's whole
    // CLAIM path — the Expected's `data-claims`, the `data-claim` tint on the ringed leaf, the value
    // moment the row's stepper walks — was unexercised on this repo's own harvest: R18's "the ringed
    // element carries what the requirement asked for" could never run, and its fallback was a
    // tautology. proveVisible rings the crumb, photographs it, and files the claim, so the board
    // proves that path on ITSELF rather than on a project it cannot see. Soft, so a mismatch reports
    // the whole beat rather than cutting it off at the first red — the value is derived from
    // package.json + spec/_config.json and is as stable as this screen's own name.
    // …ON HOME, where the crumb's own band is the top bar and nothing else. The beat before this one
    // leaves a screen's DETAIL open, and the detail's header row sits at the same y as the top bar —
    // so the scene root the ring picks (the bar) has a geometric neighbour that is not in its
    // subtree, and the replica gate then demands words the capture never had. Going home first makes
    // the beat self-contained as well as gate-clean (found by `npm run proof mirror` the run after
    // this claim was added: 11 missing-text on R1's Actual, every one of them the detail's header).
    await page.goto('/')
    await page.waitForSelector('#home .card')
    await proveVisible(page.locator('.top .crumb'), 'specboard · dogfooding itself',
      'The crumb names this project, derived from package.json', { soft: true })
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
    // the fact R3 names, CLAIMED (the authored-intent lint, phase 6): the row that carried only a
    // title has unfolded INTO THE FOCUS BODY — the same requirement, now reading in place. The
    // expected id comes from the ROW that was clicked, so this is never the screen echoed back.
    await proveVisible(body.locator('.fread .frmeta .fid'), rid!,
      'The row, unfolded into the Focus body in place', { soft: true })
    // …and the other fact: what unfolded is the requirement IN FULL — its own title heads the open
    // body (the row above carried it alone), and the beat rows under it are the formatted
    // requirement itself, not an excerpt.
    const rtitle = ((await req.locator('.rt').textContent()) || '').trim()
    await proveVisible(body.locator('.fread .fttl'), rtitle,
      'The full requirement, unfolded under its own title', { soft: true })
    // Since 1413ac1 (the human, 2026-08-22) EVERY requirement leads with its beats, R1 included:
    // the STORYLINE — one row per beat — heads the open row. Since the human's 2026-08-28 redesign
    // the authored prose ALWAYS follows it in full: the 'Full requirement' chevron is gone, because a
    // requirement is the thing the board exists to show and half of it behind a toggle made the
    // reader guess whether there was more. Both halves must be visible with NO interaction at all.
    await expect(body.locator('.fread .fstory .sbrow').first()).toBeVisible()
    await expect(body.locator('.fread .prose-t')).toHaveCount(0)           // no fold control left…
    await expect(body.locator('.fread > .ffoot button')).toHaveCount(0)    // …and nothing else in the footer either
    // …and NO PROSE BLOCK (the human, 2026-09-02: "remove the whole thing as well" — the authored
    // paragraph under the rows): the beat rows ARE the requirement in the reader; the prose stays in
    // prd.md and the baked source row, never in the reading card.
    await expect(body.locator('.fread .fbody')).toHaveCount(0)
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
    // ("a ring on the asserted element") — then assert the card that must appear beside it. The
    // overlay paints on EVERY run now (the human, 2026-09-02: "make sure the gap between schematic
    // and proof will not exist again" — a plain run used to harvest ringless frames over the board's
    // ringed ones), so this holds with or without a recording. Rule 4: the old else-branch asserted
    // "nothing injected without a recording"; that gate was the defect, so the branch is gone.
    await reveal(dt.locator('.focusov .fread .frmeta .fid'))
    const focusOv = page.locator('#__specboard-focus')
    const call = focusOv.locator('.sb-call')
    {
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
    // then FORCE R1 into a proven status (the dogfood lag makes the live word nondeterministic
    // mid-suite) and rebuild the reader on it.
    const ov = dt.locator('.focusov')
    await expect(dt.locator('.test .tmeta').first()).not.toBeEmpty()
    // NO VIDEO IN THE READER (the human, 2026-09-02: "remove the full flow video from focus mode").
    // Rewritten from the Task 16 #1 leg that asserted the band's committed-recording player — the
    // band is gone with buildMedia, so the honest opposite is asserted: even with the committed
    // video BAKED ON (the fold's own data-ev-video / data-ev-vwin, forced here the established way)
    // the reader builds no player at all. The recording is the FLOW view's subject; R10's evidence
    // in the reader is the steps and the log, which the rest of this leg still opens and reads.
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => {
      el.setAttribute('data-status', 'passed')
      el.setAttribute('data-ev-video', 'spec/board/evidence/committed.webm')
      el.setAttribute('data-ev-vwin', '1000:2000')
    })
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    await expect(ov.locator('.feval .fmedia')).toHaveCount(0)      // no band…
    await expect(ov.locator('.feval video')).toHaveCount(0)        // …and no player, video baked or not
    await expect(ov.locator('.feval .fvlab')).toHaveCount(0)
    // what the reader DOES carry on the title row is the covering test's wired Run and the one ⋯;
    // the run's raw record is one menu away, which is the rest of this leg. (The TEST ✓ <name> group
    // left the row 2026-09-02 on the human's ask — "can we remove the test ✓ Tsumiki — the full flow
    // (R1–R8)" — so the assert-the-gone opposite stands where the name assertion did.)
    await expect(ov.locator('.frmeta .fptop .fpname')).toHaveCount(0)
    await expect(ov.locator('.frmeta .fpm')).toHaveCount(0)
    await expect(ov.locator('.frmeta .fptop .fpacts > .runone')).toBeVisible()
    await ov.locator('.frmeta .fmenu .fmenubtn').click()
    await ov.locator('.frmeta .fmenupop [data-steps]').click()
    const sheet = page.locator('#stepsheet')
    await expect(sheet).toHaveClass(/on/)
    await expect(sheet).toContainText('Check the result is what we expect')   // raw check, marked
    // the fact R10 names, CLAIMED where a person can actually SEE it (the authored-intent lint,
    // phase 6): the run's numbered steps, in order, the first of them the very sentence the test's
    // definition plans. The story rows themselves live in the hidden baked pane — a claim there
    // would ring nothing — so the claim is made on the window that shows them.
    await proveVisible(sheet.locator('.rawsteps li').first(), STORY[0],
      'The first numbered step, as the test defines it', { soft: true })
    // …and the Then's other two facts have no surface a claim can ring. "before any run" is the
    // PENDING plan and "each wearing the run's passed / failed / not-reached mark" is the overlay on
    // it — both of them on the baked test row, which has been HIDDEN since the Columns view retired
    // (board R13, 2026-08-18). Both are asserted above, on that hidden row, by class; a proveVisible
    // there would photograph the whole page with nothing ringed, which proves less than the
    // assertion does. (The window this claim reads shows the run's steps, not the plan's marks.)
    intentGap('"before any run" is the PENDING plan on the baked test row — hidden since the Columns view retired, so a claim there would ring nothing; it is asserted by class on that row above')
    intentGap('the passed / failed / not-reached MARK is the same hidden row\'s overlay — asserted by class above; the Steps window a person actually opens lists the run\'s steps, not the plan\'s marks')
    const full = await sheet.locator('.box').evaluate(el => {
      const r = el.getBoundingClientRect()
      return r.width >= innerWidth - 1 && r.height >= innerHeight - 1
    })
    expect(full).toBeFalsy()
    await sheet.locator('[data-stepsclose]').click()

    // (the "the player never CROPS the frame" leg — object-fit:contain on the band's video, so the
    // burned-in callout could not be sliced off at its edges — went with the band itself, 2026-09-02:
    // there is no player in the reader left to measure. It is NOT re-asserted on the Flow player
    // here, because that surface belongs to R13's own test; said plainly rather than quietly dropped.)

    // the CALLOUT SURVIVES a navigation — a beat that walks to another page keeps its narration
    // (renderOverlay repaints on framenavigated). On every run, like the paint above (2026-09-02).
    await page.reload()
    await expect(call).toBeVisible()
    await expect(call).toContainText('R10')
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
      const ov0 = page.locator('.dt[data-screen="board"]:not([hidden]) .focusov')
      await expect(ov0).toBeVisible()
      // …and a VALUE, not only a presence (rule 2, and `npm run proof lint`'s existence rows): the
      // reader is open ON the screen's first requirement. A reader that rendered empty would still
      // have satisfied the visibility check above.
      await expect(ov0.locator('.fread .frmeta .fid')).toHaveText('R1')
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
          total: rows.length,
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
    // …AND THE CARD'S COUNT IS CLAIMED ON THE CARD (the authored-intent lint, phase 6). The Then
    // names two things: a proven requirement reads Passed, and the home card's "N / M proven" is
    // the same derivation rendered twice. The expected value here is computed from the DETAIL's own
    // rows above — never read off the card — so a card that drifted from its detail fails this
    // claim, photographed, on the card itself. Home first: the card is the thing being ringed.
    // FACT 1, CLAIMED where a person reads it: a requirement whose tests passed READS "✓ Passed" in
    // the reader's own chip — the five-word vocabulary, rendered from the state the row carries.
    //
    // The STATUS IS FORCED, the established deterministic technique in this file (R10's and R14's
    // legs do the same): mid-suite the board's own rows are stale-by-source — this very file was
    // just edited — so which of them is proven is exactly the dogfood lag, and reading the chip off
    // "whichever row happens to be green" made this leg pass in one run and time out in the next
    // (measured 2026-09-04). What the claim is about is the RENDERING of a state, not which row has
    // it; the derivation itself is what the whole block above asserts, board-wide and honestly.
    const dtb = page.locator('.dt[data-screen="board"]:not([hidden])')
    await dtb.locator('.reqpane .req[data-r="R1"]').evaluate(el => {
      el.setAttribute('data-status', 'passed'); el.setAttribute('data-state', 'proven')
    })
    await dtb.locator('.viewseg .vseg[data-view="grid"]').click()
    await dtb.locator('.gridview .lst-card[data-r="R1"] .lst-head').click()
    await proveVisible(dtb.locator('.gridview .lst-card[data-r="R1"] .lst-body .fread .frmeta .fchip'),
      '✓ Passed', 'A proven requirement reads Passed', { soft: true })
    await dtb.locator('.viewseg .vseg[data-view="focus"]').click()

    const bd = surfaces.find(s => s.screen === 'board')!
    await page.goto('/')
    await page.waitForSelector('#home .card')
    await proveVisible(page.locator('#home .card[data-screen="board"] .pcount'),
      bd.proven + ' / ' + bd.total + ' proven',
      'The card\'s count — the Passed rows of its own detail', { soft: true })
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
    // IS the Focus body (board R13, 2026-08-21), so the reader resolves this very test BY TAG.
    // WHERE that resolution is READ moved on 2026-09-02 (the human: "can we remove the test ✓ Tsumiki
    // — the full flow (R1–R8)"): the title row no longer names the test, so the check re-homes on the
    // row's one ⋯, whose "Edit this test" prompt is composed FROM the resolved test — break the tag
    // lookup and the prompt names the wrong test (or none) and this still fails.
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator(`.gridview .lst-card[data-r="${rid}"] .lst-head`).click()
    const body = dt.locator(`.gridview .lst-card[data-r="${rid}"] .lst-body`)
    await expect(body.locator('.fread .frmeta .fid')).toHaveText(rid!)
    await expect(body.locator('.frmeta .fptop .fpname')).toHaveCount(0)   // the name is off the row…
    await body.locator('.frmeta .fmenu .fmenubtn').click()
    await body.locator('.frmeta .fmenupop [data-prompt="edittest"]').click()
    await expect(page.locator('#promptsheet')).toHaveClass(/\bon\b/)
    await expect(page.locator('#promptbody')).toContainText(flow)         // …and named where it is acted on
    // FACT 1, CLAIMED where the resolution is acted on: the prompt this row composes NAMES the
    // covering test — the flow title was read off the test's own row, so a broken tag lookup writes
    // another test's name here and this fails on the value.
    await proveVisible(page.locator('#promptbody'), flow,
      'The covering test that tags it, named in the row\'s own prompt',
      { soft: true, match: (shown: string) => shown.includes(flow) })
    await page.locator('#promptsheet [data-promptclose]').click()
    // FACT 1, CLAIMED (the authored-intent lint, phase 6): the reader open here is the requirement
    // the TEST's tag names — the expected id was read off the test's tag chip, the value off the
    // requirement it resolved to, so the many-to-many wire is what this reads.
    await proveVisible(body.locator('.fread .frmeta .fid'), rid!,
      'The requirement the test\'s tag resolves to', { soft: true })
    // FACT 2 — CROSS-SCREEN, wherever that test's file lives. This screen's file carries a QUALIFIED
    // tag (dispatch:R7): follow it to the screen it names and open that requirement there. The
    // expected id comes from the qualified tag in THIS file; the value is read on the OTHER screen's
    // reader, which is the whole of "wherever that test's file lives".
    const q = await dt.locator('.testpane .test .tags .tag[data-q*=":"]').first().getAttribute('data-q')
    const [qScreen, qRid] = (q || '').split(':')
    expect(qScreen && qRid, 'this screen\'s file tags another screen\'s requirement').toBeTruthy()
    await page.goto('/#/' + qScreen)
    const qdt = page.locator('.dt[data-screen="' + qScreen + '"]:not([hidden])')
    await expect(qdt.locator('.focusov')).toBeVisible()
    await qdt.locator('.viewseg .vseg[data-view="grid"]').click()
    await qdt.locator('.gridview .lst-card[data-r="' + qRid + '"] .lst-head').click()
    await proveVisible(qdt.locator('.gridview .lst-card[data-r="' + qRid + '"] .lst-body .fread .frmeta .fid'),
      qRid, 'The same tag, resolved on the screen it names', { soft: true })
    // …and the requirement it resolved to on that other screen carries its own title, read on the
    // screen the tag NAMED rather than on the one the test's file lives in — which is the last of
    // this Then's facts: the resolution follows the tag, not the file.
    const qTitle = prdTitle(qScreen, qRid)
    expect(qTitle, 'the screen the tag names declares that requirement: ' + q).toBeTruthy()
    await proveVisible(qdt.locator('.gridview .lst-card[data-r="' + qRid + '"] .lst-body .fread .fttl'),
      qTitle, 'Resolved by tag — wherever the test\'s file lives', { soft: true })
  })
})

test('A requirement names the tests that cover it', async ({ page }) => {
  await coverReqs('R6')
  await openDetail(page)
  await checkReq('R6', async () => {
    // ONE DECLARATION PER FACT (final review I3, 2026-09-04). This beat opens a page, so the
    // whole-beat waiver — which exists for a beat with no page open at all — does not apply to it:
    // each fact of the Then says for itself why no claim can ring it, and each prints as its own
    // visible debt.
    intentGap('"proven only by an assertion that would fail without it" is a property of the TEST, not a value on any screen — the board derives it from the tag plus the run, and nothing rendered says it')
    intentGap('"a requirement no test tags stays Untested" has no deterministic instance in this tree to photograph: every board requirement is tagged, and the fabricated untagged screen lives in spec/_modes, deliberately not cross-tagged to board:R6')
    intentGap('"a test merely existing buys no green" is a NEGATIVE over every row of the board, read off the hidden baked panes below — not a value standing on a screen')
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
    // NO EMBEDDED WIREFRAME — the requirement's own words, restored 2026-09-04 (rule 5: staff had
    // narrowed the Then to "nothing is LOADED from anywhere"; meaning waits on the human, and the
    // question is put to them in prd.md's comment). This is what the sentence actually forbids, and
    // it can fail: the drawn ui-mirror was a wireframe the detail DID embed until 2026-09-03, and
    // any renderer that starts baking one again fails here.
    await expect(detail.locator('[data-viz-kind="wireframe"]')).toHaveCount(0)
    await expect(detail.locator('.schematic svg[data-viz-archetype="ui-mirror"]')).toHaveCount(0)
    await expect(detail.locator('[data-wireframe], .wireframe, [data-artifact]')).toHaveCount(0)
    // …AND, BESIDE IT, NOT INSTEAD OF IT: the one kind of frame the detail does carry is inert. This
    // constrains the implementation without changing what R7 says — a design or a wireframe LOADED
    // from anywhere (an `<iframe src>`), or a frame granted any capability at all, fails here.
    await expect(detail.locator('iframe[src]')).toHaveCount(0)
    const frames = await detail.locator('iframe').evaluateAll(
      els => els.map(e => ({ sandbox: e.getAttribute('sandbox'), src: e.getAttribute('src') || '' })))
    expect(frames.every(f => f.sandbox === '' && !f.src),
      'every frame in the detail is an inert srcdoc replica: ' + JSON.stringify(frames)).toBe(true)
    // …and the POSITIVE half of the same sentence, CLAIMED (the authored-intent lint, phase 6):
    // "requirements and proof only" — the reader's own row header names the cells the detail deals,
    // and there is no third thing among them. An absence cannot be photographed; what CAN be shown
    // is what stands in its place.
    await proveVisible(detail.locator('.focusov .fread .fstory .sbwrap .sbhead .sbhc').first(), 'behavior',
      'What the detail deals: the requirement\'s words, then its two pictures', { soft: true })
    // …AND THE THREE ABSENCES THE THEN NAMES, CLAIMED AS ABSENCES (I5, 2026-09-04 — this beat used
    // to close them with the header above, a neighbour's positive fact, which the lint counts and
    // cannot question). `proveVisible(…, MISSING, …)` passes exactly while each is gone and fails,
    // with the thing's own words as `got`, the moment specboard starts owning a design again.
    await proveVisible(detail.locator('[data-design], .chip.design'), MISSING,
      'No design chip anywhere in the detail', { soft: true })
    await proveVisible(detail.locator('[data-artifact], a[data-design-link]'), MISSING,
      'No design link either — specboard owns neither', { soft: true })
    await proveVisible(detail.locator('[data-viz-kind="wireframe"], [data-wireframe], .wireframe'), MISSING,
      'And no embedded wireframe: requirements and proof only', { soft: true })
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
    // the fact, CLAIMED (the authored-intent lint, phase 6): what sits under the header is the
    // READER, open on the screen's first requirement — nothing between them waiting to be accepted
    await proveVisible(detail.locator('.dtscroll > .focusov .fread .frmeta .fid'), 'R1',
      'Straight from the header into the reader — the first requirement', { soft: true })
    // …AND THE THREE ABSENCES, CLAIMED (I5, 2026-09-04 — the id above is the positive half and was
    // standing in for all three). Each passes exactly while the gate is gone and fails, naming what
    // came back, the moment a rubber-stamp returns to the detail.
    await proveVisible(detail.locator('.gate'), MISSING, 'No gate bar', { soft: true })
    await proveVisible(detail.locator('[data-act="accept"]'), MISSING, 'No accept button', { soft: true })
    await proveVisible(detail.locator('[data-gate]'), MISSING,
      'Nothing at all waiting to be accepted', { soft: true })
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
    // Actual, side by side under a `behavior · expected · actual` header row. R13 is 1 beat →
    // given + then = TWO rows. The separate .fschem box and the old .fleft column are GONE.
    const story = ov.locator('.fread .fstory')
    await expect(story).toHaveCount(1)
    await expect(ov.locator('.fleft, .fschem, .storycap')).toHaveCount(0)   // the retired reader's containers
    // the HEADER ROW names the three cells — the one row that says what they ARE (2026-08-28)
    // (reordered 2026-08-30, rule 4 — the human removed the column-order toggle and fixed the story
    // BEHAVIOUR FIRST, so the header names its three cells in that one order now)
    await expect(story.locator('.sbwrap .sbhead .sbhc')).toHaveText(['behavior', 'expected', 'actual'])
    // one row per phase: a drawn still (.sbframe svg), its beat text (.sbtext) and that beat's own
    // proof (.sbproof) — no standalone behavior grid, no single looping whole-drawing
    const rows = story.locator('.sbwrap .sbrow')
    await expect(rows).toHaveCount(2)                                     // given + one beat
    await expect(rows.nth(0)).toHaveClass(/bgiven/)
    // the EXPECTED picture is the app's own component in a sandboxed iframe (R18, the human's
    // 2026-09-03 decision) — paired INSIDE the row, exactly where the drawn still used to be
    await expect(rows.nth(0).locator('.sbframe iframe.repframe')).toHaveCount(1)
    await expect(rows.nth(0).locator('.sbtext')).toContainText('Given')
    await expect(rows.nth(0).locator('.sbproof')).toHaveCount(1)          // …and so is its proof cell
    await expect(rows.nth(1).locator('.sbtext')).toContainText('Then')
    await expect(rows.nth(1).locator('.sbtext')).toContainText('render in that view')   // the real Then text
    await expect(rows.nth(1).locator('.sbproof')).toHaveCount(1)
    await expect(story.locator('.sbwrap .behavior')).toHaveCount(0)       // a paired storyline has no plain grid
    await expect(story.locator('.sbwrap .viz svg')).toHaveCount(0)        // and no single whole-animation drawing here
    await expect(story).not.toContainText('no Expected yet')
    await expect(story).not.toContainText('sketch · no UI yet')      // this screen HAS been harvested
    await expect(story).not.toContainText('≠')
    // A FRESH HARVEST READS AS CURRENT (restored 2026-09-04, the review's I5 — this was dropped with
    // the drawing's own staleness and has a stronger successor now: the banner reads FOUR reasons on
    // a replica, so a quiet storyline here means the words have not moved past the run, the app has
    // not moved past the picture, the gate found no gap, and nothing was truncated).
    await expect(story).not.toHaveClass(/isstale/)
    await expect(story.locator('.sbstale')).toHaveCount(0)
    // …and the successor to the retired `data-vizhash`: the picture is PINNED to the harvest it was
    // gated against. `data-vizhash` was the drawing's own text hash and went with the drawing; the
    // replica's equivalent is the gate verdict the fold recorded beside this beat, which the board
    // reads to decide "layout moved". A row whose picture was never walked back has no pin at all.
    const gate13 = await ov.locator('.fread').evaluate(() => {
      const node = document.querySelector('.dt[data-screen="board"] .reqpane .req[data-r="R13"]')
      const b = JSON.parse(node!.getAttribute('data-ev-beats') || '[]').find((x: any) => Number(x.n) === 1)
      return (b && b.replica) || null
    })
    expect(gate13, 'the fold recorded this beat\'s gate verdict').toBeTruthy()
    expect(gate13.gated, 'the picture was walked back and measured, not taken on trust').toBe(true)
    expect(gate13.gaps, 'and it carries everything the harvest measured').toBe(0)
    // …and the AUTHORED PROSE IS ALWAYS SHOWN beneath the rows (the human, 2026-08-28): the
    // 'Full requirement' toggle is gone, so the text is readable with NO interaction at all — a
    // reader that hid half of it behind a chevron fails here, and there is no chevron to click.
    // …and NO AUTHORED PROSE under the rows (the human, 2026-09-02: "remove the whole thing as well"):
    // the storyline IS the requirement in the reader; the paragraph lives in prd.md and the baked
    // source row. Asserted absent (the R8 assert-the-gone precedent) so it cannot creep back.
    await expect(ov.locator('.fread .fbody')).toHaveCount(0)
    await expect(ov.locator('.fread')).not.toContainText('The detail header carries a toggle')
    await expect(ov.locator('.fread .prose-t')).toHaveCount(0)             // no fold control left…
    await expect(ov.locator('.fread > .ffoot button')).toHaveCount(0)      // …and nothing else in the footer either
    // NO TOGGLE (the human, 2026-08-26): storyboard and loop COMBINED — each row loops its OWN beat,
    // so there is no storyboard/loop switch and no separate whole-animation mode.
    await expect(story.locator('[data-sm]')).toHaveCount(0)
    // ONE STORY, ONE CLOCK (2026-08-29, the human: "same story order, comparable timing"), on the
    // REPLICA since the human's 2026-09-03 Expected View decision. A beat is ONE ordered list of
    // moments and the two cells are two renderings of it, so the row's single strip must move BOTH:
    // the photograph to that moment's frame, the Expected cell to that moment's own committed
    // replica. Proven against the HARVEST rather than against a tween: the fold names each moment's
    // replica in data-ev-beats, and the cell says which one it is showing (data-repsrc), so a cell
    // that stopped stepping — or stepped to another moment's picture — fails here.
    const beatFr = rows.nth(1).locator('.sbframe')
    const repOf = () => beatFr.evaluate(f => String((f as HTMLElement).dataset.repsrc || ''))
    const want = await ov.locator('.fread').evaluate(() => {
      const node = document.querySelector('.dt[data-screen="board"] .reqpane .req[data-r="R13"]')
      const bs = JSON.parse(node!.getAttribute('data-ev-beats') || '[]')
      const b = bs.filter((x: any) => Number(x.n) === 1)[0] || {}
      const vals = (b.values || []).filter((v: any) => v && v.frame)
      const out = []
      if (b.before && !vals.length) out.push(b.replicaExpectedBefore || '')
      for (const v of vals) out.push(v.replicaExpected || '')
      if (b.after) out.push(b.replicaExpectedAfter || '')
      return out
    })
    expect(want.length, 'the harvest recorded this beat\'s moments').toBeGreaterThan(1)
    expect(want.every(Boolean), 'and a committed replica for every one of them: ' + JSON.stringify(want)).toBe(true)
    // the row opens on its first moment, showing that moment's own picture
    await expect.poll(repOf, { timeout: 8000 }).toBe(want[0])
    // the per-cell dots are gone (the human, 2026-09-02) and so is the gutter's ‹ n / N › (the same
    // day): the row's ONE moment strip over the two pictures is the walk, and STEP is the default so
    // the loop holds while we walk it.
    const strip = rows.nth(1).locator('.mstrip')
    const tpos = strip.locator('.mpos')
    const tposN = async () => Number(((await tpos.textContent()) || '0 / 0').split('/')[0].trim())
    await expect(strip, 'ONE stepper on the row, over both pictures').toHaveCount(1)
    await expect(rows.nth(1).locator('.mseg'), 'one segment per moment of the beat').toHaveCount(want.length)
    await expect(tpos).toHaveText('1 / ' + want.length)                // both halves agree on the moment count
    for (let i = 0; i < want.length && (await tposN()) < want.length; i++) { await strip.locator('.mnext').click(); await page.waitForTimeout(60) }
    await expect.poll(repOf, { timeout: 8000 }).toBe(want[want.length - 1])
    await strip.locator('.mnext').click()                              // ↺ wraps to the first moment
    await expect.poll(repOf, { timeout: 8000 }).toBe(want[0])
    // ONE reader control group, ONE speed (the human, 2026-08-28 — superseding the per-pane dropdowns;
    // on the TITLE ROW since 2026-09-02): the schematic frames, every beat cell's stepper and the video
    // are views of the SAME beat, so they play at one pace.
    const fbar = ov.locator('.fread .frmeta .frtools')
    await expect(fbar).toHaveCount(1)
    await expect(ov.locator('.fread > .fbar')).toHaveCount(0)          // no separate bar beneath the title
    const spdS = fbar.locator('select.pspd')
    await expect(spdS).toHaveCount(1)                                   // exactly one, for the whole reader
    await expect(ov.locator('.fread select.pspd')).toHaveCount(1)       // …and none anywhere else in it
    await expect(spdS).toHaveValue('1')
    await expect(spdS.locator('option')).toHaveText(['0.25×', '0.5×', '1×', '1.5×', '2×', '4×'])
    // the reader's play-MODE pair (board R20): auto ↔ step, STEP the default now (the human, 2026-09-02:
    // "default as step"). The column-order pair that once stood here is gone (board R21); the walk is
    // per beat row (the gutter ‹ n/N ›), never a reader-wide control — so the bar has ONE .medbar.
    await expect(fbar.locator('.medbar.pmode button')).toHaveText(['auto', 'step'])
    await expect(fbar.locator('.medbar.pmode button.on')).toHaveText('step')
    await expect(fbar.locator('.medbar')).toHaveCount(1)
    await expect(fbar.locator('.medbar.pstep')).toHaveCount(0)      // no advance control in the bar
    await expect(fbar).not.toContainText('‹')
    await expect(fbar).not.toContainText('›')
    await expect(fbar).not.toContainText('schematic first')
    await expect(fbar).not.toContainText('behavior first')
    // A MULTI-BEAT requirement loops EVERY beat: R4 has 3 beats → given (parked) + 3 LOOPING rows
    await page.goto('/#/board/R4')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText('R4')
    const r4rows = ov.locator('.fread .fstory .sbwrap .sbrow')
    await expect(r4rows).toHaveCount(4)
    await expect(r4rows.locator('.sbframe')).toHaveCount(4)              // every row carries its own Expected cell
    await expect(r4rows.locator('.sbproof')).toHaveCount(4)              // …and its own Actual cell
    await expect(r4rows.nth(1).locator('.sbtext')).toContainText('When')
    await expect(r4rows.nth(3).locator('.sbtext')).toContainText('Then')
    // …and a row is a PICTURE where the run harvested one and an HONEST GAP where it did not — never
    // a borrowed picture from a neighbouring beat (rule 3). R4's own test proves beat 1 only, so this
    // requirement is exactly the case that has both kinds of row on one storyline.
    const kind = await r4rows.evaluateAll(rs => rs.map(r => (
      r.querySelector('.sbframe iframe.repframe') ? 'picture'
        : (r.querySelector('.sbframe .noschem') ? 'gap' : 'other'))))
    expect(kind.filter(k => k === 'picture').length, 'the harvested beats show the app\'s own component').toBeGreaterThan(0)
    expect(kind.filter(k => k === 'other').length, 'and no row shows anything else: ' + kind.join(' · ')).toBe(0)
    for (let i = 0; i < kind.length; i++) {
      if (kind[i] === 'gap') {
        await expect(r4rows.nth(i).locator('.sbframe'), 'a beat with no harvest says so').toContainText('no Expected yet')
        await expect(r4rows.nth(i).locator('.sbproof .pcnone'), '…and so does its Actual cell').toHaveCount(1)
      }
    }
    // the GIVEN row is the context row — one moment, nothing to walk; a beat row with a harvest
    // carries the row's one strip over its two pictures (2026-09-02, unchanged by the replica: the
    // picture changed, the walk did not)
    await expect(r4rows.nth(0).locator('.mstrip')).toHaveCount(0)                     // given: one moment
    await expect(r4rows.nth(1).locator('.mstrip')).toHaveCount(1)                     // the harvested beat walks
    // (the honest placeholder a requirement with NO committed drawing keeps — the labelled beats,
    // never a wrong picture — is board R18's own requirement now, drafted 2026-08-28: the drawing is
    // a MIRROR of the real UI, so what happens when there is no measured layout to mirror belongs to
    // that requirement. Its assertions were moved out of here into the R18 test verbatim.)
    await page.goto('/#/board/R13')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText('R13')

    // THE COVERING TEST'S ACTIONS RIDE THE TITLE ROW (the human, 2026-09-02: the covering test at the
    // bottom of the card "is just weird" — it joins the header, combined with the row's existing ⋯).
    // Nothing sits beneath the beat rows now: no proof header, no prose.
    // What rides the row is the TEST'S ACTIONS ONLY — the wired Run and the one ⋯. The TEST eyebrow,
    // the ✓/✗/◌ mark and the test's own name were there for a few hours on 2026-08-25's shape and the
    // human asked for them gone the same day this landed ("can we remove the test ✓ Tsumiki — the
    // full flow (R1–R8)"): the requirement's own chip two elements to the left already says the
    // state, so a second mark beside a test title only crowded the line. Asserted as the R8
    // assert-the-gone opposite so it cannot creep back.
    await expect(ov.locator('.feval .fphead')).toHaveCount(0)                            // no header under the rows
    const tline = ov.locator('.fread > .frmeta .fptop')
    await expect(tline).toBeVisible()
    await expect(tline.locator('.fpname')).toHaveCount(0)                            // no test NAME on the row…
    await expect(ov.locator('.frmeta .fpm')).toHaveCount(0)                          // …no second mark beside the chip…
    await expect(tline.locator('.fbarl')).toHaveCount(0)                             // …and no TEST eyebrow
    await expect(ov.locator('.fread .fpby, .fread .fprun')).toHaveCount(0)             // the old proof lines stay gone
    await expect(ov.locator('.feval .fev .test.infocus')).toHaveCount(1)              // the moved node still feeds Logs / Steps
    await expect(tline.locator('.fpacts > .runone')).toBeVisible()                    // Run always shown, on the row
    await expect(ov.locator('.fread .frmeta .fmenu .fmenubtn')).toHaveCount(1)        // ONE ⋯ for the whole card…
    await expect(ov.locator('.fread .fmenubtn')).toHaveCount(1)                       // …and none anywhere else in it
    await expect(ov.locator('.frmeta .fmenupop [data-steps]')).toHaveCount(1)
    await expect(ov.locator('.frmeta .fmenupop [data-log]')).toHaveCount(1)
    await expect(ov.locator('.frmeta .fmenupop [data-prompt="edittest"]')).toHaveCount(1)   // the test's actions…
    await expect(ov.locator('.frmeta .fmenupop [data-prompt="reword"]')).toHaveCount(1)     // …and the requirement's, in the same menu
    await expect(ov.locator('.frmeta .fmenupop [data-prompt="addtest"]')).toHaveCount(1)    // said once, not twice
    await ov.locator('.frmeta .fmenubtn').click()
    await ov.locator('.frmeta .fmenupop [data-log]').click()
    await expect(page.locator('#logsheet')).toHaveClass(/\bon\b/)
    await page.locator('#logsheet [data-logclose]').click()
    await expect(ov.locator('.fcols, .fopen')).toHaveCount(0)

    // WHAT THE READER SHOWS DERIVES FROM STATUS × BEATS (D2; the frozen mockup). The status is FORCED
    // client-side onto real .req nodes — the established deterministic technique (the dogfood lag
    // makes live statuses stale mid-run) — while the baked EVIDENCE attributes (the D2 harvest's
    // frames, folded from real runs into spec/_results-index.json and baked as data-ev-*) stay real.
    const evId = await dt.locator('.reqpane .req[data-ev-after]').first().getAttribute('data-r')
    expect(evId, 'at least one requirement must carry harvested evidence').toBeTruthy()
    // the COMMITTED VIDEO is forced ON here (the fold's own data-ev-video / data-ev-vwin) precisely
    // so the no-video assertions below are not passing by absence: the reader must build no player
    // even when the recording it used to play is right there on the row.
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
    // onto the rows they belong to) and they are ALL of it: THE PROOF BAND IS GONE (the human,
    // 2026-09-02, "remove the full flow video from focus mode"). Rewritten from the legs that
    // asserted the band's bar, its one video and its label — the recording is the FLOW view's
    // subject now, and what remains beneath the rows is the proof HEADER's words plus the moved
    // covering test. Kept as the R8 assert-the-gone precedent so it cannot creep back.
    await force(evId!, 'passed')
    await reopen(evId!)
    const media = ov.locator('.feval .fmedia')
    await expect(media, 'no proof band under the rows').toHaveCount(0)
    await expect(ov.locator('.feval video'), 'and no video in the reader at all').toHaveCount(0)
    await expect(ov.locator('.feval .fmbar, .feval .fmpanel, .feval .fvlab, .feval .fvjumps')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('sbFocusMedia')),
      'no pane-wide media preference is stored any more').toBeNull()
    // …and the proof still READS: the state on the row's own chip and the covering test's wired Run
    // beside it, above the beat rows that carry the harvested frames — the band's removal took
    // chrome, never the proof itself. (The test's mark and name left the row 2026-09-02, the human.)
    await expect(ov.locator('.fread .frmeta .fchip')).toHaveClass(/\bpassed\b/)
    await expect(ov.locator('.frmeta .fptop .fpname')).toHaveCount(0)
    await expect(ov.locator('.frmeta .fptop .fpacts > .runone')).toBeVisible()
    await expect(ov.locator('.fread .fstory .sbrow .sbproof img').first()).toBeAttached()

    // THE BEAT'S OWN PROOF CELL — Task 13's frame-stepper, moved onto the row it proves. STEP is the
    // default (the human, 2026-09-02), so it opens HELD; AUTO turns it into the hands-free loop. It
    // carries NO dots, NO n/N counter and NO mode toolbar — the behaviour gutter's ‹ n / N › is the
    // one readout and walk (the human, 2026-09-02).
    const proofCells = ov.locator('.fread .fstory .sbrow .sbproof')
    const playRow = ov.locator('.fread .fstory .sbrow').filter({ has: page.locator('.pcplay') }).first()
    const playCell = playRow.locator('.sbproof')
    await expect(playCell).toHaveCount(1)          // a harvested beat plays; a row with no frames says so
    const stepper = playCell.locator('.pcplay .fsteps-wrap')
    const frameN = await stepper.locator('.fsteps img').count()
    expect(frameN, "the beat's harvested pair at least — a loop needs frames to play").toBeGreaterThan(1)
    // the frames are fetched EAGERLY (release pass M-1): they stack display:none, and a lazy img
    // is never fetched while hidden — the first loop at 4× flashed blank. Every frame has decoded
    // (natural width — a positive, not an attribute's absence) well before the loop shows it
    await expect.poll(() => stepper.locator('.fsteps img').evaluateAll(
      (els: HTMLImageElement[]) => els.every(i => i.complete && i.naturalWidth > 0)), { timeout: 1000 }).toBe(true)
    // NO per-cell chrome: no dots, no n/N counter, no mode toolbar — the row's ONE moment strip over
    // the two pictures is the readout (and the retired gutter tour is nowhere: .tourstep is gone)
    await expect(stepper.locator('.pdots')).toHaveCount(0)
    await expect(stepper.locator('.fstepn')).toHaveCount(0)
    await expect(playCell.locator('.pcmodes')).toHaveCount(0)
    await expect(playCell.locator('.pczoom')).toHaveCount(0)
    await expect(ov.locator('.fread .tourstep')).toHaveCount(0)
    await expect(stepper).toBeVisible()
    const gpos = playRow.locator('.mstrip .mpos')
    // AUTO PLAYS ITSELF: switch to auto (which enables the speed), 4× bounds every hold at ~1.5s, and
    // the gutter position advances on its own — REAL timers + polling, argued: Playwright's fake clock
    // would also freeze the board's own SSE/fold timers this very screen is proving.
    await fbar.locator('.medbar.pmode button[data-mode="auto"]').click()
    await spdS.selectOption('4')
    const stepAt = await gpos.textContent()
    await expect.poll(() => gpos.textContent(), { timeout: 15000 }).not.toBe(stepAt)
    await spdS.selectOption('1')
    await fbar.locator('.medbar.pmode button[data-mode="step"]').click()   // back to the default
    // THE SHARED CAMERA (the human, 2026-08-28; no toggle since 2026-09-02): where the harvest recorded
    // a focus box, the row's proof and the drawing beside it are framed on the SAME region — both cells
    // zoomed to the component together, never one alone. The whole frame is the LIGHTBOX, not a toggle.
    const framedRow = ov.locator('.fread .fstory .sbrow').filter({ has: page.locator('.sbproof .pcbox.zoomed') }).first()
    if (await framedRow.count()) {
      const pair = await framedRow.evaluate(el => [
        !!el.querySelector('.sbproof .pcbox.zoomed'), !!el.querySelector('.sbframe .pcbox.zoomed')])
      expect(pair[0], 'the drawing and the proof are framed together, never one alone').toBe(pair[1])
    }
    // the frame ON SHOW is still a real frame you can open: clicking it puts THAT frame in the shared
    // lightbox — the whole screenshot, one click away (there is no inline toggle any more)
    const shown = stepper.locator('.fsteps img.on')
    await expect(shown).toHaveCount(1)
    const stillSrc = (await shown.getAttribute('src'))!
    await shown.click()
    await expect(page.locator('#lb')).toBeVisible()
    expect((await page.locator('#lbimg').getAttribute('src'))!, 'the click opens the frame that was showing')
      .toContain(stillSrc.split('?')[0].split('/').pop()!)
    await page.locator('#lbclose').click()

    // FAILED → the failure reads on the title row's own CHIP, and the harvested red frames stay on
    // the beat rows. (Rewritten 2026-09-02 with the band: this leg used to assert the band's ✗ chip
    // and its filmstrip of the failing run's own frames. Neither exists in the reader now — the run's
    // frames are read on the test's own row, in List/Flow. Rewritten again the same day when the
    // human took the test group off the row: the ✗ the leg measured is the requirement chip's now.
    // What must NOT be lost is that a failed requirement can never read green here, so that is what
    // is asserted, positively.)
    await force(evId!, 'failed')
    await reopen(evId!)
    await expect(media, 'still no band under a failure').toHaveCount(0)
    await expect(ov.locator('.fread .frmeta .fchip')).toHaveText('✗ Failed')     // ✗ leads the row
    await expect(ov.locator('.fread .frmeta .fchip')).toHaveClass(/\bfailed\b/)
    await expect(ov.locator('.fread .frmeta .fchip')).not.toHaveClass(/\bpassed\b/)
    await expect(ov.locator('.frmeta .fpm')).toHaveCount(0)                      // no second mark to disagree with it
    await expect(ov.locator('.fread .fstory .sbrow .sbproof img').first(),
      'the harvested frames still stand under a failure — the rows are the proof').toBeAttached()

    // CHANGED → the drift is said in WORDS on the proof header (the pinned-era watermark that said it
    // over the band's media went with the band; the stalenote is the honest line and it stays)
    await force(evId!, 'changed')
    await reopen(evId!)
    await expect(ov.locator('.feval .wmark')).toHaveCount(0)
    // …on the title row's CHIP (the note that stood under the name went with the proof header,
    // 2026-09-02, and the mark whose hover spelled the drift went with the test group the same day,
    // the human): the chip spells ◈ Changed in words, which is the reader's one Changed cue —
    // hue never alone, and never a second mark to disagree with it
    await expect(ov.locator('.fread .stalenote')).toHaveCount(0)
    await expect(ov.locator('.fread .frmeta .fchip')).toHaveText('◈ Changed')
    await expect(ov.locator('.fread .frmeta .fchip')).toHaveClass(/\bchanged\b/)
    await expect(ov.locator('.frmeta .fpm')).toHaveCount(0)

    // UNTESTED → the honest line and the next move, now in the proof HEADER where the band used to
    // carry them; the button still opens the add-test prompt with this requirement pre-picked
    // (R15 behavior, unchanged)
    await force(evId!, 'untested')
    await reopen(evId!)
    await expect(ov.locator('.feval .fmedia')).toHaveCount(0)   // no frames, no video — nothing to show
    await expect(ov.locator('.fread .frmeta .fchip')).toHaveText('○ Untested')        // covered, nothing green
    await expect(ov.locator('.fread .frmeta .fchip')).not.toHaveClass(/\bpassed\b/)
    await expect(ov.locator('.frmeta .fpm')).toHaveCount(0)
    await expect(ov.locator('.frmeta .fptop .fpacts > .runone')).toBeVisible()        // Run still stands on the row
    await ov.locator('.frmeta .fmenubtn').click()
    await ov.locator('.frmeta .fmenupop [data-prompt="addtest"]').click()
    await expect(page.locator('#promptsheet')).toHaveClass(/\bon\b/)
    await expect(page.locator('#promptbody')).toContainText('spec/board/test.spec.ts')
    await page.locator('#promptsheet [data-promptclose]').click()
    await force(evId!, 'passed')   // leave the forced node in a proven state for later reads

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
    // the mockup's pager: 30px pages, the current page ringed in ink (NOT inverted — Run all is the
    // detail's one inverted element, the design system's rule; the mockup's sumi fill is a listed
    // divergence). NO keyboard hint rides this bar any more (rule 4 — the human, 2026-09-02:
    // "remove the short cut key hint in this page, only mention in the setting page"): this leg
    // asserted the legend's exact words, and the legend moved to the guide, so the leg asserts its
    // ABSENCE. Where it went is proven in the R20 test ("the guide is where the shortcuts live").
    await expect(dt.locator('.dtfoot .fpk'), 'no keyboard legend on the pager bar').toHaveCount(0)
    await expect(dt.locator('.dtfoot')).not.toContainText('PgUp')
    const curDot = dt.locator('.dtfoot .fdot.cur')
    expect(await curDot.evaluate(el => getComputedStyle(el).borderColor)).toBe('rgb(28, 27, 24)')
    expect(await curDot.evaluate(el => el.getBoundingClientRect().height)).toBe(30)
    // rule 2 (review B-3): computed, not inline — a CSS-inverted current page must fail this
    expect(await curDot.evaluate(el => getComputedStyle(el).backgroundColor), 'the current page is not inverted').toBe('rgba(0, 0, 0, 0)')
    expect(await dt.locator('.btn.pri').count(), 'Run all is the detail\'s one inverted element').toBe(1)
    const secondId = (await ov.locator('.fread .frmeta .fid').textContent())!.trim()
    // PgUp / PgDn change the requirement now (the human, 2026-09-02: ← → walk the beat instead, so
    // the pager moved to its own dedicated keys)
    await page.keyboard.press('PageUp')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(firstId)
    await page.keyboard.press('PageDown')
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
    await expect(open13.locator('.fread .fstory .sbframe iframe.repframe')).toHaveCount(2) // each row's Expected picture, in place too
    await expect(open13.locator('.fread .fstory .sbhead .sbhc')).toHaveCount(3)   // …under the same three column names
    await expect(open13.locator('.fread .fbody')).toHaveCount(0)         // no prose block (2026-09-02)
    await expect(open13.locator('.fread > .frmeta .fptop')).toBeVisible()  // the proof line, in the title row
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

    // The title row's state is COVERAGE-honest (board R4/R3): ✓ Passed only for a Passed requirement,
    // ✗ Failed under a failed run. That honesty rode a second MARK beside the covering test's name
    // until 2026-09-02, when the human took the whole TEST ✓ <name> group off the row; the chip is the
    // one word for it now, so the leg measures the chip and asserts the mark is gone. Same
    // forced-status technique as above; the coverage tags stay real, so the row still resolves a
    // genuine covering test into its Run and its ⋯.
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
    await expect(dt.locator('.focusov .fread .frmeta .fchip')).toHaveText('✓ Passed')   // ✓ — proven
    await expect(dt.locator('.focusov .fread .frmeta .fchip')).toHaveClass(/\bpassed\b/)
    await expect(dt.locator('.focusov .frmeta .fpm')).toHaveCount(0)                    // no second mark on the row
    await expect(dt.locator('.focusov .frmeta .fptop .fpacts > .runone')).toBeVisible() // the test's Run does ride it
    await page.goto(`/#/board/${otherId}`)
    await expect(dt.locator('.focusov .fread .frmeta .fid')).toHaveText(otherId!)
    await expect(dt.locator('.focusov .fread .frmeta .fchip')).toHaveText('✗ Failed')   // ✗ — never reads as green
    await expect(dt.locator('.focusov .fread .frmeta .fchip')).toHaveClass(/\bfailed\b/)
    await expect(dt.locator('.focusov .fread .frmeta .fchip')).not.toHaveClass(/\bpassed\b/)
    await expect(dt.locator('.focusov .frmeta .fpm')).toHaveCount(0)
  })
})

// ── THE STORYLINE READER'S OWN REQUIREMENTS (R18–R21, drafted 2026-08-28 on the human's behalf from
// the redesign they ordered and reviewed this session) ────────────────────────────────────────────
// The four behaviours below were built and asserted inside the R13 test above; giving them their own
// ids means giving them their own PROOF, so the assertions that belong to each were MOVED here, not
// copied — a requirement proven under somebody else's tag is not proven at all (R4/R6). What is new
// is what the split exposed: R19's camera equality, R20's already-running loop, R21's persistence.
import { parseBehavior } from '../../tools/behavior.mjs'
// the REPLICA gate's own reader (phase 4a, 2026-09-03): the board asks the SAME functions
// `npm run proof mirror` asks of a committed replica, so this test cannot pass on a weaker reading of
// the picture than the gate makes.
import { replicaAttrs } from '../../tools/replica-gate.mjs'
import { layoutHash } from '../../tools/viz.mjs'
// phase 7: a screen with a PRD, its derived sketch and NOTHING else — the state every screen starts
// in, which none of this repo's own four screens is in any more (they are all harvested)
import { makeSketchScreen, screenRows } from '../_fixture'

// The board's own harvested SPECIMENS (rewritten 2026-09-03 with the human's Expected View decision:
// the drawn ui-mirror is retired, so a specimen is no longer "a requirement with a committed
// wireframe" but one whose beat was photographed WITH its layout skeleton AND its committed
// REPLICA — the app's own markup for the region the assertion rang). Read off the fold and the tree,
// so the oracle is the harvest itself and never a fixture.
const replicaSpecimens = () => {
  const idx = JSON.parse(readFileSync('spec/_results-index.json', 'utf8'))
  const ev = (idx.board && idx.board.evidence) || {}
  const out: Array<{ rid: string, beat: any, rep: string, exp: string, claimed: Array<{ file: string, claims: any[] }>, lay: any }> = []
  for (const rid of Object.keys(ev)) {
    const beat = ((ev[rid] || {}).beats || [])[0]
    if (!beat || !beat.before || !beat.after || !beat.layoutAfter) continue
    const exp = beat.replicaExpectedAfter || ''
    const rep = beat.replicaExpectedBefore || ''
    if (!exp || !rep || !existsSync(exp) || !existsSync(rep) || !existsSync(beat.layoutAfter)) continue
    // …and WHAT IT CLAIMS, and WHERE (2026-09-04): a claim is filed on the moment that made it — the
    // VALUE moment proveVisible rang — so the picture that can be shown to be an ANSWER rather than
    // merely a likeness is that moment's Expected, not the beat's resting one. Read here, with its
    // own file, so the test can walk the row to exactly it.
    const claimed: Array<{ file: string, claims: any[] }> = []
    for (const v of (beat.values || [])) {
      const f = v && v.replicaExpected
      if (!f || !existsSync(f)) continue
      const cs = (replicaAttrs(readFileSync(f, 'utf8')).claims || [])
        .filter((c: any) => c && typeof c.expected === 'string' && c.expected.trim())
      if (cs.length) claimed.push({ file: f, claims: cs })
    }
    out.push({ rid, beat, rep, exp, claimed, lay: JSON.parse(readFileSync(beat.layoutAfter, 'utf8')) })
  }
  // a specimen whose beat actually RANG something leads: it is the one that can prove the picture is
  // aimed at the component, not merely present
  return out.sort((a, b) => (b.lay && b.lay.ring ? 1 : 0) - (a.lay && a.lay.ring ? 1 : 0))
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
// …and a requirement's own TITLE, off any screen's prd.md: the oracle for what the reader must show
// when a tag is followed to the screen it names (a claim's expected is the app's own text, and the
// tree is where that text is written).
const prdTitle = (screen: string, rid: string) => {
  const p = 'spec/' + screen + '/prd.md'
  if (!existsSync(p)) return ''
  const m = new RegExp('^##\\s+' + rid + '\\s+[—-]\\s+(.+)$', 'm').exec(readFileSync(p, 'utf8'))
  return m ? m[1].trim() : ''
}
const plain = (s: string) => String(s || '').replace(/[`*]/g, '').replace(/\s+/g, ' ').trim()

// Board R18 — THE EXPECTED PICTURE IS THE APP'S OWN COMPONENT. The left half of a row is no longer
// DRAWN from the app's measured layout: since the human's Expected View decision (2026-09-03) it is
// the app's own sanitised markup, captured around the ring, re-rendered with the requirement's claim
// applied, in a sandboxed iframe on a paper page at the app's own coordinates. What did not change is
// the honesty: where nothing was harvested there is no picture, and the board says so.
//
// (The previous four beats asserted the ui-mirror's own marks — data-viz-kind="wireframe", a layout
// pin, the drawn shape count against the measured element count, and the committed drawing against
// mirrorGaps. They are REPLACED, not weakened: the requirement changed by the human's decision, and
// nothing derives or keeps a wireframe any more. The replica's equivalent guard is `npm run proof
// mirror`'s checkReplicas, which reads the committed file box-for-box and word-for-word.)
test('The Expected picture is the app\'s own component — captured, sandboxed, or honestly no picture', async ({ page }) => {
  // FOUR beats, each with its own fixture, a re-fetch of a MB-sized board and (since phase 6) a
  // claim of its own to ring, photograph and replicate. It measured 25 s before those claims and
  // 60+ after — patience, never an assertion: nothing this test proves changes with the number.
  // (Raised again with phase 7's leg, which stands up a whole scratch SCREEN, rebuilds the board
  // twice and re-reads it twice.)
  test.setTimeout(210000)
  await coverReqs('R18')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  const ov = dt.locator('.focusov')

  // beat 1 — THE PICTURE IS THE APP'S OWN MARKUP. The oracle is the harvest itself: the fold names
  // the replica each beat left behind, and the cell must be showing THAT file — inert (a sandbox with
  // no allow-* token, no script in the document), the EXPECTED side of the pair, and standing at the
  // app's own coordinates with the very ring the run painted. A drawing fails every line of this.
  await checkReq('R18', async () => {
    const spec = replicaSpecimens()[0]
    expect(spec, 'a board requirement harvested WITH its layout skeleton and its replica').toBeTruthy()
    await page.goto('/#/board/' + spec.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(spec.rid)
    const cell = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1).locator('.sbframe')
    const frame = cell.locator('iframe.repframe')
    await expect(frame, 'the Expected cell is one sandboxed frame, not a drawing').toHaveCount(1)
    await reveal(cell)
    // …walked to the beat's RESULT, which is the moment that carries the Expected half (a before has
    // claimed nothing, so its picture is the Actual under a second name — phase 2's own rule)
    const strip = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1).locator('.mstrip')
    if (await strip.count()) {
      for (let i = 0; i < 8; i++) {
        const at = ((await strip.locator('.mpos').textContent()) || '1 / 1').split('/').map(t => Number(t.trim()))
        if (at[0] >= at[1]) break
        await strip.locator('.mnext').click(); await page.waitForTimeout(80)
      }
    }
    await expect.poll(() => cell.evaluate(el => String((el as HTMLElement).dataset.repside || '')),
      { timeout: 8000, message: 'the beat\'s result shows the EXPECTED half of the pair' }).toBe('expected')
    // INERT BY CONSTRUCTION: an empty sandbox attribute is every restriction on — no scripts, no
    // same-origin identity, no navigation — and the document itself carries no script to run either.
    await expect(frame).toHaveAttribute('sandbox', '')
    const doc = await frame.evaluate(f => String((f as HTMLIFrameElement).srcdoc || ''))
    expect(/<script/i.test(doc), 'the Expected page carries no script at all').toBe(false)
    expect(/\son\w+\s*=\s*["\']/i.test(doc), 'nor an inline handler').toBe(false)
    // IT IS THE COMMITTED FILE, not a re-render of anything: the replica's own root attributes ride
    // in it, and they are the ones the gate reads off the file on disk.
    const onDisk = replicaAttrs(readFileSync(spec.exp, 'utf8'))
    expect(doc.includes('data-replica-side="expected"'), 'the root says which half of the pair it is').toBe(true)
    expect(doc.includes('data-replica-kit="' + onDisk.kit + '"'), 'and which kit captured it').toBe(true)
    expect(doc.includes('data-replica-region="' + (onDisk.region
      ? [onDisk.region.x, onDisk.region.y, onDisk.region.w, onDisk.region.h].join(' ')
      : '')  + '"'), 'and stands at the region the capture measured').toBe(true)
    // …AND IT IS AIMED AT THE COMPONENT: the ring in the picture is the box the run actually painted,
    // read independently off the layout skeleton the fold committed beside it.
    const ring = spec.lay && spec.lay.ring
    if (ring) {
      const want = [ring.x, ring.y, ring.w, ring.h].map(Math.round).join(' ')
      await hudCheck('the picture wears the ring the run painted', want,
        (/data-ring-box="([^"]*)"/.exec(doc) || ['', '(none)'])[1])
      expect(doc.includes('data-ring-box="' + want + '"')).toBe(true)
      expect(/class="sbring"/.test(doc), 'and paints it, in the overlay\'s own geometry').toBe(true)
    }
    // …AND THE RINGED ELEMENT SAYS WHAT THE REQUIREMENT ASKED FOR. This is the whole difference
    // between the Expected and the Actual beside it: spec/_replica.mjs applies the beat's claim to
    // the app's own markup. Until 2026-09-04 no board beat rang a value, so every committed
    // `.expected.html` carried an empty `data-claims`, this branch never ran, and what did run was a
    // tautology (`said !== null` on a string). R1's crumb beat now proves its value with
    // proveVisible, so the claim path is exercised on this board's own harvest — and the assertion
    // below FAILS, rather than quietly skipping, if that ever stops being true.
    const withClaim = replicaSpecimens().filter(sp => sp.claimed.length)
    expect(withClaim.length,
      'at least one board beat rings and claims a value, so the Expected can be shown to be an ANSWER')
      .toBeGreaterThan(0)
    const cs = withClaim[0]
    const moment = cs.claimed[0]
    await page.goto('/#/board/' + (cs.rid === spec.rid ? (cs.rid === 'R2' ? 'R3' : 'R2') : spec.rid))
    await page.goto('/#/board/' + cs.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(cs.rid)
    const crow = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1)
    await reveal(crow)
    // walk to the moment that MADE the claim (the value proveVisible rang), not to the beat's rest
    const showing = () => crow.locator('.sbframe').evaluate(el => String((el as HTMLElement).dataset.repsrc || ''))
    const cstrip = crow.locator('.mstrip')
    for (let i = 0; i < 8 && !String(await showing()).startsWith(moment.file); i++) {
      if (!(await cstrip.count())) break
      await cstrip.locator('.mnext').click(); await page.waitForTimeout(120)
    }
    expect(String(await showing()).startsWith(moment.file),
      'the row walks to the moment that made the claim: ' + moment.file + ' vs ' + (await showing())).toBe(true)
    const cdoc = await crow.locator('.sbframe iframe.repframe').evaluate(f => String((f as HTMLIFrameElement).srcdoc || ''))
    const rang = await crow.locator('.sbframe').evaluate((el, src) => {
      void el
      const d = new DOMParser().parseFromString(String(src), 'text/html')
      const e = d.querySelector('[data-ring]')
      return e ? (e.textContent || '').replace(/\s+/g, ' ').trim() : ''
    }, cdoc)
    const want = String(moment.claims[moment.claims.length - 1].expected).replace(/\s+/g, ' ').trim()
    await hudCheck('the ringed element carries what the requirement asked for', want, rang || '(nothing ringed)')
    expect(rang, 'the Expected\'s ringed element carries the claim\'s expected value').toContain(want)
    // …and the same fact CLAIMED on the surface a reader actually reads (the authored-intent lint,
    // phase 6): the chip over the Expected cell says the value the requirement asked for. The
    // expected string comes from the FOLD's own record of the claim, never off the page.
    await proveVisible(crow.locator('.sbframe .pchip .pcv'), want,
      'The Expected picture, carrying the requirement\'s own value',
      { match: (shown: string) => plain(shown).includes(plain(want)), soft: true })
    // …and the claim is MARKED on it, so a reader sees which words the requirement put there
    expect(/data-claim="(?:ok|fixed|restored|new)"/.test(cdoc),
      'the claimed element is marked in the picture, not silently corrected').toBe(true)
    // C2 — EVERY FONT URL IN THE SRCDOC IS ABSOLUTE. An `about:srcdoc` document resolves a relative
    // url against the PARENT's base, so a relative face would 404 and the replica would render in a
    // fallback stack: a picture of a different app, silently. (This repo declares no @font-face, so
    // the sheet is empty here and this holds vacuously — the rewrite itself is pinned in
    // tools/evidence.test.mjs. It fails the moment a screen with web fonts is harvested wrong.)
    const urls = (cdoc.match(/url\(\s*["']?([^"')]+)["']?\s*\)/gi) || [])
      .map(u => (/url\(\s*["']?([^"')]+)["']?\s*\)/i.exec(u) || ['', ''])[1])
    expect(urls.filter(u => !/^(?:https?:|data:|blob:|\/)/i.test(u)),
      'no relative url reaches the srcdoc — it would resolve against the board, not the harvest').toEqual([])
    // …and the Then's other two clauses are facts about the FILE, not values on the board. Both are
    // asserted above, out of the committed file itself: its root says which kit captured it and at
    // which region it stands, and its ring box is the one the run painted. A sandboxed frame is not
    // readable from the page it sits in, so there is nothing here for a claim to ring — what the
    // reader sees is the picture, and the value inside it is claimed on the line above.
    intentGap('"the app\'s OWN markup, captured, sanitised and committed beside the frame" is a property of the committed file — asserted here by reading its root attributes and its srcdoc out of the file on disk; a sandboxed frame carries no value the board\'s own page can read')
    intentGap('"re-rendered on paper at the app\'s own coordinates" is the region rectangle, compared above against the layout skeleton the fold committed beside it — a rectangle, never a value an element states')
  })

  // beat 2 — NO REPLICA, NO PICTURE (moved here from the R13 test on 2026-08-28: the honest
  // placeholder is what this requirement DOES when there is nothing to show, so it belongs to R18).
  // FORCED through the real pipeline: every harvested requirement has a replica, so no live specimen
  // lacks one — serve board.html with one requirement's evidence attribute stripped and let the
  // client parse it as harvest-less, end to end.
  await checkReq('R18', async () => {
    const stripR2 = (u: URL) => u.pathname === '/' || u.pathname === '/board.html'
    await page.route(stripR2, async rt => {
      const res = await rt.fetch(); const html = await res.text()
      // scope to THE BOARD SCREEN's R2 — every screen on this board has an R2 of its own
      const scr = html.indexOf('data-screen="board"')
      const i = html.indexOf('data-r="R2"', scr); const j = html.indexOf('data-r="R3"', i)
      const seg = html.slice(i, j)
        .replace(/ data-ev-beats="[^"]*"/, '')
        .replace(/<figure class="schematic"[\s\S]*?<\/figure>/, '')
      await rt.fulfill({ body: html.slice(0, i) + seg + html.slice(j), contentType: 'text/html' })
    })
    await page.goto('/#/board/R2')
    await page.reload()
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText('R2')
    const r2story = ov.locator('.fread .fstory')
    await reveal(r2story)
    await expect(r2story).toContainText('no Expected yet')
    await expect(r2story.locator('.sbframe iframe.repframe')).toHaveCount(0)   // no picture where none was captured
    await expect(r2story.locator('.sbframe svg')).toHaveCount(0)               // and none invented from the sentence either
    await expect(r2story.locator('.sbframe .noschem').first()).toBeVisible()
    // the fact, CLAIMED: where nothing was harvested the cell SAYS so — it never invents a picture
    // of a screen (the authored-intent lint, phase 6)
    await proveVisible(r2story.locator('.sbframe .noschem').first(), 'no Expected yet',
      'The honest blank where nothing was captured',
      { match: (shown: string) => shown.startsWith('no Expected yet'), soft: true })
    // …AND NEVER A GUESSED PICTURE OF A SCREEN, claimed as the absence it is: where nothing was
    // captured there is no replica frame at all. `MISSING` passes exactly while none is mounted and
    // fails, with whatever it holds, the moment the reader invents one.
    await proveVisible(r2story.locator('.sbframe iframe.repframe'), MISSING,
      'Never a guessed picture — no frame where nothing was captured', { soft: true })
    await expect(r2story.locator('.sbrow .sbtext .sbwhen').first()).toBeVisible()   // the keyword-led sentences still show
    await expect(r2story.locator('.sbrow').first().locator('.sbtext')).toContainText('Given')
    const gapSaid = (await r2story.locator('.sbframe .noschem').first().textContent() || '').trim()
    await hudCheck('no replica, no picture', 'no Expected yet',
      gapSaid.includes('no Expected yet') ? 'no Expected yet' : gapSaid)
    await page.unroute(stripR2)                          // syncDerived's later fetches read the true board
    // …AND THE DOCUMENT ITSELF IS RE-FETCHED (2026-09-04). Unrouting stops SERVING the stripped
    // board; it does not take the stripped one off the page, and a hash hop is not a fetch — so
    // every leg after this one went on reading a board where R2 has no evidence attribute at all.
    // It only bit once R2's beat began ringing a value and R2 became the first specimen the legs
    // below pick: `bs.find(n === 1)` came back undefined and the next leg threw inside the page.
    await page.reload({ waitUntil: 'domcontentloaded' })   // …and not for every picture on it: `load`
    // waits out each evidence frame and each replica iframe the reader mounts, which is minutes now
    // that every beat of this board harvests its own value moments.

    // …AND NEVER THE NEIGHBOUR'S PICTURE (2026-09-04, the review's C3). A row where SOME moments
    // harvested a replica and one did not must not hold the previous moment's picture up while the
    // strip and the photograph walk on — that shows two moments of a beat side by side and says it is
    // showing one. Forced by removing one moment's replica from the row's own harvest attribute (the
    // input, not the state under test — a capture that ran out of bytes produces exactly this), then
    // walking to it.
    const gapSpec = replicaSpecimens()[0]
    const gapNode = dt.locator(`.reqpane .req[data-r="${gapSpec.rid}"]`)
    const savedEv = await gapNode.getAttribute('data-ev-beats')
    try {
      await gapNode.evaluate(el => {
        const bs = JSON.parse(el.getAttribute('data-ev-beats') || '[]')
        const b = bs.find((x: any) => Number(x.n) === 1)
        delete b.replicaExpectedAfter                                 // the LAST moment lost its picture
        // …and ONLY it (corrected 2026-09-04, rule 4 — the fixture was the wrong side). This also
        // stripped every VALUE moment's replica, which was a no-op while no board beat rang a value:
        // with one, the beat's before frame stops being a moment of its own (a beat's moments are
        // its values then its result), so removing the values' pictures too left the row with NO
        // picture at all — and a row with none renders no frame to read. The leg is about a row
        // where SOME moments have a picture and one does not; that is what it now makes.
        el.setAttribute('data-ev-beats', JSON.stringify(bs))
      })
      await page.goto('/#/board/' + (gapSpec.rid === 'R2' ? 'R3' : 'R2'))
      await page.goto('/#/board/' + gapSpec.rid)
      await expect(ov.locator('.fread .frmeta .fid')).toHaveText(gapSpec.rid)
      const grow = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1)
      await reveal(grow)
      const gstrip = grow.locator('.mstrip')
      if (await gstrip.count()) {
        for (let i = 0; i < 8; i++) {
          const at = ((await gstrip.locator('.mpos').textContent()) || '1 / 1').split('/').map(t => Number(t.trim()))
          if (at[0] >= at[1]) break
          // BOUNDED (2026-09-04): this is a fixture WALK, not an assertion, and the row it walks has
          // had every picture taken off it by the leg above. A default 30s actionability wait per
          // click ate the whole test's budget the first time a board beat had moments to walk at all.
          await gstrip.locator('.mnext').click({ timeout: 4000 })
          await page.waitForTimeout(80)
        }
      }
      // the cell says what it does not have, FOR THIS MOMENT — and the seam says so too, so nothing
      // downstream can read the neighbour's path and believe it
      await expect.poll(() => grow.locator('.sbframe').evaluate(el => String((el as HTMLElement).dataset.repsrc || '')),
        { timeout: 8000, message: 'the cell names no picture for a moment that has none' }).toBe('')
      // BOUNDED like the walk above (2026-09-04): `locator.evaluate` has no timeout of its own in
      // this config, so a cell that renders no frame at all waits out the whole test and reports
      // "target closed" instead of what it could not find.
      const gdoc = await grow.locator('.sbframe iframe.repframe')
        .evaluate(f => String((f as HTMLIFrameElement).srcdoc || ''), undefined, { timeout: 8000 })
      expect(gdoc, 'the page says so in the reader\'s own words').toContain('no Expected for this moment')
      await hudCheck('a moment with no picture says so', 'no Expected for this moment',
        gdoc.includes('no Expected for this moment') ? 'no Expected for this moment' : 'the previous moment\'s picture')
    } finally {
      if (savedEv) await gapNode.evaluate((el, v) => el.setAttribute('data-ev-beats', v), savedEv)
    }

    // …AND A SCREEN WITH NO UI AT ALL WEARS THE PRODUCT (phase 7, 2026-09-04). Same When as the two
    // legs above — nothing was harvested for this requirement — and the same rule: never a guessed
    // picture of a screen. What phase 7 adds is WHERE the fallback sketch stands. A drawing on bare
    // paper says nothing about whose product it belongs to; the builder therefore names a SIBLING
    // screen's captured Before page (tools/spec-store.mjs chromeFrom — same area first, then the
    // screen with the most requirements) and the sketch is placed in the hole that page's shell
    // leaves (tools/evidence.mjs contentRect), so the row shows the app's own header and rail around
    // a labelled sketch. Nothing is invented: the chrome is a committed replica of a REAL screen and
    // the cell says whose it is.
    //
    // FORCED, because this repo has no such screen — all four of its own are harvested. The fixture
    // is a scratch screen with a PRD and the archetype drawing the production pass derives from it,
    // and nothing else; it is removed in a finally (the state guard snapshots screen dirs, and this
    // leaves none behind).
    const skScreen = 'sketchchrome'
    try {
      makeSketchScreen(skScreen)                 // writes the PRD + its derived sketch, rebuilds the board
      await page.goto('/#/' + skScreen + '/R1')
      await page.reload()                        // a hash hop is not a fetch — read the freshly built board
      const sov = page.locator(`.dt[data-screen="${skScreen}"]:not([hidden]) .focusov`)
      await expect(sov.locator('.fread .frmeta .fid')).toHaveText('R1')
      const skCell = sov.locator('.fread .fstory .sbframe.sbchrome').first()
      // BOUNDED (and the red this leg was watched go red on): with no borrowed page there is no such
      // cell, and `reveal` on a locator that matches nothing waits out the whole test instead of
      // saying what is missing.
      await expect(skCell, 'the no-UI row shows its sketch inside a sibling screen\'s page').toBeVisible()
      await reveal(skCell)
      // THE LENDER IS ONE OF THIS PROJECT'S OWN SCREENS, read off the tree (fix round 1, the review's
      // I3 — this pinned ['board','conflicts','dispatch','init'] as a literal, which is the very
      // thing screenRows/treeShape exist to stop: a fifth screen would have broken this leg).
      const lender = await skCell.evaluate(el => String((el as HTMLElement).dataset.chrome || ''))
      const rows = screenRows()
      expect(rows.map(r => r.name), 'the chrome comes from a screen of this board').toContain(lender)
      const sdoc = await skCell.locator('iframe.repframe')
        .evaluate(f => String((f as HTMLIFrameElement).srcdoc || ''), undefined, { timeout: 8000 })
      // BOTH halves in ONE page: the sibling's own committed replica root …
      expect(sdoc, 'the lender\'s captured page is the chrome').toContain('data-replica-kit=')
      expect(sdoc, 'and it is the ACTUAL side — what that screen really renders').toContain('data-replica-side="actual"')
      // … and the sketch drawn from THIS requirement's sentence, standing in it
      expect(/<svg[^>]*data-viz-archetype="/.test(sdoc), 'the sketch is in the page').toBe(true)
      expect(sdoc, 'and it stands in the hole the shell leaves, not over the whole page').toContain('class="sbsk"')
      // inert on the same terms as every other picture: no script, no allow-* token
      await expect(skCell.locator('iframe.repframe')).toHaveAttribute('sandbox', '')
      expect(/<script/i.test(sdoc), 'the borrowed page carries no script either').toBe(false)
      // the fact, CLAIMED: the cell says it is a sketch, and whose chrome it is wearing — a page that
      // quietly wore another screen's shell as its own would be the guessed picture this requirement
      // forbids. STRICT, and against THAT lender (fix round 1, the review's I2): this used to expect
      // the screen's NAME while the cell renders its TITLE, and to match `in \S.*’s chrome`, so it
      // recorded a green ✓ over two different strings AND passed for any lender at all — which is
      // exactly the fact the leg exists to catch. The title comes off the cell (what the client
      // rendered) and is checked against the tree's own title for the screen whose page is in the
      // frame, so the caption, the seam and the disk must all name one screen.
      const title = await skCell.evaluate(el => String((el as HTMLElement).dataset.chrometitle || ''))
      expect(title, 'the caption names the very screen whose page is in the frame')
        .toBe((rows.find(r => r.name === lender) || { title: '' }).title)
      await proveVisible(skCell.locator('.sbprov'), '◇ sketch · no UI yet · in ' + title + '’s chrome',
        'A screen with no UI: its sketch, in a sibling\'s chrome', { soft: true })
    } finally {
      rmSync('spec/' + skScreen, { recursive: true, force: true })
      build()                                    // the board back to the true tree, with no fixture row on it
    }
    await page.reload()                          // …and the page reading it, for the beats below
  })

  // beat 3 — THE PICTURE IS SELF-EVIDENT (the human, 2026-09-02: "avoid useless things"). No per-cell
  // provenance caption anywhere in the reader; staleness is said by the storyline's STALE BANNER, and
  // the picture's provenance still travels into the ⋯ "the Expected picture doesn't match my app"
  // prompt (the R15-pattern escape), so a reader can still act on a wrong picture.
  await checkReq('R18', async () => {
    const spec = replicaSpecimens()[0]
    expect(spec, 'a board requirement with a committed replica').toBeTruthy()
    const hop = spec.rid === 'R2' ? 'R3' : 'R2'
    await page.goto('/#/board/' + hop)
    await page.goto('/#/board/' + spec.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(spec.rid)
    await reveal(ov.locator('.fread .fstory'))
    await expect(ov.locator('.fread .fstory .sbframe .sbprov'), 'no per-cell provenance caption on a replica').toHaveCount(0)
    // the fact, CLAIMED AS AN ABSENCE (fix round 1, 2026-09-04): there is no per-cell caption on the
    // picture — MISSING passes exactly while there is none, and names the caption if one returns.
    await proveVisible(ov.locator('.fread .fstory .sbframe .sbprov').first(), MISSING,
      'No per-cell provenance caption', { soft: true })
    // …and the ⋯ escape carries the picture's provenance into the prompt
    await ov.locator('.fread .frmeta .fmenu .fmenubtn').click()
    await ov.locator('.fread .frmeta .fmenupop [data-prompt="schemwrong"]').click()
    await expect(page.locator('#promptsheet')).toHaveClass(/\bon\b/)
    // the escape itself, CLAIMED (the authored-intent lint, phase 6): with no per-cell caption, the
    // way to act on a wrong picture is this ⋯ prompt, and the window says which one it opened
    await proveVisible(page.locator('#prompttitle'), 'The Expected picture doesn’t match my app',
      'The R15-pattern escape for a picture that is wrong', { soft: true })
    await expect(page.locator('#promptbody'), 'the provenance rides into the prompt')
      .toContainText('the app’s own markup')
    await expect(page.locator('#promptbody'), 'and it says the picture is captured, never authored')
      .toContainText('CAPTURED, never authored')
    await page.locator('#promptsheet [data-promptclose]').click()
    const capCount = await ov.locator('.fread .fstory .sbprov').count()
    await hudCheck('the picture is self-evident — no per-cell caption', '0 captions', String(capCount) + ' captions')
  })

  // beat 4 — THE GAP CANNOT OPEN AGAIN (the human, 2026-09-02: "make sure the gap between schematic
  // and proof will not exist again"), on the replica. Two halves of one guard:
  //   (a) the COMMITTED replica of a real harvested requirement was GATED — walked back in the app's
  //       own page and measured against the skeleton beside it — and its pin still hashes that
  //       skeleton. This is the very check `npm run proof mirror` refuses a picture on.
  //   (b) when the app moves past the picture, the storyline SAYS SO — the one stale banner, naming
  //       the layout rather than the words.
  await checkReq('R18', async () => {
    intentGap('the second and third facts are the CLI gate\'s, not the board\'s: "the proof gate refuses ' +
      'that picture until the screen is re-harvested" is npm run proof mirror reading committed files, ' +
      'and this beat proves it by reading those files — there is no screen showing a refusal. The first ' +
      'fact, the stale banner, is claimed below.')
    const specs = replicaSpecimens()
    expect(specs.length, 'the fold committed replicas for this screen').toBeGreaterThan(0)
    // (a) every committed Expected of this screen carries the gate's own pin, and it still hashes the
    // skeleton on disk beside it — a picture the harvest has moved past is caught here, not by eye.
    const unpinned: string[] = []
    for (const sp of specs) {
      const a = replicaAttrs(readFileSync(sp.exp, 'utf8'))
      if (!a.layout) { unpinned.push(sp.rid + ': never gated'); continue }
      if (a.layout !== layoutHash(sp.lay, null)) unpinned.push(sp.rid + ': the harvest moved past it')
    }
    await hudCheck('every committed Expected was measured against its own harvest',
      specs.length + ' gated', (specs.length - unpinned.length) + ' gated')
    expect(unpinned, 'a replica nothing walked back, or one the harvest has moved past').toEqual([])
    // (b) THE PIN IS A LIVE WIRE, and the banner reads it. Two halves, and neither forces the state
    // it observes (rewritten 2026-09-04, the review's C1 — this used to set `b.lstale = true` on the
    // baked attribute by hand, which went green over a fold that recorded no pin at all and a
    // derivation that could therefore never fire).
    //
    // FIRST, on real data: every beat carries the pin its replica was gated against, and it still
    // equals the hash of the skeleton on disk — so the storyline is honestly NOT stale. A fold that
    // stops recording the pin fails here, at the wire.
    const pins = specs.map(sp => ({
      rid: sp.rid,
      pin: (sp.beat.gate && sp.beat.gate.pin) || '',
      want: layoutHash(sp.lay, null)
    }))
    await hudCheck('every beat carries the pin its picture was gated against', specs.length + ' pinned',
      pins.filter(x => x.pin).length + ' pinned')
    expect(pins.filter(x => !x.pin).map(x => x.rid),
      'a beat with no pin is a banner that can never say "layout moved"').toEqual([])
    expect(pins.filter(x => x.pin !== x.want).map(x => x.rid),
      'and every pin still hashes the skeleton beside it, so nothing here is stale').toEqual([])
    // SECOND, DERIVED end to end: move the app (a real edit to the committed skeleton the pin was
    // taken against), rebuild the board through the real builder, and read the banner. The chain is
    // the production one — file on disk → tools/build-board.mjs evAttrs → data-ev-beats → the
    // storyline's one banner — so it fails if any link of it dies. Restored in a finally, and the
    // board rebuilt from the true tree, so the run leaves nothing behind.
    const spec4 = specs[0]
    const layFile = spec4.beat.layoutAfter as string
    const original = readFileSync(layFile, 'utf8')
    try {
      const moved = JSON.parse(original)
      if (moved.els && moved.els.length) moved.els[0].x = Number(moved.els[0].x || 0) + 7   // the app moved
      writeFileSync(layFile, JSON.stringify(moved))
      build()
      const hop2 = spec4.rid === 'R2' ? 'R3' : 'R2'
      await page.goto('/#/board/' + hop2)
      await page.reload()                                   // read the freshly built board
      await page.goto('/#/board/' + spec4.rid)
      await expect(ov.locator('.fread .frmeta .fid')).toHaveText(spec4.rid)
      await reveal(ov.locator('.fread .fstory'))
      await expect(ov.locator('.fread .fstory.isstale'), 'the storyline marks itself stale').toHaveCount(1)
      const banner = ov.locator('.fread .fstory .sbstale')
      await expect(banner).toBeVisible()
      await expect(banner).toContainText('layout moved')
      await hudCheck('the banner names the layout, not the words', 'layout moved',
        ((await banner.locator('b').textContent()) || '').replace('stale — ', ''))
      // the fact, CLAIMED (the authored-intent lint, phase 6): the app moved past this picture and
      // the storyline SAYS so, naming the layout — this is the banner, read as a reader reads it
      await proveVisible(banner.locator('b'), 'stale — layout moved',
        'The banner, naming what moved', { soft: true })
      await expect(banner).toContainText('the app’s layout moved since this picture was captured')
      // …AND IT IS NEVER SHOWN AS CURRENT: the storyline that carries a stale banner carries no
      // fresh-picture marker at all. The banner IS the row's own statement that what it shows has
      // stopped matching the run, claimed above; this claims the other half — nothing on the row
      // still says the picture is current.
      await proveVisible(ov.locator('.fread .fstory:not(.isstale)'), MISSING,
        'A picture that stopped matching is never shown as current', { soft: true })
    } finally {
      writeFileSync(layFile, original)
      build()
      await page.goto('/#/board/' + (spec4.rid === 'R2' ? 'R3' : 'R2'))
      await page.reload()
    }
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
// A SPECIMEN THAT CLAIMED SOMETHING — the row phases 4b and 5 are about. A chip says what a moment
// claimed, a marker says how it differed, and a loupe magnifies what it rang, so all three need a
// beat whose harvest carries a real claim on a real value frame. Read off the fold's own record.
const claimSpecimen = () => replicaSpecimens().find(s => (s.beat.values || [])
  .some((v: any) => v && v.frame && v.claim && typeof v.claim.expected === 'string' && v.claim.expected.trim()))
// …and the fixture that makes that claim FAIL. The board's own suite passes (that is the point of
// it), so nothing in this repo's harvest is red — the failed moment R23 is about is DERIVED, the
// same established data-ev-beats technique R18 and R20 already use: the committed frames, layouts
// and replicas stay exactly as the run took them; only what the run RECORDED as the outcome is
// rewritten, and the reader is rebuilt from that. Returns what it wrote, so the test can assert the
// marker carries those very words. `null` restores.
const armClaim = async (dt: any, rid: string, got: string | null) =>
  dt.locator(`.reqpane .req[data-r="${rid}"]`).evaluate((el: Element, arg: any) => {
    const beats = JSON.parse(el.getAttribute('data-ev-beats') || '[]')
    const b1 = beats.filter((b: any) => Number(b.n) === 1)[0]
    const v = b1 && (b1.values || []).filter((x: any) => x && x.frame && x.claim)[0]
    if (!v) return null
    const el2 = el as HTMLElement
    if (arg.got === null) {
      if (el2.dataset.wasEv) { el.setAttribute('data-ev-beats', el2.dataset.wasEv); delete el2.dataset.wasEv }
      return null
    }
    if (!el2.dataset.wasEv) el2.dataset.wasEv = el.getAttribute('data-ev-beats') || ''
    v.claim = { expected: v.claim.expected, got: arg.got, ok: false, label: v.claim.label }
    el.setAttribute('data-ev-beats', JSON.stringify(beats))
    return { expected: v.claim.expected, got: arg.got }
  }, { got })
// the ABSOLUTE magnification a camera box shows its page at — page pixels to cell pixels — which is
// the number the moment camera caps (tools/board/stepper.js frameFor: never past 1.25×). Read back
// out of the transform and the media's own laid-out width, so it answers for the replica (a page-
// sized frame) and the photograph (a screenshot) identically.
const camScale = (box: any, vw: number) => box.evaluate((el: Element, w: number) => {
  const sub = (el.querySelector('.fsteps img.on') || el.querySelector('.camsub')) as HTMLElement
  if (!sub) return null
  const t = getComputedStyle(sub).transform
  const m = new DOMMatrixReadOnly(t && t !== 'none' ? t : '')
  const mw = sub.offsetWidth
  return (mw > 0 && w > 0) ? m.a * mw / w : null
}, vw)
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
  const spec = replicaSpecimens()[0]
  expect(spec, 'a board requirement harvested with a beat pair and its committed replica').toBeTruthy()

  // beat 1 — ONE CAMERA, ONE REGION. Both cells zoom together, and the rectangle each one actually
  // frames — computed back out of its own transform — is the same fraction of the same page, aimed
  // at the focused component. Aim one cell somewhere else and this fails.
  await checkReq('R19', async () => {
    // ONE DECLARATION PER FACT (final review I3, 2026-09-04): the beat has a page open, so each
    // fragment of this Then declares for itself. The fact is ONE geometric statement — the splitter
    // reads four fragments in it — and every fragment is measured below by computing each cell's own
    // framed rectangle back out of its transform. None of them is a value any element renders, and a
    // claim beside them would be filler.
    intentGap('"the Expected cell" is a CELL, not a value: what this beat proves about it is the rectangle its transform frames, computed below — nothing in it says where it is aimed')
    intentGap('"the Actual cell are aimed by ONE camera at the same region of the same page" is an equality between two transforms, asserted below to three decimal places — a camera writes nothing on screen for a claim to read')
    intentGap('"so the replica" — the replica is an iframe of the app\'s own markup, and the fact proved about it here is where it is aimed, which is geometry, not any word inside it')
    intentGap('"the photograph can never frame different things" is a NEGATIVE over the pair, proved by the two framed rectangles agreeing — no element reads "they agree"')
    const focus = await armFocus(dt, spec.rid)
    expect(focus, 'the requirement carries a harvested beat to frame').toBeTruthy()
    // a hash hop REBUILDS the reader off the forced attribute; a goto to the URL the page is already
    // on would reload and wipe it, so the hop always lands somewhere else first
    await page.goto('/#/board/' + (spec.rid === 'R2' ? 'R3' : 'R2'))
    await page.goto('/#/board/' + spec.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(spec.rid)
    const row = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1)     // beat 1's own row
    await reveal(row)
    const drawn = row.locator('.sbframe .pcbox')      // the Expected cell's camera
    const shot = row.locator('.sbproof .pcbox')       // …and the Actual's
    await expect(drawn).toHaveClass(/\bzoomed\b/)
    await expect(shot).toHaveClass(/\bzoomed\b/)
    // the frames must have DECODED before their laid-out height means anything
    await expect.poll(() => row.locator('.sbproof .fsteps img').evaluateAll(
      (els: HTMLImageElement[]) => els.length > 0 && els.every(i => i.complete && i.naturalWidth > 0)),
    { timeout: 5000 }).toBe(true)
    const a = await framedRegion(drawn)
    const b = await framedRegion(shot)
    expect(a, 'the Expected picture is under a camera').toBeTruthy()
    expect(b, 'and so is the Actual').toBeTruthy()
    for (const k of ['x', 'y', 'w', 'h'] as const) {
      expect(Math.abs(a[k] - b[k]), `the Expected and the Actual frame the same region (${k})`).toBeLessThan(0.03)
    }
    // …and that region is aimed at the FOCUSED COMPONENT: the ringed box's centre lies inside both
    const cx = (focus.x + focus.w / 2) / focus.vw
    const cy = (focus.y + focus.h / 2) / focus.vh
    for (const [name, r] of [['the Expected', a], ['the Actual', b]] as Array<[string, any]>) {
      expect(cx > r.x && cx < r.x + r.w, name + ' is aimed at the focused component (x)').toBe(true)
      expect(cy > r.y && cy < r.y + r.h, name + ' is aimed at the focused component (y)').toBe(true)
    }
    await hudCheck('one camera, one region', 'same region', Math.abs(a.x - b.x) < 0.03 && Math.abs(a.w - b.w) < 0.03 ? 'same region' : 'two regions')
    // …AND THE SAME CAMERA IS EASED (moved here 2026-09-04, phase 6 fix round 2): this leg was a
    // THIRD checkReq for a two-beat requirement, so the cursor clamped it onto beat 2 and it
    // harvested the caption beat's pictures while being about the camera. It is beat 1's own
    // subject — one camera, one region — so it stands inside beat 1, in its own brace scope.
    {
  // beat 3 — THE EASED CAMERA (the human, 2026-09-03: the first cut of design C "zoomed in a bit too
  // much"). A moment's frame is the ring UNION THE CHIP that explains it, with generous room and a
  // gentle cap: never more than 1.25× the app's own natural size, because a picker blown up to fill
  // the cell loses the header it sits in — and a chip cropped off the edge is a caption on nothing.
  // Asserted on BOTH cells, since a cap that held on one side would frame two different regions.
    const cs = claimSpecimen()
    expect(cs, 'a board beat whose harvest carries a claim to caption').toBeTruthy()
    await armFocus(dt, cs!.rid)
    await page.goto('/#/board/' + (cs!.rid === 'R2' ? 'R3' : 'R2'))
    await page.goto('/#/board/' + cs!.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(cs!.rid)
    const row = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1)
    await reveal(row)
    const vw = Number(cs!.beat.vw || (cs!.beat.focus && cs!.beat.focus.vw) || 0)
    expect(vw, 'the beat records the page it was measured in').toBeGreaterThan(0)
    const scales: number[] = []
    for (const [name, sel] of [['the Expected', '.sbframe'], ['the Actual', '.sbproof']] as Array<[string, string]>) {
      const box = row.locator(sel + ' .pcbox')
      await expect(box, name + ' cell is framed on the moment').toHaveClass(/\bzoomed\b/)
      const k = await camScale(box, vw)
      expect(k, name + ' cell is under a camera').toBeTruthy()
      expect(k, name + ' camera never magnifies past 1.25× (' + k + ')').toBeLessThanOrEqual(1.26)
      scales.push(k as number)
      // …and the chip it framed FOR is wholly in shot: the union rule is what puts it there, so a
      // chip whose box escapes the camera means the union was not taken
      const chip = box.locator('.pchip')
      await expect(chip, name + ' cell carries its one chip').toHaveCount(1)
      const fits = await box.evaluate((el: Element) => {
        const c = el.querySelector('.pchip') as HTMLElement
        if (!c) return null
        const a = el.getBoundingClientRect(); const b = c.getBoundingClientRect()
        return { l: b.left - a.left, t: b.top - a.top, r: a.right - b.right, bo: a.bottom - b.bottom }
      })
      expect(fits, name + ' chip is measurable').toBeTruthy()
      for (const side of ['l', 't', 'r', 'bo'] as const) {
        expect(fits![side], name + ' chip is fully in frame (' + side + '): ' + JSON.stringify(fits)).toBeGreaterThanOrEqual(-1)
      }
    }
    expect(Math.abs(scales[0] - scales[1]), 'one camera: both cells at the SAME magnification').toBeLessThan(0.02)
    await hudCheck('the moment camera is capped at 1.25×', 'within the cap',
      Math.max(scales[0], scales[1]) <= 1.26 ? 'within the cap' : 'zoomed to ' + Math.max(scales[0], scales[1]))
    }
  })

  // beat 2 — ONE BEAT, BOTH SIDES. The row's words and the two pictures beside them are of ONE beat,
  // so they must not disagree; and the Given row carries the Given alone — whole page, no beat, no
  // camera control.
  //
  // (One assertion here was DROPPED with the wireframe on 2026-09-03, not weakened away: the drawing
  // used to carry the beat's When → Then in its own accessible label, and this read it back. A
  // replica is the app's own markup and labels nothing — the sentence lives in the row's words cell,
  // which is where a reader reads it. What replaces it holds the same claim on the picture that CAN
  // answer for it: the Expected cell is showing this BEAT's own moment, named by the harvest.)
  await checkReq('R19', async () => {
    const beh = prdBeats(spec.rid)
    expect(beh && beh.beats.length > 0, spec.rid + ' must carry a behavior block').toBe(true)
    const story = ov.locator('.fread .fstory')
    // a picture the requirement or the app has moved past is a DIFFERENT beat; a comparison cannot be
    // made against it, so the row demands a fresh one
    await expect(story, 'the picture is fresh — a stale one shows another moment').not.toHaveClass(/\bisstale\b/)
    const row = story.locator('.sbwrap .sbrow').nth(1)
    await reveal(row.locator('.sbtext'))
    const words = plain(await row.locator('.sbtext').innerText())
    expect(words, 'the row shows the prd\'s own When').toContain(plain(beh!.beats[0].when))
    expect(words, '…and its own Then').toContain(plain(beh!.beats[0].then))
    // FACT 1, CLAIMED (the authored-intent lint, phase 6): the row's text cell shows the sentence
    // both pictures are of — the prd's own When for THIS beat, read out of spec/board/prd.md
    await proveVisible(row.locator('.sbtext .sbwhen'), plain(beh!.beats[0].when),
      'The sentence both pictures are of', 
      { match: (shown: string) => plain(shown).includes(plain(beh!.beats[0].when)), soft: true })
    // the EXPECTED cell carries the same beat — it is showing one of THIS beat's own harvested
    // moments, read back off the fold's record for beat 1 (never beat 2's picture beside beat 1's
    // words, which is exactly the drift R19 forbids)
    const showing = await row.locator('.sbframe').evaluate(el => String((el as HTMLElement).dataset.repsrc || ''))
    const mine = await row.evaluate(el => {
      const rid = el.closest('.fread')!.querySelector('.frmeta .fid')!.textContent!.trim()
      const src = document.querySelector('.dt[data-screen="board"] .reqpane .req[data-r="' + rid + '"]')
      const b = JSON.parse(src!.getAttribute('data-ev-beats') || '[]').find((x: any) => Number(x.n) === 1) || {}
      return [b.replicaExpectedBefore, b.replicaExpectedAfter,
        ...(b.values || []).flatMap((v: any) => [v && v.replicaExpected])].filter(Boolean)
    })
    await hudCheck('the Expected cell shows THIS beat\'s own moment', 'a moment of beat 1',
      mine.indexOf(showing) >= 0 ? 'a moment of beat 1' : 'another beat\'s picture: ' + showing)
    expect(mine.indexOf(showing) >= 0,
      'the Expected cell is showing one of beat 1\'s own harvested moments: ' + JSON.stringify({ showing, mine })).toBe(true)
    // …and the drawn CALLOUT is the current small step, one sentence per scene (the human,
    // 2026-08-30). Added here because this is the requirement that owns "the words agree across the
    // row": a card that stacked the title, the When AND the Then said three things at a moment when
    // only one of them was true, and the burn-in beside it said a different one. So: every scene of
    // the drawing that carries a callout carries exactly ONE of the two labels, and none of them
    // carries the requirement's title.
    // …and the THIRD surface — the card burned into the recording the proof frames are cut from —
    // is on the SAME beat and says the SAME one line. This is the leg that catches the drift R19
    // exists to forbid: until 2026-08-30 the drawing said the When alone mid-beat while the burn-in
    // already claimed the Then, and both stacked the requirement title on top of it. The burn-in
    // paints on EVERY run since 2026-09-02 (the human: no gap between schematic and proof, ever —
    // a plain run used to harvest ringless frames), so this holds with or without a recording and
    // the old "nothing injected" else-branch is gone (rule 4: that gate was the defect).
    //
    // (Asserted on the BURNED card rather than the drawn one on purpose: the board's own harvest
    // records no ring — its specs read the page with reveal(), not proveVisible() — so its committed
    // drawings carry no overlay to read a card off. The DRAWN side of the same rule is pinned where
    // it can actually fail, in tools/viz.test.mjs, against a harvest that has one.)
    await reveal(row.locator('.sbtext'))
    const call19 = page.locator('#__specboard-focus .sb-call')
    {
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
    }
    // THE GIVEN ROW — the context row: the whole page on both sides, the Given alone, no camera toggle
    const given = story.locator('.sbwrap .sbrow').first()
    await expect(given).toHaveClass(/\bbgiven\b/)
    // the Given is ONE keyword-led sentence (the human, 2026-09-02: "even more easy to read") — no
    // label column, and the mark column carries a hollow ring rather than a step number
    await expect(given.locator('.sbtext .sbgiven')).toHaveCount(1)
    await expect(given.locator('.sbtext .sbgiven')).toContainText('Given')
    // FACT 2, CLAIMED: the Given row carries the GIVEN alone — the context both sides stand in,
    // whole-page and uncaptioned (its no-camera, no-caption half is asserted just below)
    await proveVisible(given.locator('.sbtext .sbgiven'), plain(prdBeats(spec.rid)!.given),
      'The context row — the Given alone, on both sides',
      { match: (shown: string) => plain(shown).includes(plain(prdBeats(spec.rid)!.given)), soft: true })
    await expect(given.locator('.sbtext .sbno.hollow')).toHaveCount(1)
    await expect(given.locator('.sbtext .sbno:not(.hollow)')).toHaveCount(0)
    await expect(given.locator('.pcbox.zoomed')).toHaveCount(0)      // whole page, both cells
    await expect(given.locator('.pczoom')).toHaveCount(0)            // and nothing to aim
    // FACT 3, CLAIMED as the absence it is: the context row is UNCAPTIONED on both sides — no
    // per-cell caption anywhere on it. `MISSING` passes exactly while there is none and fails, with
    // the caption's own words, the moment one appears.
    await proveVisible(given.locator('.pccap'), MISSING,
      'The context row, uncaptioned on both sides', { soft: true })
    // …and the two facts about WHICH MOMENT each cell is showing have no value on the screen: the
    // Expected cell names its picture in `data-repsrc` and the photograph its frame in `src`, both
    // matched above against the fold's own record for this beat. A file path is not a thing the row
    // says to a reader — what the reader sees is the picture itself.
    intentGap('"the replica captured at that beat\'s own moment" is a file path on the cell (data-repsrc), matched above against the fold\'s record — no element on the row carries it as a value')
    intentGap('"the photograph taken at it" is the same: the frame\'s own src, checked against the same record; the row shows the picture, never the path')
  })

})

// Board R20 — THE PROOF PLAYS ITSELF. One mode, no toolbar, already running, zoomed onto the focus
// with the whole frame one toggle away; and the Given row, which has one frame and nothing to loop,
// stays the captioned still it is.
test('The proof plays itself — step is the default, no dots/counter/toggle, the whole frame in the lightbox', async ({ page }) => {
  await coverReqs('R20')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  const ov = dt.locator('.focusov')
  const spec = replicaSpecimens()[0]
  expect(spec, 'a board requirement harvested with a beat pair').toBeTruthy()

  await checkReq('R20', async () => {
    await armFocus(dt, spec.rid)
    await page.goto('/#/board/' + (spec.rid === 'R2' ? 'R3' : 'R2'))   // hop, so the reader rebuilds
    await page.goto('/#/board/' + spec.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(spec.rid)
    const row = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1)
    const cell = row.locator('.sbproof')
    await reveal(cell)
    // NO PER-CELL CHROME (the human, 2026-09-02): no mode toolbar, no dots, no n/N counter, and no
    // full-frame toggle inside the proof — the row's ONE moment strip is the readout, the lightbox
    // the whole frame.
    await expect(cell.locator('.pcmodes')).toHaveCount(0)
    await expect(cell.locator('.pdots')).toHaveCount(0)
    await expect(cell.locator('.fstepn')).toHaveCount(0)
    await expect(cell.locator('.pczoom')).toHaveCount(0)
    // …and NO SUPERSCRIPT NUMBERING anywhere in the reader (the human, 2026-09-02: the When¹/Then¹
    // marks were "hard to read and not intuitive"). The count is the MARK COLUMN beside each beat's
    // words now — a ringed numeral per beat and a hollow ring on the context row — with the oracle
    // the prd's own beat list, read independently of what the board rendered.
    await expect(ov.locator('.fread sup.bno')).toHaveCount(0)
    const nb = (prdBeats(spec.rid) || { beats: [] }).beats.length
    const numerals = ov.locator('.fread .fstory .sbwrap .sbrow .sbno:not(.hollow)')
    await expect(numerals, 'one ringed numeral per beat').toHaveCount(nb)
    await expect(numerals).toHaveText(Array.from({ length: nb }, (_, k) => String(k + 1)))
    await expect(ov.locator('.fread .fstory .sbwrap .sbrow.bgiven .sbno.hollow'),
      'the context row is marked, never numbered').toHaveCount(1)
    const stepper = cell.locator('.pcplay .fsteps-wrap')
    await expect(stepper).toBeVisible()
    const frameN = await stepper.locator('.fsteps img').count()
    expect(frameN, 'the beat harvested a pair — a loop needs frames to play').toBeGreaterThan(1)
    // THE ROW'S ONE STEPPER (the human, 2026-09-02: "schematic and proof should share same stepper
    // (as their steps must be same???)"). Exactly one strip on the row, over BOTH pictures, with one
    // segment per moment the proof actually has — a segment count that drifted from the frame count
    // would be two lists again — and the retired gutter tour nowhere in the reader.
    const tour = row.locator('.mstrip')
    await expect(tour).toHaveCount(1)
    await expect(row.locator('.sbtext .mstrip'), 'the strip is over the pictures, not in the words').toHaveCount(0)
    await expect(ov.locator('.fread .tourstep')).toHaveCount(0)
    await expect(row.locator('.mseg')).toHaveCount(frameN)
    // the fact, CLAIMED (the authored-intent lint, phase 6): the beat's position is READ on that one
    // strip — one segment per moment the proof has, counted off the frames rather than off the strip
    await proveVisible(tour.locator('.mpos'), '1 / ' + frameN,
      'The beat\'s position, read on the one strip over both pictures', { soft: true })
    await expect(row.locator('.mseg').last(), 'the last moment is the beat\'s result').toHaveClass(/\bthen\b/)
    await expect(row.locator('.mseg.then .msegl'), '…and says so in words, not by hue alone').toContainText('then ·')
    // ONE LINE PER MOMENT, ALWAYS (the human, 2026-09-02: "always max. show one line, and user can hover
    // and it shows a proper tooltip for the full text when the text is too long") — a name that wrapped
    // made one row's strip taller than the next; now every label is a single ellipsised line and the
    // whole name lives in a tooltip the segment shows on hover / focus. Never the native title (a second
    // tooltip on top of the styled one).
    const seg0 = row.locator('.mseg').first()
    expect(await seg0.locator('.msegl').evaluate(el => getComputedStyle(el).whiteSpace), 'a label never wraps').toBe('nowrap')
    expect(await seg0.locator('.msegl').evaluate(el => getComputedStyle(el).textOverflow), 'a long label ellipsises').toBe('ellipsis')
    expect(await seg0.getAttribute('title'), 'no native title beside the styled tooltip').toBeNull()
    const tip0 = seg0.locator('.mtip')
    await expect(tip0).toBeHidden()
    await seg0.hover()
    await expect(tip0, 'hovering a moment shows its full name').toBeVisible()
    // CONTAINS, not equals (corrected 2026-09-04, rule 4 — the board was right and this was too
    // strict): since the review's C1 the tooltip carries the moment's NAME and then what it expected
    // and what the app gave, which is asserted in full on R20's chips leg. This one is about the
    // name being readable in full where the label is ellipsised, so it asks for the name. Until
    // phase 6 no board moment carried a claim at all, so the two readings happened to be identical.
    await expect(tip0).toContainText(await seg0.locator('.msegl').evaluate(el => el.dataset.full || el.textContent))
    await row.locator('.sbtext').hover()                                   // away — the tooltip goes
    await expect(tip0).toBeHidden()

    // STEP IS THE DEFAULT, and the controls ride the TITLE ROW (left of the ⋯ menu), not a bar of
    // their own. The speed is AUTO-ONLY — disabled while stepping.
    const tools = ov.locator('.fread .frmeta .frtools')
    await expect(tools).toHaveCount(1)
    await expect(ov.locator('.fread > .fbar')).toHaveCount(0)                 // the old separate bar is gone
    await expect(tools.locator('.medbar.pmode button.on')).toHaveText('step')
    const spd = tools.locator('select.pspd')
    await expect(spd).toBeDisabled()

    // WALKED BY HAND in step: the › advances the SELECTED row's two cells by exactly one moment,
    // and the strip PAINTS the moment on show — the current segment is the one the frames are at
    const posText = () => tour.locator('.mpos').textContent()
    const curSeg = () => row.locator('.mseg').evaluateAll(ss => ss.findIndex(x => x.classList.contains('cur')))
    const pos0 = await posText()
    expect(await curSeg(), 'the strip opens painted on the first moment').toBe(0)
    await tour.locator('.mnext').click()
    await expect.poll(posText).not.toBe(pos0)
    await expect.poll(curSeg, { message: 'the strip paints the moment the pictures are on' }).toBe(1)
    // …and a CLICK ON A SEGMENT jumps both cells to that moment — the strip is the control, not a gauge
    // the EXPECTED cell comes with it (the human's 2026-09-03 replica decision): it is showing that
    // moment's own committed replica, said on the cell itself, so a segment click that moved only the
    // photograph fails here
    const repAt = () => row.locator('.sbframe').evaluate(f => String((f as HTMLElement).dataset.repsrc || ''))
    const repBefore = await repAt()
    await row.locator('.mseg').first().click()
    await expect.poll(posText, { timeout: 6000 }).toBe('1 / ' + frameN)
    await expect.poll(curSeg).toBe(0)
    await expect.poll(repAt, { timeout: 8000, message: 'the Expected picture came with it — one stepper, two renderings' })
      .not.toBe(repBefore)
    await tour.locator('.mnext').click()                                     // back where the leg found it

    // AUTO PLAYS ITSELF: switch to auto, the speed wakes, and the position advances on its own at the
    // reader's one speed. 4× bounds every hold at ~1.5s, so the wait is bounded — real timers, because
    // a fake clock would freeze the board's own SSE/fold timers this very screen is proving.
    await tools.locator('.medbar.pmode button[data-mode="auto"]').click()
    await expect(spd).toBeEnabled()
    await spd.selectOption('4')
    const at = await posText()
    await expect.poll(posText, { timeout: 15000 }).not.toBe(at)

    // FRAMED ON THE COMPONENT (both cells), and the whole frame is the LIGHTBOX a proof click opens —
    // there is no inline toggle to press
    await expect(row.locator('.pcbox.zoomed')).toHaveCount(2)    // the drawing and the proof together
    await cell.locator('.pcplay .fsteps img.on').first().click()
    await expect(page.locator('#lb')).toBeVisible()
    await hudCheck('a proof click opens the whole frame', 'lightbox open',
      (await page.locator('#lb').isVisible()) ? 'lightbox open' : 'lightbox closed')
    await page.keyboard.press('Escape')
    await expect(page.locator('#lb')).toBeHidden()
  })


})

// Board R23 — A FAILED MOMENT NAMES ITS DIFFERENCE (phase 5 of the Expected View plan the human
// accepted 2026-09-03). Two pictures side by side leave a reader to FIND the difference in two
// places at once; a failed moment says it in words, once, on the seam.
//
// (The requirement's second half — a LOUPE magnifying the ringed element on both sides — was removed
// by the human on 2026-09-04, "the row of loupe · the ringed element is useless", and its beat is
// deleted with it rather than left asserting something the board no longer builds.)
//
// The board's own suite passes, so nothing here is red on its own: the failed moment is DERIVED from
// the real harvest by rewriting what the run recorded as the OUTCOME (armClaim), which is the same
// established fixture technique R18's stale-banner leg and R20's honest-blank leg already use. The
// frames, the layouts and the replicas stay exactly as the run took them, and the fixture is
// restored at the end of the test — in a finally, so a mid-test failure cannot leave it armed.
test('A failed moment names its difference', async ({ page }) => {
  await coverReqs('R23')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  const ov = dt.locator('.focusov')
  const cs = claimSpecimen()
  expect(cs, 'a board beat whose harvest carries a claim to fail').toBeTruthy()
  const rid = cs!.rid
  const other = rid === 'R2' ? 'R3' : 'R2'
  const rowOf = () => ov.locator('.fread .fstory .sbwrap .sbrow').nth(1)

  // THE DIFFERENCE MARKER. One label across the two cells naming both values, one per failed claim;
  // and NONE on a row that claimed nothing at all.
  try {
    await checkReq('R23', async () => {
      await armFocus(dt, rid)
      const wrote = await armClaim(dt, rid, 'not this')
      expect(wrote, 'the fixture rewrote a real claim as failed').toBeTruthy()
      await page.goto('/#/board/' + other)
      await page.goto('/#/board/' + rid)
      await expect(ov.locator('.fread .frmeta .fid')).toHaveText(rid)
      const row = rowOf()
      await reveal(row)
      const marks = row.locator('.pics .mdiff')
      await expect(marks, 'exactly one marker for the one failed claim').toHaveCount(1)
      const said = plain(await marks.first().innerText())
      expect(said, 'the marker names what was expected').toContain(plain(wrote!.expected))
      expect(said, '…and what the app actually gave').toContain(plain(wrote!.got))
      // the fact, CLAIMED (the authored-intent lint, phase 6): ONE marker, naming BOTH values — the
      // expected comes from the fold's own record and the got from the fixture that failed it
      await proveVisible(marks.first(), plain(wrote!.expected) + ' · ' + plain(wrote!.got),
        'The one marker, naming both values',
        { match: (shown: string) => plain(shown).includes(plain(wrote!.expected)) && plain(shown).includes(plain(wrote!.got)),
          soft: true })
      // it spans the SEAM — one label about a relation, not one per cell
      const seam = await row.evaluate(el => {
        const p = el.querySelector('.pics') as HTMLElement
        const m = p.querySelector('.mdiff') as HTMLElement
        const a = p.getBoundingClientRect(); const b = m.getBoundingClientRect()
        return { mid: (b.left + b.right) / 2 - a.left, half: a.width / 2, top: b.top - a.top, h: a.height }
      })
      expect(Math.abs(seam.mid - seam.half), 'the marker sits on the seam between the cells').toBeLessThan(8)
      expect(seam.top >= -1 && seam.top <= seam.h, 'and inside the pictures it is about').toBe(true)
      // …AND NONE WHERE NOTHING FAILED. The Given row is the context row — it rings nothing and claims
      // nothing — so it carries no marker at all: a label that appeared on every moment would say
      // "difference" where there is none, which is the opposite of what it is for.
      const given = ov.locator('.fread .fstory .sbwrap .sbrow').first()
      await expect(given.locator('.mdiff'), 'the context row claims nothing, so it differs in nothing')
        .toHaveCount(0)
      // …and that absence is CLAIMED (phase 6 fix round 2): `MISSING` passes exactly while the row
      // that claimed nothing carries no marker, and fails — with the marker's own words — the moment
      // one is painted where there is no difference to name.
      await proveVisible(given.locator('.mdiff'), MISSING,
        'None at all on a moment that claimed nothing', { soft: true })
      await hudCheck('a failed moment names its difference', '1 marker', (await marks.count()) + ' marker')
    })
  } finally {
    // the fixture is the READER's, not the tree's — it rewrites one DOM attribute and a reload clears
    // it — but it is restored anyway so nothing downstream in this file reads a row this test
    // rewrote, and in a `finally` so a mid-test failure cannot leave it armed (2026-09-04: the
    // comment above promised a finally the code did not have).
    await armClaim(dt, rid, null)
    await page.goto('/#/board/' + other)
  }
})

// Board R20, second half — AUTO ↔ STEP, and a PER-BEAT WALK (the human, 2026-08-30: "the go to next
// small step can NOT be on top as there could be multi when/then, so the go to next small step need to
// be by each when/then, and show in more appealing way ... please be user friendly and creative").
// REWRITTEN 2026-09-01, rule 4 with the human's decision as the reason: the labelled bead FILMSTRIP
// (ec62a1d's .scenerail / .srbeads) was REJECTED at a live mock; the human approved a GUIDED-TOUR
// control in its place — one quiet line `‹  n / N  ›` in each beat row's behaviour gutter, a product
// tour's stepper. No bordered box, no dots, no per-scene labels. The prev chevron dims at scene 1; the
// next chevron is faintly accented and, at the LAST scene, becomes a restart ↺ that wraps to scene 1.
// So this proves the tour control — its › walks BOTH cells of ITS row, prev is dim at the start, next
// wraps to Restart at the end, the ← → keys walk the row the reader is on, the top bar has NO advance,
// and a proof click is a proof again (opens the lightbox in every mode). The old rail is gone: no
// .scenerail, no .srbeads. The loop stays the DEFAULT (the first R20 test proves it runs untouched).
test('The proof is walked by a per-beat guided-tour stepper and the keys — and a proof click zooms again', async ({ page }) => {
  // SIX beats now (2026-09-04, the fix round's reorder): each rings, photographs and replicates its
  // own moments, and two of them carry a pair of legs merged into one beat. Patience, never an
  // assertion — nothing this test proves changes with the number.
  test.setTimeout(180000)
  await coverReqs('R20')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  const ov = dt.locator('.focusov')
  const spec = replicaSpecimens()[0]
  expect(spec, 'a board requirement harvested with a beat pair').toBeTruthy()

  // THE SIX BLOCKS BELOW ARE IN R20'S SIX BEATS' ORDER (2026-09-04, the controller's fix round).
  // BEAT_CURSOR shows the Nth checkReq of an id the Nth beat and FILES ITS HARVEST THERE, so a
  // block out of order hands its pictures to another beat's sentence — the drift board R19 forbids
  // of a row, on this board's own reader. Nothing was weakened to do it: two pairs of legs that
  // prove one beat between them were merged into that beat's block, and the two legs that live in
  // the test above (the chips, the context row) moved here to stand at beats 2 and 6.

  // beat 1 — THE CELL FRAMES THE THING BEING PROVEN AND NOTHING AROUND IT. The rejected bead rail
  // (rule 4, the R8 assert-the-gone precedent: the labelled filmstrip ec62a1d shipped, .scenerail
  // with its .srbeads) is nowhere in the reader — and neither is a keyboard hint, which the human
  // moved off the reading surface on 2026-09-02 ("remove the short cut key hint in this page, only
  // mention in the setting page"): nothing in the reader's rows, its card or its pager footer names
  // a key, and the guide lists every key the reader answers to. The KEYS themselves are untouched —
  // beat 4 below still walks, selects and pages with them.
  await checkReq('R20', async () => {
    // aim the beat's own camera first: this block is beat 1's, and beat 1 is about the CELL — a
    // block whose assertions are all counts would otherwise photograph the whole page
    await reveal(ov.locator('.fread .fstory .sbwrap .sbrow').nth(1).locator('.sbproof'))
    await expect(ov.locator('.fread .scenerail')).toHaveCount(0)
    await expect(ov.locator('.fread .srbeads')).toHaveCount(0)
    await expect(ov.locator('.fread .srbead')).toHaveCount(0)
    await expect(ov.locator('.fread .srnext')).toHaveCount(0)
    // …and the POSITIVE half beside the four absences (rule 2, and the standing "assert a positive
    // outcome" rule): what stands where the rejected rail would have is the reader's own mode pair,
    // and it reads step. Four toHaveCount(0)s alone would pass on a reader that rendered nothing.
    await expect(ov.locator('.fread .frmeta .frtools .medbar.pmode button.on')).toHaveText('step')
    await hudCheck('the rejected bead rail is gone', '0 .scenerail', (await ov.locator('.fread .scenerail').count()) + ' .scenerail')

    await page.goto('/#/board/' + spec.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(spec.rid)
    await expect(dt.locator('.dtfoot .fpk'), 'the footer legend is gone').toHaveCount(0)
    await expect(dt.locator('.dtfoot')).not.toContainText('PgUp')
    await expect(ov.locator('.fread .kbd'), 'and nothing inside the reader names a key').toHaveCount(0)
    // …the guide is where they live now: one Keyboard section, every key the reader answers to
    await page.goto('/#howitworks')
    const keys = page.locator('#howview .howkeys')
    await expect(keys).toBeVisible()
    await expect(keys.locator('.sect-head .lbl')).toHaveText('keyboard')
    // each key is a .kbd chip — the system's keyboard component, not prose about keys. The SET is
    // the claim (the guide names every key the reader answers to); the sentence beside each one is
    // prose and is not pinned here.
    await expect(keys.locator('.kbd')).toHaveText(['← →', '↑ ↓', 'PgUp / PgDn', 'Esc', 'r'])
    await expect(keys).toContainText('walk')
    await expect(keys).toContainText('change requirement')
    // …and the beat leaves the READER where it found it (2026-09-04, the reorder): this leg ends on
    // the guide, and the beat after it opens on the reader's own controls. A beat that navigates
    // away puts the reading surface back, or the next one waits on a page that is not there.
    await page.goto('/#/board/' + spec.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(spec.rid)
    // THE FACTS OF THIS THEN, CLAIMED (phase 6 fix round 2). Two of them are absences and are
    // claimed as absences — `MISSING` passes exactly while the rejected chrome is gone and fails,
    // with its own words, the moment it returns — and two are read off the row's one strip.
    const row1 = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1)
    const strip1 = row1.locator('.mstrip')
    await reveal(strip1)
    await proveVisible(ov.locator('.fread .scenerail'), MISSING,
      'No bead rail, no dots — nothing around the picture', { soft: true })
    await proveVisible(ov.locator('.fread .pcmodes'), MISSING,
      'And no media toolbar over it either', { soft: true })
    const nSeg1 = await row1.locator('.mseg').count()
    expect(nSeg1, 'this beat harvested moments for its strip to segment').toBeGreaterThan(0)
    await proveVisible(strip1.locator('.mpos'), '1 / ' + nSeg1,
      'The beat\'s position, read on the one strip', { soft: true })
    // …and the segment's NAME comes from the run's own record of what it checked, read out of the
    // fold's data-ev-beats rather than off the strip that is being checked
    const label1 = await row1.evaluate(el => {
      const rid = el.closest('.fread')!.querySelector('.frmeta .fid')!.textContent!.trim()
      const src = document.querySelector('.dt[data-screen="board"] .reqpane .req[data-r="' + rid + '"]')
      const b = JSON.parse(src!.getAttribute('data-ev-beats') || '[]').find((x: any) => Number(x.n) === 1) || {}
      const v = ((b.values || []).filter((x: any) => x && x.frame))[0]
      return String((v && v.label) || '')
    })
    expect(label1, 'the run named the moment this segment is of').toBeTruthy()
    await proveVisible(strip1.locator('.mseg .msegl').first(), label1,
      'Each segment named by what the run checked, not by a counter', { soft: true })
    // …and three of this Then's clauses have no value on this scene for a claim to read:
    intentGap('"the Actual cell FRAMES the thing being proven" is the camera — a rectangle and a magnification, measured in board R19\'s own test, never a value an element carries')
    intentGap('"ONE stepper strip SPANNING both pictures" is geometry too: the strip\'s box against the two cells\' boxes, measured where that comparison lives (board R19 / R21)')
    intentGap('"one segment per moment the beat proved" is a COUNT — the strip\'s segments against the moments the harvest recorded — and it is asserted against that record in the block that walks the strip, beat 4 below')
  })

  // THE CHIPS — one per cell, the value only (design C, the human 2026-09-02/03: "every text once").
  // The sentence lives in the words cell and the moment's name in the strip, so the chip over each
  // picture says only what THAT side holds: EXPECTED "…" on the replica, ACTUAL ✓/✕ "…" on the
  // photograph. The oracle is the CLAIM the run recorded, read out of the fold's own record — not
  // out of the page — so a chip that showed the neighbouring moment's value, or the same value on
  // both sides regardless of what the app did, fails here.
  await checkReq('R20', async () => {
    const cs = claimSpecimen()
    expect(cs, 'a board beat whose harvest carries a claim').toBeTruthy()
    const vals = (cs!.beat.values || []).filter((v: any) => v && v.frame && v.claim)
    const claims = vals.map((v: any) => v.claim)
    // back to STEP: the leg above left the reader in auto at 4×, and the play mode is reader-wide and
    // session-scoped (it survives the rebuild below on purpose), so a chip read while the loop was
    // still running would be a race, not an assertion
    await ov.locator('.fread .frmeta .frtools .medbar.pmode button[data-mode="step"]').click()
    await armFocus(dt, cs!.rid)
    // A CLAIM THAT CAN TELL THE TWO SIDES APART (2026-09-04, the review's I3). The board's one
    // claimed moment PASSES, so expected === got there — and a chip that rendered `expected` on both
    // sides would have satisfied every assertion below while showing the reader a lie. The same
    // fixture R23 uses derives a FAILED moment from the real harvest, so `expected` and `got` differ
    // and each side can be pinned to its own value. Restored in the finally at the end of the test.
    const wrong = 'not what the app gave'
    const wrote = await armClaim(dt, cs!.rid, wrong)
    expect(wrote, 'the fixture rewrote a real claim as failed').toBeTruthy()
    await page.goto('/#/board/' + (cs!.rid === 'R2' ? 'R3' : 'R2'))
    await page.goto('/#/board/' + cs!.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(cs!.rid)
    const row = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1)
    await reveal(row)
    // the row opens on the beat's FIRST value moment (its opening state is the Given row above it),
    // so the chips on show are that claim's
    const c0 = claims[0]
    const eChip = row.locator('.sbframe .pchip')
    const aChip = row.locator('.sbproof .pchip')
    await expect(eChip, 'one chip on the Expected cell').toHaveCount(1)
    await expect(aChip, '…and one on the Actual').toHaveCount(1)
    await expect(eChip.locator('.pcl')).toHaveText('expected')
    await expect(aChip.locator('.pcl')).toHaveText('actual')
    // three of this Then's four facts, CLAIMED (the authored-intent lint, phase 6): ONE chip per
    // picture, each saying only what its own side holds, the mark beside the hue. The fourth — a
    // moment that claimed nothing carries no chip at all — is an ABSENCE: proveVisible reads a value
    // off something that is there, so it stays a hard assertion (below, on the Given row).
    await proveVisible(eChip.locator('.pcl'), 'expected', 'The Expected cell\'s one chip', { soft: true })
    await proveVisible(aChip.locator('.pcl'), 'actual', 'The Actual cell\'s one chip', { soft: true })
    const eSaid = plain(await eChip.locator('.pcv').innerText())
    const aSaid = plain(await aChip.locator('.pcv').innerText())
    expect(eSaid, 'the Expected chip says what the requirement asks for').toContain(plain(c0.expected))
    expect(aSaid, 'the Actual chip says what the app gave').toContain(plain(wrong))
    // …and the two sides are NOT the same words: this is the leg the fixture exists for
    expect(aSaid.includes(plain(c0.expected)),
      'the Actual chip shows what happened, never the requirement\'s own value').toBe(false)
    // …and the two VALUES themselves, claimed on the side each belongs to: the requirement's own
    // words over the replica, the app's over the photograph. Each expected value comes from the
    // other side of the fixture, so a chip that rendered the same text on both fails here.
    await proveVisible(eChip.locator('.pcv'), plain(c0.expected),
      'EXPECTED — the requirement\'s own value, over the replica',
      { soft: true, match: (shown: string) => plain(shown).includes(plain(c0.expected)) })
    await proveVisible(aChip.locator('.pcv'), plain(wrong),
      'ACTUAL — what the app gave, over the photograph',
      { soft: true, match: (shown: string) => plain(shown).includes(plain(wrong)) })
    // the MARK beside the hue — a greyscale reader loses nothing
    await expect(aChip.locator('.pcm'), 'the Actual chip carries its mark').toHaveText('✕')
    await proveVisible(aChip.locator('.pcm'), '✕',
      'The mark beside the hue — the state, in a greyscale reader too', { soft: true })
    await expect(aChip, 'and the chip itself reads as the failure it is').toHaveClass(/\bbad\b/)
    // ONE LINE, ELLIPSISED, with the whole text in a STYLED tooltip — never the native title
    const val = aChip.locator('.pcv')
    expect(await val.evaluate(el => getComputedStyle(el).whiteSpace), 'a chip never wraps').toBe('nowrap')
    expect(await val.evaluate(el => getComputedStyle(el).textOverflow), 'a long value ellipsises').toBe('ellipsis')
    expect(await aChip.getAttribute('title'), 'no native title beside the styled tooltip').toBeNull()
    const tip = aChip.locator('.mtip')
    await expect(tip).toBeHidden()
    await aChip.hover()
    await expect(tip, 'hovering a chip shows its whole text').toBeVisible()
    // …ONE LINE, THE WHOLE TEXT IN THE TOOLTIP: what the ellipsis cuts off is readable on hover
    await proveVisible(tip, plain(wrong), 'The whole value, in the hover tooltip',
      { soft: true, match: (shown: string) => plain(shown).includes(plain(wrong)) })
    await row.locator('.sbtext').hover()
    await expect(tip).toBeHidden()
    // …AND A KEYBOARD REACHES IT TOO (the review's I1). The value is one ellipsised line, so the
    // tooltip is the ONLY way to read the whole of it; a chip a keyboard cannot focus hides it from
    // half the readers. It is a real button, so it takes focus and its aria-label is announced.
    expect(await aChip.evaluate(el => el.tagName.toLowerCase()), 'the chip is a real control').toBe('button')
    await aChip.focus()
    await expect(tip, 'focusing a chip shows its whole text').toBeVisible()
    expect(plain(await aChip.getAttribute('aria-label') || ''), 'and it is announced with both parts')
      .toContain(plain(wrong))
    await row.locator('.sbtext').hover()
    await page.locator('body').click({ position: { x: 2, y: 2 } })
    // …AND THE STRIP SAYS BOTH VALUES TOO (the review's C1 — the brief's deliverable B). A segment's
    // label is the moment's NAME; its tooltip must also carry what that moment expected and what the
    // app gave, because the name alone cannot tell you whether the moment passed.
    const seg0 = row.locator('.mseg').first()
    const stip = seg0.locator('.mtip')
    await seg0.hover()
    await expect(stip).toBeVisible()
    const stipText = plain(await stip.innerText())
    const name0 = String(vals[0].label || '').trim()
    expect(name0, 'the harvest named that moment — the oracle for the tooltip\'s head').not.toBe('')
    expect(stipText, 'the strip tooltip carries the moment’s name').toContain(plain(name0))
    expect(stipText, '…what the requirement expected').toContain(plain(c0.expected))
    expect(stipText, '…and what the app actually gave').toContain(plain(wrong))
    await row.locator('.sbtext').hover()
    // …AND THE BEAT'S RESULT IS A CHECKLIST. Walk to the last moment: the two chips list one item per
    // claim the beat made — the facts, never a count of them.
    const strip = row.locator('.mstrip')
    const n = await row.locator('.mseg').count()
    for (let k = 1; k < n; k++) await strip.locator('.mnext').click()
    await expect(row.locator('.mseg').last()).toHaveClass(/\bcur\b/)
    await expect(row.locator('.sbframe .pchip .pcvr'), 'the Expected checklist has one item per claim')
      .toHaveCount(claims.length)
    await expect(row.locator('.sbproof .pchip .pcvr'), '…and so does the Actual')
      .toHaveCount(claims.length)
    await hudCheck('the beat’s result is a checklist', claims.length + ' fact(s)',
      (await row.locator('.sbproof .pchip .pcvr').count()) + ' fact(s)')
    // …and the CHECKLIST itself, claimed: the beat's result lists the FACTS it claimed, so its first
    // line is the first claim's own value — never a count of them.
    await proveVisible(row.locator('.sbproof .pchip .pcvr').first(), plain(wrong),
      'The beat\'s result — a checklist of the claims it made',
      { soft: true, match: (shown: string) => plain(shown).includes(plain(wrong)) })
    // …AND THE FOURTH FACT, CLAIMED AS AN ABSENCE (fix round 1, 2026-09-04): the context row claims
    // nothing, so it carries no chip at all. `proveVisible(…, MISSING, …)` passes exactly while the
    // chip is gone and fails, with the chip's own words as `got`, the moment one appears.
    await proveVisible(ov.locator('.fread .fstory .sbwrap .sbrow').first().locator('.pchip'), MISSING,
      'A moment that claimed nothing carries no chip at all', { soft: true })
    // …and the derived failure goes back where it came from: the fixture is a DOM attribute on the
    // reader, not a change to the tree, but leaving it armed would hand the next test a board whose
    // one claim reads red
    await armClaim(dt, cs!.rid, null)
  })

  // THE CONTROLS RIDE THE TITLE ROW (the human, 2026-09-02), and have NO advance — only the auto/step
  // toggle and the speed <select>. The walk is on the rows. And STEP is the default now.
  await checkReq('R20', async () => {
    await armFocus(dt, spec.rid)
    await page.goto('/#/board/' + (spec.rid === 'R2' ? 'R3' : 'R2'))   // hop, so the reader rebuilds
    await page.goto('/#/board/' + spec.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(spec.rid)
    const bar = ov.locator('.fread .frmeta .frtools')
    await reveal(bar)
    await expect(ov.locator('.fread > .fbar')).toHaveCount(0)                 // no separate bar beneath the title
    await expect(bar.locator('.medbar.pmode button')).toHaveText(['auto', 'step'])
    await expect(bar.locator('.medbar.pmode button.on')).toHaveText('step')   // STEP is the default now
    // the fact, CLAIMED (the authored-intent lint, phase 6; moved here with the blocks' reorder,
    // 2026-09-04): the reader OPENS in step, each beat held on its first scene, and the pair that
    // says so rides the requirement's own title row
    await proveVisible(bar.locator('.medbar.pmode button.on'), 'step',
      'The reader, opened in step', { soft: true })
    // …EACH BEAT HELD ON ITS FIRST SCENE: the row's strip opens at moment 1, not mid-loop…
    const heldRow = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1)
    await proveVisible(heldRow.locator('.mstrip .mpos'), '1 / ' + (await heldRow.locator('.mseg').count()),
      'Every beat held on its first scene', { soft: true })
    // …and the reader's ONE SPEED rides the same title row, beside that pair
    await proveVisible(bar.locator('select.pspd'), '1',
      'The reader-wide speed, on the requirement\'s title row', { soft: true })
    intentGap('"left of its ⋯ menu" is a position — the controls\' box against the menu button\'s, which the row\'s layout decides; no element says where it sits')
    await expect(bar.locator('.medbar.pstep')).toHaveCount(0)                 // the top-bar walker is GONE
    await expect(bar.locator('.medbar')).toHaveCount(1)                       // mode only; speed is a <select>
    await expect(bar.locator('.mstrip')).toHaveCount(0)                       // the stepper is per-ROW, never on the bar
    await expect(ov.locator('.fread .tourstep')).toHaveCount(0)               // and the retired gutter tour is gone
    await expect(bar.locator('select.pspd')).toBeDisabled()                   // speed is auto-only
  })

  // THE ROW'S ONE STEPPER steps BOTH pictures of ITS row in lock-step, names each moment, tracks the
  // position in its own readout, dims prev at the first moment, and turns next into a Restart ↺ at the
  // end that wraps to the first. STEP is the default, so the reader opens HELD on moment 1 — no click
  // into step first. (Rewritten 2026-09-02, rule 4, with the human's decision as the reason: the
  // gutter's ‹ n / N › read as if it belonged to the sentence and left the pictures looking like two
  // players — "schematic and proof should share same stepper (as their steps must be same???)".)
  //
  // THE KEYS, ON TWO AXES (the human, 2026-09-02): ← → walk the SELECTED beat ONLY, ↑ ↓ change which
  // when/then is selected — the arrows never move every row at once. And a proof click opens the
  // lightbox.
  await checkReq('R20', async () => {
    const row = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1)
    const tour = row.locator('.mstrip')
    const prev = tour.locator('.mprev')
    const nextb = tour.locator('.mnext')
    const pos = tour.locator('.mpos')
    const mode = ov.locator('.fread .frmeta .frtools .medbar.pmode')
    await reveal(tour)
    // the beat's own MOMENTS, read off the harvest the fold recorded — one committed replica per
    // moment, which is the same list the row's one stepper walks on both sides
    const sub = await row.evaluate(el => {
      const rid = el.closest('.fread')!.querySelector('.frmeta .fid')!.textContent!.trim()
      const src = document.querySelector('.dt[data-screen="board"] .reqpane .req[data-r="' + rid + '"]')
      const b = JSON.parse(src!.getAttribute('data-ev-beats') || '[]').find((x: any) => Number(x.n) === 1) || {}
      const vals = (b.values || []).filter((v: any) => v && v.frame)
      const out: string[] = []
      if (b.before && !vals.length) out.push(b.replicaExpectedBefore || '')
      for (const v of vals) out.push(v.replicaExpected || '')
      if (b.after) out.push(b.replicaExpectedAfter || '')
      return out
    })
    expect(sub.length, 'the harvest recorded this beat\'s moments, each with its own replica').toBeGreaterThan(1)
    const N = sub.length
    // ONE stepper, ACROSS THE TWO PICTURES it steps, with one NAMED segment per moment — and none of
    // the rejected filmstrip's beads, nor the retired gutter line in the words
    await expect(tour).toHaveCount(1)
    await expect(tour.locator('.srbead')).toHaveCount(0)                      // no per-scene beads
    await expect(row.locator('.sbtext .mstrip')).toHaveCount(0)               // never back in the gutter
    await expect(row.locator('.mseg')).toHaveCount(N)
    // the segment NAMES come from the harvest, never from a counter: where the run recorded what it
    // proved, no segment may fall back to the generic name (the fallback is the honest word for a
    // harvest that has none — a name it does not have is not invented, board rule 3)
    const named = await row.evaluate(el => {
      const r = el.closest('.fread')!.querySelector('.frmeta .fid')!.textContent!.trim()
      const src = document.querySelector('.dt[data-screen="board"] .reqpane .req[data-r="' + r + '"]')
      const beats = JSON.parse(src!.getAttribute('data-ev-beats') || '[]')
      const b1 = beats.find((b: any) => Number(b.n) === 1)
      return (b1 && b1.values || []).filter((v: any) => v && v.label).length
    })
    if (named > 0) {
      const labels = await row.locator('.mseg .msegl').allTextContents()
      expect(labels.filter(t => /what the test checked/.test(t)).length,
        'a harvest that named its moments leaves no segment generically named').toBe(0)
    }
    const phOf = () => row.locator('.sbframe').evaluate(f => String((f as HTMLElement).dataset.repsrc || ''))
    const posN = async () => Number(((await pos.textContent()) || '0 / 0').split('/')[0].trim())

    // STEP IS THE DEFAULT: the reader opens held on scene 1, so prev is already disabled — a known
    // deterministic start with no click into step needed.
    await expect(mode.locator('button.on'), 'step is the default').toHaveText('step')
    await expect(pos).toHaveText('1 / ' + N)
    await expect(prev, 'prev dims/disables at the start').toBeDisabled()
    const before = await posN()
    await prev.click({ force: true })                                         // a dimmed prev does nothing
    await page.waitForTimeout(300)
    expect(await posN(), 'prev is inert at scene 1').toBe(before)

    // NEXT walks forward one scene, and BOTH cells go together (the proof loop and the drawing beside it)
    await nextb.click()
    await expect.poll(posN, { timeout: 6000 }).toBe(2)
    await expect.poll(phOf, { timeout: 8000 }).toBe(sub[1])
    await expect(pos).toHaveText('2 / ' + N)                                  // the position line follows the walk
    // BOTH PICTURES MOVED TO THAT ONE MOMENT, claimed where the walk lands: the position both cells
    // are now on (the Expected cell's own picture was polled against the harvest's moment 2 above,
    // so this is the walk's landing, not the strip talking to itself)…
    await proveVisible(pos, '2 / ' + N, 'Both pictures, moved together to that one moment', { soft: true })
    // …and the strip PAINTS the segment they are on — the current one, named by what the run checked
    const label2 = await row.evaluate(el => {
      const rid = el.closest('.fread')!.querySelector('.frmeta .fid')!.textContent!.trim()
      const src = document.querySelector('.dt[data-screen="board"] .reqpane .req[data-r="' + rid + '"]')
      const b = JSON.parse(src!.getAttribute('data-ev-beats') || '[]').find((x: any) => Number(x.n) === 1) || {}
      const vals = (b.values || []).filter((x: any) => x && x.frame)
      const out: string[] = []
      if (b.before && !vals.length) out.push('')
      for (const v of vals) out.push(String(v.label || ''))
      if (b.after) out.push('')
      return out[1] || ''
    })
    if (label2) {
      await proveVisible(row.locator('.mseg.cur .msegl'), label2,
        'The strip, painting the segment they are on', { soft: true })
    } else {
      intentGap('the moment this walk lands on is the beat\'s RESULT, whose segment the reader names from the beat itself rather than from a claim the run recorded — there is no recorded value for a claim to expect')
    }
    // …and it HOLDS: the scene does NOT move on its own while stepping
    const held = await posN()
    await page.waitForTimeout(2000)
    expect(await posN(), 'step holds until the tour (or a key) asks for the next scene').toBe(held)

    // WALK TO THE LAST SCENE — next becomes a RESTART ↺ that wraps back to scene 1. Walk defensively
    // until posN is N so a missed eased frame cannot desync the count.
    for (let i = 0; i < N && (await posN()) < N; i++) { await nextb.click(); await page.waitForTimeout(60) }
    await expect.poll(posN, { timeout: 6000 }).toBe(N)
    await expect(pos).toHaveText(N + ' / ' + N)
    await expect(nextb).toHaveText('↺')                                       // the restart glyph at the end
    // the fact, CLAIMED: at the last moment the next chevron has BECOME a restart — the walk says
    // where it is (the authored-intent lint, phase 6)
    await proveVisible(nextb, '↺', 'The next chevron, become a restart at the last moment', { soft: true })
    await expect(nextb).toHaveClass(/\brestart\b/)
    await nextb.click()                                                       // ↺ WRAPS to scene 1
    await expect.poll(posN, { timeout: 6000 }).toBe(1)
    await expect.poll(phOf, { timeout: 8000 }).toBe(sub[0])
    await expect(nextb).toHaveText('›')                                       // and back to the next chevron
    await hudCheck('the tour restarts at the end', 'scene 1', 'scene ' + (await posN()))

    // a requirement with SEVERAL WALKABLE beats, so the arrows can be shown to move ONE row and leave
    // the others still. Chosen from the harvest rather than hard-coded (2026-09-03): a row is walkable
    // where the run harvested that beat, and board R4's own test proves beat 1 alone — it has three
    // When/Then and one harvested row, so it stopped being the right specimen the moment the walk
    // stopped riding a drawing that existed for every beat whether or not a run had been there.
    const multi = (() => {
      const idx = JSON.parse(readFileSync('spec/_results-index.json', 'utf8'))
      const ev = (idx.board && idx.board.evidence) || {}
      return Object.keys(ev)
        .map(rid => ({ rid, n: ((ev[rid] || {}).beats || []).filter((b: any) => b && (b.before || b.after)).length }))
        .sort((a, b) => b.n - a.n)[0]
    })()
    expect(multi && multi.n, 'a board requirement whose run harvested more than one beat').toBeGreaterThan(1)
    await page.goto('/#/board/' + (spec.rid === multi.rid ? 'R5' : multi.rid))
    await page.goto('/#/board/' + multi.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(multi.rid)
    const rows = ov.locator('.fread .fstory .sbwrap .sbrow[data-rowstep]')
    const nRows = await rows.count()
    expect(nRows, 'a multi-beat requirement, so the arrows can be shown to target ONE row').toBeGreaterThan(1)
    const rowA = rows.nth(0)
    const rowB = rows.nth(1)
    // position of a row's tour (0 when the beat is single-scene and carries no tour — then it simply
    // never changes, which the isolation check below still reads correctly)
    const posOf = async (r: ReturnType<typeof rows.nth>) =>
      Number(((await r.locator('.mstrip .mpos').count()) ? await r.locator('.mstrip .mpos').textContent() : '0 / 0')!
        .split('/')[0].trim())
    await reveal(rowA.locator('.sbproof'))
    // the FIRST steppable beat opens SELECTED and visibly marked; no other row is
    await expect(rowA, 'the first beat opens selected').toHaveClass(/\bsel\b/)
    await expect(rowB).not.toHaveClass(/\bsel\b/)
    await expect(ov.locator('.fread .sbrow.sel'), 'exactly one selected row').toHaveCount(1)
    // VISIBLY marked, measured (the human, 2026-09-02: "make clear which when/then is selected" —
    // one inset hairline was not enough to see). The selected row's two PICTURES read at full
    // strength while an unselected beat's stand back, so the eye lands on the row ← → will move.
    // Measured off computed style, never a class: a rule that stops applying is the failure here.
    const opacOf = (r: ReturnType<typeof rows.nth>, sel: string) =>
      r.locator(sel).evaluate(el => Number(getComputedStyle(el).opacity))
    await expect.poll(() => opacOf(rowA, '.sbframe'),
      { message: 'the selected beat reads at full strength' }).toBe(1)
    await expect.poll(() => opacOf(rowB, '.sbframe'),
      { message: 'an unselected beat stands back' }).toBeLessThan(1)
    await expect.poll(() => opacOf(rowB, '.sbproof')).toBeLessThan(1)
    // …and the row's own NUMBER is the other mark — a ringed 1 · 2 · 3 in the MARK COLUMN beside each
    // beat's words, in beat order, with the retired superscripts nowhere in the reader. The selected
    // row's numeral steps up to --ink: measured, since a cue that stopped applying is the failure
    // here. (Read off the SPECIMEN this leg actually paged to, not off a hard-coded R4 — 2026-09-03,
    // when the walkable specimen became the one the run harvested most beats of.)
    await expect(ov.locator('.fread sup.bno')).toHaveCount(0)
    const nb4 = (prdBeats(multi.rid) || { beats: [] }).beats.length
    expect(nb4, multi.rid + ' is the multi-beat specimen this leg needs').toBeGreaterThan(1)
    await expect(ov.locator('.fread .fstory .sbwrap .sbrow .sbno:not(.hollow)'))
      .toHaveText(Array.from({ length: nb4 }, (_, k) => String(k + 1)))
    const inkOf = (r: ReturnType<typeof rows.nth>) => r.locator('.sbno').evaluate(el => getComputedStyle(el).borderTopColor)
    expect(await inkOf(rowA), 'the selected beat\'s numeral is inked').not.toBe(await inkOf(rowB))
    // …and NO per-row keyboard hint (the human, 2026-09-02: "the hint of walk this beat… is repeating
    // on every block, again please avoid duplicated things") — the footer says it once
    // rule 4 (2026-09-02): asserting the WORD "walk" is absent was wrong — R20's own When says "When
    // you walk a beat" and names "the ← → keys", so the requirement's sentence tripped it. The claim is
    // that no ROW repeats the keyboard hint: the hint is an ELEMENT, and none exists per row.
    await expect(ov.locator('.fread .fstory .sbrow .kbd')).toHaveCount(0)
    await expect(ov.locator('.fread .fstory .sbrow [title*="walk this beat"]')).toHaveCount(0)
    await expect(ov.locator('.fread .fstory .kbd')).toHaveCount(0)

    // ISOLATION: → walks the SELECTED row (rowA) only. rowB's tour position must not move.
    const aStart = await posOf(rowA); const bStart = await posOf(rowB)
    const bTextBefore = ((await rowB.locator('.mstrip .mpos').count())
      ? ((await rowB.locator('.mstrip .mpos').textContent()) || '').trim() : '')
    await page.keyboard.press('ArrowRight')
    if (aStart > 0) await expect.poll(() => posOf(rowA), { timeout: 6000 }).not.toBe(aStart)
    expect(await posOf(rowB), 'the UNSELECTED beat never moved — ← → act on the selected row only').toBe(bStart)
    // …and NO OTHER BEAT ROW MOVED, claimed on the row that did not: its position is still the one
    // it opened on, read after the key that walked its neighbour.
    if (bTextBefore) {
      await proveVisible(rowB.locator('.mstrip .mpos'), bTextBefore,
        'The other beat row, exactly where it was', { soft: true })
    }

    // ↑ ↓ move the SELECTION between beats — the dedicated "which when/then" axis
    await page.keyboard.press('ArrowDown')
    await expect(rowB, '↓ selects the next beat').toHaveClass(/\bsel\b/)
    await expect(rowA).not.toHaveClass(/\bsel\b/)
    await page.keyboard.press('ArrowUp')
    await expect(rowA, '↑ selects the previous beat').toHaveClass(/\bsel\b/)

    // no media toolbar crept back in — this is a PLAY mode (R20's standing absence)
    await expect(rowA.locator('.sbproof .pcmodes')).toHaveCount(0)
    // a proof click opens the shared lightbox — the whole frame, one click away
    await expect(page.locator('#lb')).toBeHidden()
    // click the CELL, not the img's own box: under the camera a frame is several times its cell wide,
    // so the img's bounding-box centre can fall outside the cell that clips it — and Playwright then
    // reports the neighbouring cell intercepting the click. The cell's centre is always over the
    // frame on show, and the lightbox is bound on the image the click lands on (a delegated handler),
    // so this is the same gesture a person makes. (2026-09-03: the specimen became a requirement
    // whose beats are ZOOMED, which is what exposed it.)
    await rowA.locator('.sbproof .pcplay .pcbox, .sbproof .pcbox.pcplay').first().click({ timeout: 8000 })
    await expect(page.locator('#lb'), 'the proof click opens the whole frame').toBeVisible()
    await hudCheck('a proof click opens the lightbox', 'lightbox open', 'lightbox open')
    await page.locator('#lbclose').click()
    await expect(page.locator('#lb')).toBeHidden()
  })

  // READER-WIDE AND SESSION-HELD: the STEP default holds across paging, is never stored, and AUTO
  // re-arms the loop.
  await checkReq('R20', async () => {
    // page to another requirement: it opens in step too, and nothing about the mode is written down
    await page.goto('/#/board/R4')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText('R4')
    await expect(ov.locator('.fread .frmeta .frtools .medbar.pmode button.on')).toHaveText('step')
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => /mode|play|step/i.test(k))),
      'the play mode is session-scoped — never stored').toEqual([])
    // …and AUTO re-arms the loop: the selected beat's position advances on its own once auto is chosen
    await page.goto('/#/board/' + spec.rid)
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(spec.rid)
    const backRow = ov.locator('.fread .fstory .sbwrap .sbrow').nth(1)
    const backPos = backRow.locator('.mstrip .mpos')
    await reveal(backRow.locator('.sbproof'))
    const tools = ov.locator('.fread .frmeta .frtools')
    await tools.locator('.medbar.pmode button', { hasText: 'auto' }).click()
    await tools.locator('select.pspd').selectOption('4')
    const at2 = await backPos.textContent()
    await expect.poll(() => backPos.textContent(), { timeout: 12000 }).not.toBe(at2)
    // the fact, CLAIMED (the authored-intent lint, phase 6): in AUTO the speed control is live and
    // it is the READER's one speed — proveVisible reads a select's own value. AFTER the poll above,
    // never before it: a claim rings, scrolls and photographs, which is a second or two of work in
    // the middle of a leg that is timing what the loop does on its own.
    await proveVisible(tools.locator('select.pspd'), '4',
      'The reader\'s one speed, live in auto', { soft: true })
    // …and the cell PLAYS ITSELF: the position it is on now is not the one the loop started from,
    // with nothing touched between the two readings.
    await proveVisible(tools.locator('.medbar.pmode button.on'), 'auto',
      'Auto — every cell playing itself on a loop', { soft: true })
    // …and "a stepped beat sets its pace by hand" is the speed control's DISABLED state in step,
    // asserted in the beat-3 block above. Disabledness is not a value an element carries as text —
    // what this control says of itself is its speed, claimed on the line above.
    intentGap('"a stepped beat sets its pace by hand" is the speed <select> being DISABLED in step — a control state, asserted in the block above; the element\'s own value is its speed, not its liveness')
    await tools.locator('select.pspd').selectOption('1')
  })

  // the GIVEN row is a STATE, not an action: one frame, so nothing to loop and nothing to step — and
  // now UNCAPTIONED (the human, 2026-09-02: the "given" label row is gone)
  await checkReq('R20', async () => {
    const given = ov.locator('.fread .fstory .sbwrap .sbrow').first()
    await reveal(given.locator('.sbproof'))
    await expect(given.locator('.sbproof .pcplay')).toHaveCount(0)
    await expect(given.locator('.sbproof .fsteps-wrap')).toHaveCount(0)
    await expect(given.locator('.sbproof .pcstrip .pcfig img')).toHaveCount(1)   // the one still
    await expect(given.locator('.sbproof .pccap')).toHaveCount(0)                // no caption — a plain still
    await expect(given.locator('.sbproof .pdots')).toHaveCount(0)
    // the fact, CLAIMED AS AN ABSENCE (fix round 1, 2026-09-04): the one frame stays PLAIN — no
    // caption over it. A claim that reads MISSING passes exactly while there is none and fails, with
    // the caption's own words, the moment one is added.
    await proveVisible(given.locator('.sbproof .pccap'), MISSING,
      'The context row\'s one frame, uncaptioned', { soft: true })
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
    await expect(story().locator('.sbwrap .sbhead .sbhc')).toHaveText(['behavior', 'expected', 'actual'])
    // the fact, CLAIMED (the authored-intent lint, phase 6): the header row over the cells it names,
    // and the first of them is the behaviour's words — the order every row deals
    await proveVisible(story().locator('.sbwrap .sbhead .sbhc').first(), 'behavior',
      'The cell the row deals first — the behaviour\'s words', { soft: true })
    // …then the drawn schematic, then the harvested proof: the two picture columns name themselves
    // in the order the row deals them (design C's names — Expected, then Actual)
    await proveVisible(story().locator('.sbwrap .sbhead .sbhc').nth(1), 'expected',
      'Then the drawn schematic — the Expected cell', { soft: true })
    await proveVisible(story().locator('.sbwrap .sbhead .sbhc').nth(2), 'actual',
      'Then the harvested proof — the Actual cell', { soft: true })
    // …and the two facts this Then states about the LAYOUT are measurements, made in this very
    // block: which cell leads every row, and how far each header label sits from the cell it names.
    intentGap('"every row deals the same three cells in one order" is measured over every row\'s cells above (leadCells) — a list of class names, not a value any element on the row carries')
    intentGap('"the header row OVER the cells it names" is a position: each label\'s left edge against its column\'s, measured as headDrift in this block; nothing on the screen says it')
    await hudCheck('the header sits over the cells it names', '0px drift', (await headDrift()) + 'px drift')
    expect(await headDrift(), 'every header label starts over the cell it names').toBeLessThan(2)
  })

  await checkReq('R21', async () => {
    // THE ORDER CONTROL IS GONE, and so is everything it needed. Not "defaults to behaviour first" —
    // there is no order class on the story and no stored preference; a reader that kept the toggle and
    // merely pre-selected one stop fails here. The reader's bar carries ONLY the PLAY-MODE pair now
    // (2026-09-01): the scene stepper moved onto each beat row's rail (board R20), so the bar's one
    // .medbar is the mode — a re-dealt column-order pair would be a second, unnamed .medbar and caught.
    await expect(ov.locator('.fread .medbar')).toHaveCount(1)
    await expect(ov.locator('.fread .medbar.pmode')).toHaveCount(1)
    await expect(ov.locator('.fread .medbar.pstep')).toHaveCount(0)
    // the second fact, CLAIMED AS AN ABSENCE (fix round 1, 2026-09-04): there is no control to
    // change the order. MISSING passes exactly while the order pair is gone and fails, naming it,
    // the moment one comes back.
    await proveVisible(ov.locator('.fread .medbar.pstep'), MISSING,
      'No control to change the order', { soft: true })
    // the CONTROL, not the word: R21's own prose still describes the toggle it used to have, and the
    // prose is the human's to reword (rule 5). So the ban is on the reader's control group (now on the
    // title row, board R20's 2026-09-02 move).
    await expect(ov.locator('.fread .frmeta .frtools')).not.toContainText('schematic first')
    await expect(ov.locator('.fread .frmeta .frtools')).not.toContainText('behavior first')
    await expect(story()).not.toHaveClass(/\bord-bsp\b/)
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => /ord|colorder|column/i.test(k))),
      'there is no column order to store any more').toEqual([])
    // …and it is the same one order on the next requirement you page to — not a per-requirement taste
    await page.goto('/#/board/R13')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText('R13')
    await reveal(story())
    const lead = await leadCells()
    expect(lead.every(c => c === 'sbtext'), 'the next requirement reads behaviour first too').toBe(true)
    await expect(story().locator('.sbwrap .sbhead .sbhc')).toHaveText(['behavior', 'expected', 'actual'])
    // the fact, CLAIMED: the requirement you paged to reads in that SAME order — the words first
    await proveVisible(story().locator('.sbwrap .sbhead .sbhc').first(), 'behavior',
      'The next requirement, dealing the same first cell', { soft: true })
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
    // ONE DECLARATION PER FACT (final review I3, 2026-09-04): this beat opens a page, so the
    // whole-beat waiver does not apply — each fact says for itself why the board has no surface a
    // claim could ring. The shared cause: since the proof band was removed (2026-09-02) a run's cut
    // frames live on the test row in the HIDDEN baked pane and in the Steps window, and a claim on a
    // hidden node rings nothing.
    intentGap('"one frame per checked value shows in order" is a COUNT and an ORDER over the hidden baked row\'s strip — no single element renders either, and the strip itself is hidden')
    intentGap('"cut from the recording at the instant it fired" is a property of how the still was produced, outside this deterministic suite — nothing on the board displays the instant a frame was taken')
    intentGap('"each carrying its burned-in callout and got-vs-expected — a failing value red" is burned into the PIXELS of a still on that hidden row; there is no text node carrying it for proveVisible to read')
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
    // what the reader shows must not depend on the dogfood lag (mid-run the live status is
    // stale-by-source), so force the status onto the real node — the established deterministic
    // technique — and rebuild the reader on it. `failed` is the status these legs are about.
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => el.setAttribute('data-status', 'failed'))
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()

    // (1) IN THE FOCUS READER the frames are read PER BEAT, on the row they prove — the run's own cut
    // frames are read on the TEST's evidence (leg 2 below), which is where R14 always said they also
    // belong. REWRITTEN 2026-09-02 (rule 4, the human's decision the reason): this leg used to assert
    // the proof BAND's filmstrip — its .rf cells, their one-row layout, their fixed sizing and its
    // sideways scroll. The band is gone with the reader's video ("remove the full flow video from
    // focus mode"), so those assertions are not weakened, they are about a surface that no longer
    // exists. What R14 claims is unchanged and still asserted: one still per checked value, in
    // order, captioned with its got-vs-expected, the failing one red — on the test's evidence
    // (leg 2, strengthened to read the captions) — and the harvested pair on the beat's own row here.
    const ov = dt.locator('.focusov')
    await expect(ov.locator('.feval .fmedia'), 'the band, and its filmstrip, are gone').toHaveCount(0)
    await expect(ov.locator('.feval .fstrip, .feval .fcell')).toHaveCount(0)
    // the moved test node's own strip stays folded away inside the reader (the row is read where the
    // row lives — the pane, the Steps window); its header stays folded behind the proof line
    await expect(ov.locator('.feval .fev .pfstrip')).toBeHidden()
    await expect(ov.locator('.feval .fev .flabel')).toHaveCount(0)
    await expect(ov.locator('.feval .fev .test.infocus > .th')).toBeHidden()
    // THE SPLIT IS HONEST (the human, 2026-08-28): a beat row's cell plays only that beat's own
    // HARVESTED pair. Borrowing a RUN frame onto a beat row would claim the harvest photographed
    // something it never did (rule 3), so the two must not mix — the stub's captions are the witness.
    const beatCell = ov.locator('.fread .fstory .sbrow .sbproof').filter({ has: page.locator('.pcplay') }).first()
    await expect(beatCell).toHaveCount(1)
    // …and it plays exactly the MOMENTS THE HARVEST RECORDED for that beat, counted off the fold's
    // own record rather than assumed. (Corrected 2026-09-04, rule 4 — the TEST was the wrong side:
    // this pinned "2 — before → after, the harvested pair", which was true only while no board beat
    // claimed a value. R1's beat now rings four, so its loop is each asserted value then the after,
    // and the before leaves the loop exactly as R20 says it does. The property R14 states — one
    // still per checked value — is what the number now comes from, so this fails if the loop and
    // the harvest ever disagree, and it can no longer pass by counting to two.)
    const beatRow = ov.locator('.fread .fstory .sbrow').filter({ has: page.locator('.pcplay') }).first()
    const nMoments = await beatRow.evaluate(el => {
      const rid = el.closest('.fread')!.querySelector('.frmeta .fid')!.textContent!.trim()
      const src = document.querySelector('.dt[data-screen="board"] .reqpane .req[data-r="' + rid + '"]')
      const b = JSON.parse(src!.getAttribute('data-ev-beats') || '[]').find((x: any) => Number(x.n) === 1) || {}
      const vals = (b.values || []).filter((v: any) => v && v.frame)
      return (vals.length ? vals.length : (b.before ? 1 : 0)) + (b.after ? 1 : 0)
    })
    expect(nMoments, 'the harvest recorded this beat\'s moments').toBeGreaterThan(1)
    await expect(beatCell.locator('.fsteps img')).toHaveCount(nMoments)
    await expect(beatCell.locator('.fsteps img.on')).toHaveCount(1)
    await expect(beatCell).not.toContainText('third value')        // never the run strip's captions
    // a still is a thumbnail; a click opens the whole frame in the shared lightbox
    await beatCell.locator('.fsteps img.on').click()
    await expect(page.locator('#lb')).toBeVisible()
    await page.locator('#lbclose').click()
    // NO VIDEO IN THE READER (the human, 2026-09-02). The committed recording is forced ON the row
    // the way the fold bakes it — so this is the honest opposite of the old "the band's ONE video"
    // leg, not an absence that happens to hold: with the artifact right there, no player is built.
    // (The artifact itself is still pinned as real by leg (a) at the end — it is the Flow view's.)
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => {
      el.setAttribute('data-ev-video', 'spec/board/evidence/stub-committed.webm')
      el.setAttribute('data-ev-vwin', '9000:12500')
    })
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    // …no player is built, and nothing that framed one is left behind. (Legs (b) and (c) — the
    // player's own width, its seek to the beat's window.from, its honest "this beat at 0:09–0:12"
    // label, and the reader speed driving its playbackRate — went with the band, 2026-09-02: they
    // measured a surface the human removed. The speed control still exists and still paces the beat
    // rows; that is asserted on board R20's own test, where the control lives.)
    await expect(ov.locator('.feval video'), 'the committed video is baked on, and still not played here').toHaveCount(0)
    await expect(ov.locator('.feval .frecwrap, .feval .fvlab, .feval .fvjumps')).toHaveCount(0)
    // session-scoped only: no speed preference lands in storage
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => /spd|speed/i.test(k)))).toEqual([])

    // (1b) UNDER A FAILURE the reader never reads green (D3's honesty, kept; its surface changed).
    // The band carried the ✗ chip and the failing run's red frames; with the band gone the failure
    // reads on the title row and the harvested red frames stay on the beat rows — and the run's own
    // cut frames are read on the test's evidence, leg (2). The row's word for it is the requirement
    // CHIP since 2026-09-02, when the human took the TEST ✓ <name> group (and its mark) off the row.
    // Forced status, same technique.
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => el.setAttribute('data-status', 'failed'))
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    await expect(ov.locator('.fread .frmeta .fchip')).toHaveText('✗ Failed')
    await expect(ov.locator('.fread .frmeta .fchip')).not.toHaveClass(/\bpassed\b/)
    await expect(ov.locator('.frmeta .fpm')).toHaveCount(0)
    await expect(ov.locator('.fread .fstory .sbrow .sbproof .fsteps img').first()).toBeAttached()
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => el.setAttribute('data-status', 'passed'))
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    await expect(ov.locator('.fread .frmeta .fchip')).toHaveText('✓ Passed')   // and only on a failure
    // …and NO run-frame strip crowds the reader in either state: the per-beat harvest on the rows is
    // the proof there (2026-08-28), and since 2026-09-02 there is no band left to hold one
    await expect(ov.locator('.feval .fcell, .feval .fstrip')).toHaveCount(0)

    // (2) THE RUN'S CUT FRAMES ARE THE TEST'S OWN EVIDENCE — the one surface for them now. Leave
    // Focus: the borrowed node returns whole to the hidden source pane, frames intact (count/class
    // reads work on hidden rows). STRENGTHENED 2026-09-02: with the band's filmstrip gone this is
    // where R14's "one still per checked value, its got-vs-expected, the failing one red" is
    // asserted, so the captions are read here rather than only counted.
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    const tst = dt.locator('.testpane .test', { hasText: R1_TITLE }).first()
    // (the TEST's strip is every frame the test cut — all four, the foreign dispatch:R1 one included)
    await expect(tst.locator('.pfstrip .pframe')).toHaveCount(4)
    await expect(tst.locator('.pfstrip .pframe').nth(0)).toContainText('got 7 · expected 7')
    await expect(tst.locator('.pfstrip .pframe').nth(2)).toContainText('got 5 · expected 4')
    await expect(tst.locator('.pfstrip .pframe').nth(0)).not.toHaveClass(/\bbad\b/)
    await expect(tst.locator('.pfstrip .pframe').nth(2)).toHaveClass(/\bbad\b/)   // the failing value reads red
    await expect(tst.locator('.pfstrip .pframe').nth(0).locator('img')).toHaveCount(1)  // frames OF the recording
    await expect(tst.locator('.pfstrip .pframe').nth(3).locator('.pfreq')).toHaveText('dispatch:R1')

    // (2b) Task 6 review A-1: under a failed status the reader names the run that FAILED it. R15 is
    // covered by two tests; stub the first (DOM order) passing and the second failing — the proof
    // header must name the SECOND, never the green one. (The strip half of this leg — the failing
    // run's own frames in the band — went with the band, 2026-09-02; the primary-picking rule it was
    // really guarding is asserted here on the header, which is the surface that still shows it.)
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
    await expect(dt.locator('.focusov .feval .fmedia')).toHaveCount(0)
    await expect(dt.locator('.focusov .fread .frmeta .fchip')).toHaveText('✗ Failed')
    // the reader's PRIMARY is still the test whose run FAILED — never the passing one that also
    // covers R15. Its NAME headed the title row until 2026-09-02 (the human took the group off), so
    // the resolution is read where the name lives now: the row's one ⋯ composes "Edit this test"
    // from the primary, and it must name B, not A.
    await expect(dt.locator('.focusov .frmeta .fptop .fpname')).toHaveCount(0)
    await dt.locator('.focusov .frmeta .fmenubtn').click()
    await dt.locator('.focusov .frmeta .fmenupop [data-prompt="edittest"]').click()
    await expect(page.locator('#promptsheet')).toHaveClass(/\bon\b/)
    await expect(page.locator('#promptbody')).toContainText(B_TITLE)
    await expect(page.locator('#promptbody')).not.toContainText(A_TITLE)
    await page.locator('#promptsheet [data-promptclose]').click()
    // and the failing run's own cut frame is still readable — on that test's own evidence row.
    // dt-scoped, not pane-scoped: this row is the reader's PRIMARY, so it is borrowed out of the
    // .testpane right now (count/class/text reads work on it wherever it sits — CLAUDE.md).
    const bRow = dt.locator('.test', { hasText: B_TITLE }).first()
    await expect(bRow.locator('.pfstrip .pframe')).toHaveCount(1)
    await expect(bRow.locator('.pfstrip .pframe').first()).toContainText('B value — got 2 · expected 3')
    await expect(bRow.locator('.pfstrip .pframe').first()).toHaveClass(/\bbad\b/)

    // (3) NO VIDEO → NO STRIP: a record that cut no frames yields no run-frame cells anywhere — the
    // harvested pair on the beat rows still stands, never a faked or separately-captured strip. The
    // stub keeps a framed record behind a newer frameless one, so this also holds the old
    // newest-record rule up to the light: whatever surface shows a run's frames, a green strip from
    // a past run must never appear under a newer verdict.
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
    // FAILED again — the state a strip would have been shown under: the newest record cut no frames,
    // so nothing anywhere claims to be one, and the harvested frames on the rows carry the proof.
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => el.setAttribute('data-status', 'failed'))
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    await expect(dt.locator('.focusov .fread .fstory .sbrow .sbproof .fsteps img').first(),
      'the harvested frames still stand').toBeAttached()
    await expect(dt.locator('.focusov .feval .fcell, .focusov .feval .fstrip'),
      'no run strip — no frames, no fake').toHaveCount(0)
    // (the TEST's own strip is a different rule on purpose and is NOT asserted empty here: it keeps
    // the newest record that actually HAS frames, so a later video-less CLI run cannot blank the
    // evidence a recorded run cut — tools/board/client.js, the .pfstrip fill.)

    // THE HARVESTED PAIR ITSELF lives on the beat rows now (the human, 2026-08-28): it is read
    // beside the words it proves, PLAYED as the beat's own loop — one camera box filling the cell,
    // each frame a REAL frame (never a sliver) and still zoomable. Back to passed, where the rows
    // are the whole proof.
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => el.setAttribute('data-status', 'passed'))
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    const cellP = dt.locator('.focusov .fread .fstory .sbrow .sbproof').filter({ has: page.locator('.pcplay') }).first()
    // the loop fills its cell, and a click opens the whole frame in the lightbox — there is no inline
    // toggle any more (the human, 2026-09-02); the geometry below measures the framed loop
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

    // (d) with NO committed video the reader is UNCHANGED — the beat rows are the proof either way.
    // (Task 16 #1's leg here asserted the band said "no recording committed for this screen yet" in
    // words; with the band gone there is no line to say it, and nothing to say it about: the reader
    // never plays the recording now. What that leg really guarded — never a broken player over a
    // missing file — is guarded absolutely, since no player is built at all.)
    await dt.locator('.reqpane .req[data-r="R1"]').evaluate(el => {
      el.removeAttribute('data-ev-video'); el.removeAttribute('data-ev-vwin')
    })
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator('.viewseg .vseg[data-view="focus"]').click()
    await expect(ov.locator('.feval video')).toHaveCount(0)
    await expect(ov.locator('.fread .fstory .sbrow .sbproof .fsteps img').first()).toBeAttached()

    // (a) Task 16 #1: the committed artifact is REAL — the fold's evidence entries point `video`
    // at a content-hash-named .webm under the screen's committed evidence dir, and the file exists
    // in the tree (the same source the bake reads; red until the first recorded board run commits
    // one, then a video-less CLI fold must KEEP it — the carry this pins). The reader no longer
    // plays it (2026-09-02), but the FLOW view does, and the fold still has to commit it.
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
  // …and the OTHER half of "refreshes in place": ONE refresh, at the END. A live run rebuilds
  // nothing at all (the human, 2026-09-02 — a background run reloaded the board on every burst of
  // harvest writes); the gate opens when the run is done. Second beat, same requirement.
  await checkReq('dispatch:R7', async () => { await noRebuildWhileRunning(page, { ...treeShape() }) })
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
    await expect(strip.locator('.feat[data-feat="proof"]')).toContainText(/actual from real runs/i)
    await expect(strip.locator('.feat[data-feat="drift"]')).toContainText(/drift/i)
    await expect(strip.locator('.feat[data-feat="views"]')).toContainText('Focus · List · Flow')
    await expect(strip.locator('.feat[data-feat="compose"]')).toContainText(/compose a flow/i)
    await expect(strip.locator('.feat[data-feat="gaps"]')).toContainText(/honest gaps/i)
    // the fact, CLAIMED on the card that is about to be clicked (the authored-intent lint, phase 6):
    // a feature card names the LIVE example of itself it opens on this board
    await proveVisible(strip.locator('.feat[data-feat="views"] .fs2'), 'open the List',
      'A feature card, naming the live example it opens', { soft: true })
    // …and the strip is SIX cards of the board's own features: the first of them names itself here,
    // so a strip that lost a card, or renamed one into prose, fails on the value and not on a count.
    await proveVisible(strip.locator('.feat[data-feat="beats"] .fl2 b'), 'Beats',
      'A feature strip of six, each a card of this board\'s own', { soft: true })
    // the strip sits ABOVE the areas
    const above = await page.evaluate(() => {
      const s = document.getElementById('featwrap'); const h = document.getElementById('home')
      return !!(s && h && (s.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING))
    })
    expect(above, 'the strip must precede the area cards').toBe(true)
    // a card OPENS the live example of itself: beats → a requirement whose reader leads with a
    // behavior block; the three views → the List view of a real screen
    await strip.locator('.feat[data-feat="beats"]').click()
    // (.sbwhen is a BEAT's sentence — When … — so it exists only where a behavior block does: a
    // prose-only requirement's single row carries one .sbgiven and would fail this)
    await expect(page.locator('.dt:not([hidden]) .focusov .fread .fstory .sbrow .sbtext .sbwhen').first()).toBeVisible()
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
    await expect(ov.locator('.frmeta .fpacts [data-run]')).not.toHaveCount(0)
    // its steps fold rides the moved row (kept, hidden — the reading card shows the clone)
    await expect(ov.locator('.feval .fev .test.infocus .fold')).toHaveCount(1)
    // the whole log opens in a FLOATING window, not a full-viewport scrim (a scrim suppresses the
    // board's own paint) — via the ⋯ menu's wired Logs button (the real node, relocated)
    const sheet = page.locator('#logsheet')
    await expect(sheet).toBeHidden()
    await ov.locator('.frmeta .fmenubtn').click()
    await ov.locator('.frmeta .fmenupop [data-log]').click()
    await expect(sheet).toHaveClass(/on/)
    const covers = await sheet.locator('.box').evaluate(el => {
      const r = el.getBoundingClientRect()
      return r.width >= innerWidth - 1 && r.height >= innerHeight - 1
    })
    expect(covers).toBeFalsy()                               // a floating card, not a full-viewport overlay
    // This block proves the LOG WINDOW — this requirement's THIRD beat — and it is the last
    // checkReq('R10') in the file, so BEAT_CURSOR files its harvest under beat 1, whose facts are
    // the story steps, their pending plan and the run's marks. Those live on the baked test row,
    // hidden since the Columns view retired; they are claimed and declared where the reader stands
    // on them, in this requirement's own evidence block above.
    // ONE DECLARATION PER FACT (final review I3, 2026-09-04): the beat has a page open, so the
    // whole-beat waiver does not apply — each of beat 1's three facts says for itself why THIS
    // block cannot ring it. The cause is shared (this block stands on beat 3), and a shared reason
    // is still not a shared waiver.
    intentGap('beat 1\'s "its numbered story steps show from its definition" lives on the hidden baked test row; this block stands on the log window (beat 3), where those steps are not on screen at all — they are claimed and declared in this requirement\'s own evidence block above')
    intentGap('beat 1\'s "before any run" is a state this block is past — a run has already folded by the time the ⋯ menu opens its log, so there is no pre-run row here for a claim to read')
    intentGap('beat 1\'s "each wearing the run\'s passed / failed / not-reached mark" is a mark on that same hidden baked row, absent from the log window this block opens')
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
    // the fact, CLAIMED on the drawn scene itself (the authored-intent lint, phase 6): act 1's
    // second moment IS a scene — greeked code under one readable green badge — not a paragraph
    await proveVisible(wall.locator('.chip.ok'), '40 tests passing',
      'Reviewing it, without the tool — one green badge over a wall of code', { soft: true })
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
    // the fact, CLAIMED: two clicks stepped the act forward to its third scene and it HOLDS there —
    // the end state of the scene it stepped to is the thing on screen (the intent lint, phase 6)
    await proveVisible(un, 'unproven', 'The scene it stepped to, held — nothing advances on its own', { soft: true })
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
    // THE BEAT'S OWN FACT, CLAIMED (2026-09-04, the review's C1: this block was reading "2 claims"
    // it never made — an unrelated body credited to it by the lint's own parser — so the beat that
    // says the walkthrough never advances on its own had no claim at all). Under reduced motion the
    // END STATE is simply what is on screen: the scene holds it with nothing running, which is the
    // same sentence from the other side.
    await proveVisible(req.locator('.sc-canon'), 'canon the moment it\'s written',
      'The scene, held on its end state — nothing advances on its own', { soft: true })
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
    // …AND EACH OF THE THREE IS CLAIMED (final review I3, 2026-09-04). This block opens a page, so
    // its facts have a surface a claim can ring and the whole-beat waiver it used to carry does not
    // apply — a declaration there was a way of not writing three claims. Each of the three reads a
    // value the deep-linked page actually renders, so a router that reached the guide without
    // opening the collapsed <details>, or opened the wrong skill's panel, fails here with the app's
    // own text as `got`. (BEAT_CURSOR still files this harvest under beat 1 while the block proves
    // the routing — the open design item "checkReq cannot name its beat"; the walkthrough's two
    // acts are claimed where the reader stands on them, further up this file.)
    const panel = page.locator('.flow-panel.open[data-skill="kg-deep"]')
    await proveVisible(panel.locator('.p-id h3'), 'kg-deep',
      'The skill the deep link named, open on its own page', { soft: true })
    await proveVisible(page.locator('#skillback'), '← How does it work',
      'The way back — only the detail page carries it', { soft: true })
    await proveVisible(panel.locator('.p-tag'), 'one screen → deep and proven',
      'The opened panel\'s own tagline, inside the disclosure the router had to open', { soft: true })
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
      // …and the same sentence CLAIMED, ringed on the guide's last panel (the authored-intent lint,
      // phase 6): the CTA is derived from the tree on this build, and when everything derivable
      // already holds it says so in these exact words
      await proveVisible(cta.locator('.wcta-settled'),
        'Every derivable fact already holds — this project\'s requirements are proven.',
        'The one next action, derived from the tree on this build', { soft: true })
      // …ONE action, claimed as the absence of the other: the your-turn pill is not beside it, so
      // the panel closes on a single derived next step rather than a menu of them.
      await proveVisible(cta.locator('.wcta-act'), MISSING,
        'ONE next action — no second, your-turn pill beside it', { soft: true })
      // …and two of this Then's clauses have nothing on the guide to read. The `/kg-deep <screen>`
      // EXAMPLE is the other branch of the same derivation — this tree is settled, so the guide
      // shows the settled sentence instead — and "when everything derivable already holds" is the
      // CONDITION that chose it, computed by tools/journey.mjs at build time (seeded and asserted
      // above), never rendered.
      intentGap('"for example /kg-deep <screen>" is the UNSETTLED branch of the same derivation: this tree holds every derivable fact, so the guide shows the settled sentence — the branch itself is derived by tools/journey.mjs and unit-tested there')
      intentGap('"when everything derivable already holds" is the CONDITION the build evaluated (journey(), seeded above), not a value the guide puts on the screen — what the screen shows of it is the sentence claimed on the line above')
    })
  } finally {
    // a seeded file is this test's own litter: remove it and rebuild, so no later test in the run
    // opens onto a board built on a fixture (the R13 precedent below). A config that was already
    // there is the human's and is not touched at all.
    if (!hadConfig) { rmSync(CONFIG_FILE, { force: true }); build() }
  }
})

// Board R22 — WHAT GATES CI, ON THE BOARD (the human, 2026-08-30: "user need to be clear that they
// can add some test for CI check, and what tests are added"). The chooser is spec/_ci.json and
// tools/ci-select.mjs is the resolver the GitHub workflow itself runs; the board reads the same file
// through the same resolver at BUILD time and marks the cards that gate. Nothing is stored — which
// is the whole claim, so it is proven by SEEDING a different chooser, rebuilding, and watching the
// marks follow (the R12 seeding precedent above; the state guard is the backstop and this test puts
// the file back itself).
//
// RETAGGED 2026-08-30: this was written against R12 because R12 was the nearest standing sentence
// ("derived, not stored" + the guide), and it was flagged at the time as a misuse — R12 is about the
// guide's ONE NEXT ACTION, not about CI, so tagging it inflated R12's proof with an assertion R12
// does not describe. The human resolved it by creating R22, which says exactly this. The tag follows
// the meaning (rule 5: the human owns it, and they have now spoken).
test('The home cards say which screens gate CI, derived from spec/_ci.json', async ({ page }) => {
  await coverReqs('R22')
  const CI_FILE = 'spec/_ci.json'
  const had = existsSync(CI_FILE) ? readFileSync(CI_FILE, 'utf8') : null
  const marked = async () => page.locator('#home .card').evaluateAll(cards => cards
    .filter(c => c.querySelector('.kchip.ci'))
    .map(c => c.getAttribute('data-screen')).sort())
  const all = async () => page.locator('#home .card').evaluateAll(cards =>
    cards.map(c => c.getAttribute('data-screen')).sort())
  try {
    await checkReq('R22', async () => {
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
      // the fact, CLAIMED on the card the committed chooser names (the authored-intent lint, phase
      // 6): the mark is on it, and it says what it is
      await proveVisible(page.locator(`#home .card[data-screen="${want[0]}"] .kchip.ci`), 'CI gate',
        'The gate mark, on a card spec/_ci.json chose', { soft: true })
      // …and the Then's other fact: THE GUIDE NAMES THE CHOOSER BY FILE, so a person can find it
      // without reading the workflow. Claimed on the guide's own line, then the reader goes back
      // home — the block after this one starts from the cards.
      await page.goto('/#howitworks')
      await page.waitForSelector('#walkthrough')
      await proveVisible(page.locator('#howview .cinote code').first(), 'spec/_ci.json',
        'The guide, naming the chooser by file', { soft: true })
      await page.goto('/')
      await page.waitForSelector('#home .card')
    })

    await checkReq('R22', async () => {
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
      // the fact, CLAIMED: the mark MOVED — it is on the screen the new chooser names, and the card
      // it left carries none (asserted above; an absence cannot be photographed, the arrival can)
      await proveVisible(page.locator(`#home .card[data-screen="${only}"] .kchip.ci`), 'CI gate',
        'The mark, moved to the screen the new chooser names', { soft: true })
      // …AND THE CARD IT LEFT CARRIES NONE — claimed as the absence it is (I5, 2026-09-04: this beat
      // used to close it with the arrival above, a neighbour's positive fact). `MISSING` passes
      // exactly while board's card has no mark and fails, naming it, the moment a stale mark stays.
      await proveVisible(page.locator('#home .card[data-screen="board"] .kchip.ci'), MISSING,
        'And the card it left carries none', { soft: true })
      await hudCheck('a different chooser moves the mark', only, (await marked()).join(' '))

      // (c) NO CHOOSER AT ALL is the resolver's own rule — every screen runs — so every card wears it
      rmSync(CI_FILE, { force: true })
      build()
      await page.reload()
      await page.waitForSelector('#home .card')
      expect(await marked(), 'an absent chooser widens the gate back to every screen').toEqual(await all())
      // …AN ABSENT CHOOSER MEANS EVERY SCREEN: the card the seeded chooser had left out wears the
      // mark again, with no file on disk to name it — the resolver's own rule, read off the board.
      await proveVisible(page.locator('#home .card[data-screen="board"] .kchip.ci'), 'CI gate',
        'An absent chooser means every screen — board is marked again', { soft: true })

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
    // the fact, CLAIMED (the authored-intent lint, phase 6): what the ⋯ opens is a READY PROMPT —
    // the window says which one, and the board wrote nothing to open it
    await proveVisible(page.locator('#prompttitle'), 'Reword this requirement',
      'The prompt the ⋯ hands you, ready to paste', { soft: true })
    // pre-loaded: the exact file, the target requirement, and the discipline — verbatim phrases
    await expect(body).toContainText('spec/board/prd.md')
    await expect(body).toContainText(reqId)
    // the discipline is the four lines that keep the PROOF honest (the human, 2026-09-02: the
    // red-first line is method, not proof — a normal user "won't get the write failing test first
    // anyway", and the kg-e2e skill still carries it for Claude); it is asserted ABSENT
    await expect(body).not.toContainText('write the failing test first')
    await expect(body).not.toContainText('non-negotiable')
    await expect(body).toContainText('tag the requirement with checkReq')
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

    // …AND THE ESCAPE FROM A WRONG PICTURE (the human, 2026-08-31: "let user know if the schematic
    // is not what they want"; renamed with the picture itself on 2026-09-03). The ⋯ menu is what a
    // reader does about a picture that is not their app — one more ready prompt, carrying the screen,
    // the requirement, THE PROVENANCE THE READER WAS JUST SHOWN, and the kg-e2e way to make the
    // capture right (ring the values with proveVisible, re-harvest, read the gate). It is a prompt
    // like every other item here: the board still writes nothing.
    await rmenu.locator('.fmenubtn').click()
    const rSchem = rmenu.locator('.fmenupop [data-prompt="schemwrong"]')
    await expect(rSchem).toHaveCount(1)
    await expect(rSchem).toContainText(/expected picture/i)
    await rSchem.click()
    await expect(sheet).toHaveClass(/\bon\b/)
    const said = (await body.textContent()) || ''
    expect(said, 'the prompt names the screen and the requirement').toContain('board:' + reqId)
    expect(said, '…the files the fix actually lives in').toContain('spec/board/steps.ts')
    // the prompt carries the picture's PROVENANCE — the same schemProv() text the cell used to
    // caption. The per-cell caption is gone (the human, 2026-09-02: "avoid useless things"), so this
    // is the one place the provenance is said — and it must still be said, in schemProv's words.
    await expect(ov.locator('.fread .fstory .sbprov'), 'no per-cell caption on a replica').toHaveCount(0)
    expect(said, '…what the picture is today').toMatch(/the app’s own markup|the sentence, not the app|nothing harvested/)
    expect(said, '…and the kg-e2e way to make the capture right').toContain('proveVisible')
    expect(said, '…and the gate that says what it is missing').toContain('proof mirror')
    expect(said, 'never by hand — an invented picture beside a photograph is the lie the board forbids')
      .toMatch(/never hand-write/i)
    expect(await body.evaluate(el => el.tagName), 'still a read-only prompt, not an editor').toBe('PRE')
    await hudCheck('the ⋯ menu answers a wrong Expected picture', 'a ready prompt',
      (await sheet.getAttribute('class') || '').includes('on') ? 'a ready prompt' : 'nothing')
    await sheet.locator('[data-promptclose]').click()
    await expect(sheet).not.toHaveClass(/\bon\b/)

    // THE TEST ⋯ — folded into the proof header's EXISTING menu, below Run-in-background/Logs/Steps,
    // separated by a divider: add · edit · remove a test
    // — and since 2026-09-02 that menu IS the title row's one ⋯: run/log items, then the test's
    // add · edit · remove, then the requirement's own actions, two dividers between the three groups
    const menu = ov.locator('.fread > .frmeta .fmenu')
    await menu.locator('.fmenubtn').click()
    const pop = menu.locator('.fmenupop')
    await expect(pop.locator('.fmdiv')).toHaveCount(2)
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
    // THE FACT, CLAIMED (phase 6 fix round 2): what opens is a READY prompt — the exact file it is
    // about is in it — and it is read-only prose, so the board wrote nothing. The value is the file
    // path this composer names, which a prompt built for another screen could not carry.
    await proveVisible(pre, 'spec/board/test.spec.ts',
      'A ready prompt, naming the exact file — and the board wrote none of it',
      { soft: true, match: (shown: string) => shown.includes('spec/board/test.spec.ts') })
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
  // ONE BLOCK, ONE BEAT (phase 6 fix round 2, the controller's I1). R17 has ONE beat and this test
  // made four checkReq calls for it — the card, the List, the pager and the no-families screen — so
  // the cursor clamped all four onto beat 1 and three of them harvested pictures of a leg they were
  // not the beat of. They are four scenes of one sentence, so they are one block; each keeps its own
  // brace scope, so every `const` below is exactly as it was. No assertion changed.
  await checkReq('R17', async () => {
    {
    const heads = card.locator('.rl .fam')
    await expect(heads.first()).toBeVisible()
    const shown = await heads.allTextContents()
    expect(shown.map(s => s.trim()), 'card families read in prd order').toEqual(prd.fams.slice(0, shown.length).map(f => f.heading))
    // the fact, CLAIMED on the card (the authored-intent lint, phase 6): the first family names
    // itself exactly as the prd writes it — the expected value is read from spec/board/prd.md, so
    // this is the FILE against the screen, never the screen against itself
    await proveVisible(heads.first(), prd.fams[0].heading,
      'The family every requirement under it sits in', { soft: true })
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
    }

  // the LIST view: the same header rows over their rows
    {
    await page.goto('/#/board/grid')
    const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
    await expect(dt.locator('.gridview')).toBeVisible()
    await expect(dt.locator('.gridview .lst-fam')).toHaveText(prd.fams.map(f => f.heading))
    // …the SAME family, over the List's own rows — the second surface this Then names
    await proveVisible(dt.locator('.gridview .lst-fam').first(), prd.fams[0].heading,
      'The same family header, over the List rows', { soft: true })
    const seq = await dt.locator('.gridview > .lst-fam, .gridview > .lst-card').evaluateAll(els => els.map(e =>
      e.classList.contains('lst-fam') ? 'fam' : (e.getAttribute('data-r') || '')))
    const want: string[] = [...prd.loose]
    for (const f of prd.fams) { want.push('fam'); want.push(...f.ids) }
    expect(seq).toEqual(want)
    }

  // FOCUS: the counter reads `<family> · n of N`, and THE PAGER IS THE MAP (the human, 2026-08-23 —
  // the top block and the number list navigated the same requirements twice): one group per family
  // carrying its `<n> · <name>` label, a thin separator between groups, one marked dot per
  // requirement in prd order, the current one ringed, the title one hover (or keyboard focus) away
    {
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
    // …and the JUMP-MAP names each family, again from the prd's own words
    await proveVisible(bar.locator('.ffam .ffl').first(), prd.fams[0].n + ' · ' + prd.fams[0].name,
      'The jump-map, naming the family it groups', { soft: true })
    await expect(bar.locator('.fdots .fdotfam'), 'one separator between each pair of families').toHaveCount(prd.fams.length - 1 + (prd.loose.length ? 1 : 0))
    // every requirement is a dot, in prd order, under its family — no window, no ellipsis
    const dots = bar.locator('.fdot')
    await expect(dots).toHaveCount(prd.ids.length)
    expect(await dots.evaluateAll(els => els.map(e => e.getAttribute('data-r')))).toEqual(prd.ids)
    // each dot's VISIBLE text is the requirement's own id now (the human, 2026-08-26): a sequential
    // 1..N position read as an id and clashed with the R-id it sat beside (pager said "15", header
    // said "R10"). The dot, the header, the prd (## R10) and the tag (checkReq('R10')) now agree.
    expect(await dots.allInnerTexts().then(t => t.map(x => x.replace(/\s+/g, '')))).toEqual(prd.ids)
    // …IN THE PRD'S ORDER: the first dot is the prd's first requirement, read out of the file
    await proveVisible(dots.first(), prd.ids[0], 'The first dot — the prd\'s own order', { soft: true })
    // …and "each dot wearing its own derived state as a HUE" is a colour, measured above against the
    // design tokens (DOT_BORDER / DOT_FILL). A hue is not a value any element carries as text, so
    // there is nothing here for a claim to read — the dot's own text is its id, claimed on the line
    // above. (Every dot also carries its state as data-status, asserted against the baked row.)
    intentGap('a dot wears its derived state as a HUE — a colour measured against the design tokens above; no element on the screen carries it as a value a claim could read')
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
    // a dot click jumps to that requirement; ‹ › and PgUp/PgDn page one at a time (← → walk the beat
    // now — the human, 2026-09-02)
    await d1.click()
    await expect(dt.locator('.focusov .fid')).toHaveText(firstId)
    await expect(bar.locator('.fdot.cur')).toHaveAttribute('data-r', firstId)
    await bar.locator('.fnav.next').click()
    await expect(dt.locator('.focusov .fid')).toHaveText(prd.ids[1])
    await page.keyboard.press('PageUp')
    await expect(dt.locator('.focusov .fid')).toHaveText(firstId)
    // …and the bar is the MAP and nothing else: the keyboard legend that used to sit at its right
    // is gone (rule 4 — the human, 2026-09-02: "remove the short cut key hint in this page, only
    // mention in the setting page"; the guide lists the keys once, proven in the R20 test)
    await expect(bar.locator('.fpk'), 'no keyboard legend on the jump-map bar').toHaveCount(0)
    // the old top block is GONE — the pager is the only map (Focus and List alike)
    await expect(page.locator('.reqmap, .tocg, .tocit')).toHaveCount(0)
    await page.goto('/#/board/grid')
    await expect(dt.locator('.gridview')).toBeVisible()
    await expect(page.locator('.reqmap')).toHaveCount(0)
    }

  // a screen with NO families renders exactly as today — no header element anywhere, no map,
  // the counter a bare `n of N`
    {
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
    }
  })
})
