import { test, expect, checkReq, coverReqs, hudCheck, flowStep } from '../_base'

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
  await checkReq('R1', async () => {
    const cards = page.locator('#home .card')
    await expect(cards).toHaveCount(4)                       // one per screen, not one per requirement
    const first = cards.first()
    await expect(first.locator('.nm')).not.toBeEmpty()      // the screen's name
    await expect(first.locator('.rl li').first()).toBeVisible() // requirement TITLES on the card
    await expect(first.locator('.cshot')).toHaveCount(1)    // the latest recording's cover frame
    // the old PRD/draft/screen/E2E column strip is gone — the card is titles + cover, nothing else
    await expect(page.locator('.cell[data-col], .colhs')).toHaveCount(0)
  })
  // the home cover falls back to a still when a run has no video (R10) — keep board's own cover fresh
  await page.screenshot({ path: 'spec/board/screen.png', fullPage: false })
})

test('A requirement and its proof read side by side, each scrolling on its own', async ({ page }) => {
  await coverReqs('R2')
  await openDetail(page)
  await checkReq('R2', async () => {
    const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
    // The two regions are the FOCUS reader's containers now (R2, reworked 2026-08-18): the reading
    // on the left, the covering test's proof on the right — each with its OWN overflow, so scrolling
    // the proof never moves the reading…
    const ov = dt.locator('.focusov')
    await expect(ov.locator('.fpage')).toHaveCount(1)
    await expect(ov.locator('.fread')).toBeVisible()
    await expect(ov.locator('.feval')).toBeVisible()
    for (const sel of ['.fread', '.feval']) {
      const oflow = await ov.locator(sel).evaluate(el => getComputedStyle(el).overflowY)
      expect(['auto', 'scroll']).toContain(oflow)
    }
    await ov.locator('.feval').evaluate(el => { el.scrollTop = 60 })
    expect(await ov.locator('.fread').evaluate(el => el.scrollTop)).toBe(0)
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
  })
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

    // VISIBLY, a requirement reads as its title until opened: the Grid row leads with the title and
    // does NOT carry the long description; opening the row reveals the full FORMATTED markdown in
    // Focus — real paragraphs and lists, not raw text.
    const bodyFrag = (await req.locator('.body p').count())
      ? (((await req.locator('.body p').first().textContent()) || '').trim().slice(0, 40)) : ''
    const rid = await req.getAttribute('data-r')
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    const row = dt.locator(`.gridview .grrow[data-r="${rid}"]`)
    await expect(row.locator('.grt')).toBeVisible()
    if (bodyFrag) expect(await row.textContent()).not.toContain(bodyFrag)   // the title, not the description
    await row.click()
    const ov = dt.locator('.focusov')
    await expect(ov.locator('.fread .fttl')).not.toBeEmpty()
    await expect(ov.locator('.fread .fbody p, .fread .fbody ul').first()).toBeVisible()
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
    // the reader's ⋯ menu carries the covering test's own wired Steps button (R13). Wait for the
    // relocated recording first — it only appears once the fold has reopened the reader with the
    // stubbed record, so it marks the reader as settled.
    const ov = dt.locator('.focusov')
    await expect(ov.locator('.frecwrap .rec')).toBeVisible()
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
    // Play the reader's relocated recording — the same wired .rec node, moved in (R13).
    await ov.locator('.frecwrap .rec').click()
    const fit = await ov.locator('.frecwrap .rec video').evaluate(el => getComputedStyle(el).objectFit)
    expect(fit).toBe('contain')

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
    // relocates the now-playable recording below the strip
    const rec = dt.locator('.focusov .frecwrap .rec')
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

    // The chip's word is the FOUR-word vocabulary now (board R4, amended 2026-08-17, the human's
    // decision): Passed / Failed / Untested / Not reached — deriveReqStatus's fail-wins fold
    // (tools/coverage.mjs), never the old binary "proven"/"unproven" wording, and never typed in.
    const chipTitles = await page.locator('.dt[data-screen] .reqpane .req .h > .chip')
      .evaluateAll(els => els.map(el => el.getAttribute('title') || ''))
    expect(chipTitles.length).toBeGreaterThan(0)
    for (const t of chipTitles) expect(t).toMatch(/^(Passed|Failed|Untested|Not reached)\b/)

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
    const surfaces = await page.locator('.dt[data-screen]').evaluateAll(dts => dts.map(dt => {
      const scr = dt.getAttribute('data-screen')
      const rows = [...dt.querySelectorAll('.reqpane .req')]
      const tagged = new Set([...dt.querySelectorAll('.testpane .tags .tag[data-r]')]
        .map(el => el.getAttribute('data-r')))
      const card = document.querySelector('#home .card[data-screen="' + scr + '"] .pcount')
      return {
        screen: scr,
        card: (card && card.textContent || '').trim(),
        proven: rows.filter(r => r.getAttribute('data-state') === 'proven').length,
        // a proven requirement its own screen's tests never tag. Coverage rides on the tag (R5), and
        // this lookup is PER-PANE, so a cross-screen qualified tag would break it BOTH ways and both
        // must be fixed together: the owning screen sees a proven requirement with no local tag and
        // fails here, while the tagging screen — testRow strips the qualifier, rendering
        // `asset-plan:R5` as a bare data-r="R5" (build-board.mjs ~146) — would falsely satisfy this
        // check for its OWN R5. Widen to qualified ids on both sides the day one is introduced.
        untaggedProven: rows
          .filter(r => r.getAttribute('data-state') === 'proven' && !tagged.has(r.getAttribute('data-r')))
          .map(r => r.getAttribute('data-r'))
      }
    }))
    expect(surfaces.length).toBeGreaterThan(0)
    for (const s of surfaces) {
      expect(s.card, s.screen + ' — the card must state its proven count').toMatch(/^\d+ \/ \d+ proven$/)
      expect(Number(s.card.split(' ')[0]), s.screen + ' — card count vs detail rows').toBe(s.proven)
      expect(s.untaggedProven, s.screen + ' — proven without a test tagging it').toEqual([])
    }
    const unproven = page.locator('#reqpane .req[data-state="unproven"]').first()
    if (await unproven.count()) {
      // the honest no-coverage line rides the baked row's body (read hidden — the same honesty
      // shows on the visible surfaces: Grid's proof cell and Focus's "The proof")
      await expect(unproven.locator('.covers .nocov')).toContainText('no test asserts this yet')
    }
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
    // …and the board SERVES the many-to-many wire: open that requirement in Focus — the proof line
    // names this very test, resolved BY TAG (break the tag lookup and this fails)
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator(`.gridview .grrow[data-r="${rid}"]`).click()
    const ov = dt.locator('.focusov')
    await expect(ov.locator('.fread .frmeta .fid')).toHaveText(rid!)
    await expect(ov.locator('.feval .fpby')).toContainText(flow)
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
    // proven requirement. Same per-pane / stripped-qualifier caveat as R4's check applies here.
    const screens = await page.locator('.dt[data-screen]').evaluateAll(dts => dts.map(dt => {
      const tagged = new Set([...dt.querySelectorAll('.testpane .tags .tag[data-r]')]
        .map(el => el.getAttribute('data-r')))
      const rows = [...dt.querySelectorAll('.reqpane .req')]
      return {
        screen: dt.getAttribute('data-screen'),
        hasTests: dt.querySelectorAll('.testpane .test').length > 0,
        untagged: rows.filter(r => !tagged.has(r.getAttribute('data-r'))).length,
        untaggedGreen: rows
          .filter(r => !tagged.has(r.getAttribute('data-r')) && r.getAttribute('data-state') === 'proven')
          .map(r => r.getAttribute('data-r'))
      }
    }))
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

test('The detail offers a Focus / Grid / Flow toggle — Focus reads one requirement per page in two containers', async ({ page }) => {
  await coverReqs('R13')
  // FOCUS is the default view — the reader opens straight away
  await page.goto('/#/board')
  await page.waitForSelector('.dt[data-screen="board"]:not([hidden]) .focusov')
  await checkReq('R13', async () => {
    const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
    const reqCount = await dt.locator('.reqpane .req').count()
    // the header toggle offers EXACTLY Focus / Grid / Flow (Columns retired as a view 2026-08-18 —
    // its baked rows stay as the hidden shared source, asserted below), and Focus is active on open
    // — a one-requirement reader laid out as TWO containers
    const ov = dt.locator('.focusov')
    await expect(ov).toBeVisible()
    await expect(dt.locator('.viewseg .vseg')).toHaveCount(3)
    await expect(dt.locator('.viewseg .vseg')).toHaveText(['Focus', 'Grid', 'Flow'])
    await expect(dt.locator('.viewseg .vseg[data-view="columns"]')).toHaveCount(0)
    await expect(dt.locator('.viewseg .vseg[data-view="focus"]')).toHaveClass(/\bon\b/)
    await expect(dt.locator('.cols')).toBeHidden()
    await expect(ov.locator('.fpage')).toHaveCount(1)
    // its id, state, title and full body on the LEFT container
    await expect(ov.locator('.fread .frmeta .fid')).not.toBeEmpty()
    // The Focus reader's chip reads the SAME four-word vocabulary as Columns/Grid (board R4, amended
    // 2026-08-17) — no separate binary proven/unproven surface left anywhere in the detail.
    await expect(ov.locator('.fread .frmeta .fchip')).toHaveClass(/passed|failed|not-reached|untested/)
    await expect(ov.locator('.fread .fttl')).not.toBeEmpty()
    await expect(ov.locator('.fread .fbody p, .fread .fbody ul').first()).toBeVisible()
    // THE PROOF on the RIGHT container — the primary covering test's OWN evidence, MOVED in and wired
    // (no player rebuilt, R13). The wired controls are relocated into the proof header (#4): Run is
    // always shown, Run in background / Logs / Steps fold behind a ⋯ menu — still the real nodes, so
    // the frame strip and the machinery are all here. The LEFT container carries the steps as a clone.
    // (Robust to the dogfood lag — asserts the machinery, not a specific green state.)
    await expect(ov.locator('.feval .fphead')).toBeVisible()
    await expect(ov.locator('.feval .fpby')).toBeVisible()
    await expect(ov.locator('.feval .fev .test.infocus')).toHaveCount(1)
    await expect(ov.locator('.feval .fpacts > .runone')).toBeVisible()        // Run always shown in the header
    await expect(ov.locator('.feval .fpacts .fmenu .fmenubtn')).toHaveCount(1) // the rest behind ⋯
    await expect(ov.locator('.feval .fmenupop [data-steps]')).toHaveCount(1)
    await expect(ov.locator('.feval .fmenupop [data-log]')).toHaveCount(1)
    // the ⋯ menu's Logs and Steps must actually OPEN their windows from here — the buttons are moved
    // out of their test row, so the handlers have to resolve the record off the reader's moved node
    // (this is the whole point of relocating them; a broken resolver leaves the menu dead)
    await ov.locator('.feval .fmenubtn').click()
    await ov.locator('.feval .fmenupop [data-log]').click()
    await expect(page.locator('#logsheet')).toHaveClass(/\bon\b/)
    await page.locator('#logsheet [data-logclose]').click()
    await ov.locator('.feval .fmenubtn').click()
    await ov.locator('.feval .fmenupop [data-steps]').click()
    await expect(page.locator('#stepsheet')).toHaveClass(/\bon\b/)
    await page.locator('#stepsheet [data-stepsclose]').click()
    await expect(ov.locator('.fread .fsteps .fstepclone .beat').first()).toBeVisible()
    // there is NO in-reader view-escape button (.fcols/.fopen never came back) — the header toggle
    // is the only view switch
    await expect(ov.locator('.fcols, .fopen')).toHaveCount(0)

    // a WINDOWED pager (board R14): with more than ten requirements the window slides around the
    // current one, but the FIRST and LAST page always anchor the ends so you can jump to req 1 or the
    // last from anywhere, with an ellipsis marking each gap. (Was a plain ten-cap sliding window that
    // hid both ends.) The pager rides the detail's footer bar (dt), not the reader (ov).
    const dots = dt.locator('.dtfoot .fdots .fdot')
    expect(await dots.count()).toBeLessThan(reqCount)                              // windowed, not all reqCount
    await expect(dt.locator('.dtfoot .fdot[title^="R1 "]')).toHaveCount(1)         // first page always reachable
    await expect(dt.locator(`.dtfoot .fdot[title^="R${reqCount} "]`)).toHaveCount(1) // last page always reachable
    await expect(dt.locator('.dtfoot .fdotgap')).not.toHaveCount(0)                // an ellipsis marks the gap
    const firstId = (await ov.locator('.fread .frmeta .fid').textContent())!.trim()
    await dt.locator('.dtfoot .fnav.next').click()
    await expect(ov.locator('.fread .frmeta .fid')).not.toHaveText(firstId)

    // LEAVING FOCUS RESTORES THE BORROWED NODE: while the reader is open it holds one test's row;
    // switching views puts that node back WHOLE into the (hidden) source pane
    const inPane = await dt.locator('.testpane .test').count()

    // GRID → the behavior grid (Grid replaced the compact List, 2026-08-18): one row per requirement —
    // state · id · title · the Given/When/Then shape it leads with · its proof — and a row opens it
    // straight into Focus. Every row carries a proof cell (the covering test + verdict, or the honest
    // "no test asserts this yet" note); the G/W/T cell is proven on a fixture screen in spec/_modes.
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await expect(dt.locator('.focusov')).toHaveCount(0)
    await expect(dt.locator('.testpane .test')).toHaveCount(inPane + 1)   // the borrowed row came home
    const grid = dt.locator('.gridview')
    await expect(grid).toBeVisible()
    await expect(dt.locator('.cols')).toBeHidden()
    await expect(grid.locator('.grrow')).toHaveCount(reqCount)
    await expect(grid.locator('.grrow .grproof')).toHaveCount(reqCount)
    await grid.locator('.grrow').first().click()
    await expect(dt.locator('.focusov')).toBeVisible()
    await expect(dt.locator('.viewseg .vseg[data-view="focus"]')).toHaveClass(/\bon\b/)

    // The proof line is COVERAGE-honest and reads the SAME word as the chip (board R4, amended
    // 2026-08-17; fix round 2, 2026-08-18): "proved by <flow>" only for a Passed requirement,
    // "covered by <flow> … — not passed yet" for one that is covered but not Passed — the two lines
    // must never disagree about the same requirement. Exercised on TWO real .req nodes from this
    // screen's own tree, with data-status FORCED client-side to known values on each — not "whichever
    // status the live board happens to carry today". Editing THIS test file makes the board screen's
    // OWN proofs go stale until the suite folds a fresh run (the one-run dogfooding lag CLAUDE.md
    // documents), so asserting against today's live status here would make the test hang on exactly
    // that lag rather than test the render logic; forcing the input is the same technique R10's
    // stubbed-record tests use to drive the real client pipeline deterministically. Both requirements
    // keep their REAL coverage tags (untouched), so `.fpby` still renders off a genuine covering test —
    // only the status read off `.req` is substituted. Both assertions below are the kind that would
    // fail if buildFocus rendered the wrong line (proved red against a deliberately-broken client.js
    // while writing this fix; see task-5-report.md).
    const [passedId, otherId] = await dt.locator('.reqpane .req').evaluateAll(
      els => els.slice(0, 2).map(el => el.getAttribute('data-r')))
    expect(otherId, 'R13 needs at least two requirements to exercise both branches').toBeTruthy()
    await dt.locator(`.reqpane .req[data-r="${passedId}"]`).evaluate(el => el.setAttribute('data-status', 'passed'))
    await dt.locator(`.reqpane .req[data-r="${otherId}"]`).evaluate(el => el.setAttribute('data-status', 'failed'))

    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator(`.gridview .grrow[data-r="${passedId}"]`).click()
    await expect(dt.locator('.focusov .fread .frmeta .fid')).toHaveText(passedId!)
    await expect(dt.locator('.focusov .fread .frmeta .fchip')).toHaveClass(/\bpassed\b/)
    await expect(dt.locator('.focusov .feval .fpby')).toContainText('proved by')

    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await dt.locator(`.gridview .grrow[data-r="${otherId}"]`).click()
    await expect(dt.locator('.focusov .fread .frmeta .fid')).toHaveText(otherId!)
    await expect(dt.locator('.focusov .fread .frmeta .fchip')).toHaveClass(/\bfailed\b/)
    await expect(dt.locator('.focusov .feval .fpby')).toContainText('covered by')
    await expect(dt.locator('.focusov .feval .fpby')).not.toContainText('proved by')
  })
})

// Board R13 — the FLOW view, proven against a DETERMINISTIC record (the R10 stub pattern): chapters
// are derived SERVER-side (tools/flow.mjs) and ride the folded record like the proof frames do, so
// the client is driven here with a fabricated record whose flow crosses screens and breaks mid-way.
// The honesty guarantee is the point: a failing chapter stops the playback, and everything after it
// — recorded green or never reached at all — reads NOT-REACHED, so a Flow view can never present a
// broken run as fully green (rule 3).
test('Flow plays a run as chapters — a failing chapter stops it and the rest reads not-reached', async ({ page }) => {
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
    // reached — dispatch (has a card) and howitworks (a hash route with NO card; must never crash)
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
    const caseRec = {
      shots: [], video: 'spec/_runs/rfl/a.webm', steps, log: 'x', kind: 'flow', chapters,
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

    // (2) the toggle's third view — Flow — shows the chaptered player; no reader, no columns
    await dt.locator('.viewseg .vseg[data-view="flow"]').click()
    await expect(dt.locator('.viewseg .vseg[data-view="flow"]')).toHaveClass(/\bon\b/)
    await expect(dt.locator('.focusov')).toHaveCount(0)
    await expect(dt.locator('.cols')).toBeHidden()
    const fv = dt.locator('.flowview')
    await expect(fv).toBeVisible()

    // (3) the first test's block: ONE recording, PAUSED at start (manual advance), read as chapters
    const fl = fv.locator('.fltest').first()
    await expect(fl.locator('.flttl')).toHaveText(R1_TITLE)
    await expect(fl.locator('.flkind')).toHaveText('flow')
    await expect(fl.locator('.flplayer video')).toHaveCount(1)      // ONE video, seeked — never cut
    await expect(fl.locator('.flplayer video')).toHaveJSProperty('paused', true)
    const chaps = fl.locator('.flchap')
    await expect(chaps).toHaveCount(5)   // 3 reached + dispatch + howitworks, declared-never-reached
    await expect(chaps.nth(0).locator('.flstage')).toHaveText('Open the board detail')
    await expect(chaps.nth(1).locator('.flstage')).toHaveText('Cross to conflicts — the count agrees')
    await expect(chaps.nth(0)).toHaveClass(/\bp\b/)
    await expect(chaps.nth(0).locator('.flmk')).toHaveText('✓')
    await expect(chaps.nth(0).locator('.flreq[data-r="R1"]')).toHaveCount(1)

    // (4) the FAILING chapter is marked and NAMES its failing beat…
    await expect(chaps.nth(1)).toHaveClass(/\bf\b/)
    await expect(chaps.nth(1).locator('.flmk')).toHaveText('✗')
    await expect(chaps.nth(1)).toContainText('got 1 · expected 2')
    // …and RULE 3: the chapter AFTER it was recorded GREEN (ok:true in the stub) but follows a
    // failure, so it must read NOT-REACHED — this fails if the player shows it green
    await expect(chaps.nth(2)).toHaveClass(/\bnr\b/)
    await expect(chaps.nth(2)).not.toHaveClass(/\bp\b/)
    await expect(chaps.nth(2).locator('.flmk')).toHaveText('◌')
    // the declared coverReqs screens the flow never reached trail as not-reached chapters —
    // dispatch's chip is a real link (it has a card); howitworks renders its id INERTLY, no crash
    await expect(chaps.nth(3)).toHaveClass(/\bnr\b/)
    await expect(chaps.nth(3).locator('.flreq[data-r="R7"]')).toHaveCount(1)
    await expect(chaps.nth(4)).toHaveClass(/\bnr\b/)
    await expect(chaps.nth(4).locator('.flreq.inert')).toHaveCount(1)

    // (5) a test with NO recorded run shows the honest placeholder — never fake chapters
    await expect(fv.locator('.fltest .flnone').first()).toContainText('Not run yet')

    // (6) a requirement chip opens that requirement in FOCUS
    await chaps.nth(0).locator('.flreq[data-r="R1"]').click()
    await expect(dt.locator('.focusov .fread .frmeta .fid')).toHaveText('R1')
    await expect(dt.locator('.viewseg .vseg[data-view="focus"]')).toHaveClass(/\bon\b/)
  })
})

test('The proof is scannable as frames, not only as video — a strip of stills per checked value', async ({ page }) => {
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
      { img: 'spec/board/screen.png', ok: false, cap: 'third value — got 5 · expected 4', req: 'R1' }
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

    // (1) IN THE FOCUS READER — the reload reopened the detail on the Focus DEFAULT, R1's page,
    // whose RIGHT container EMBEDS the primary covering test (R13), so the strip rides along: a
    // scannable strip of stills, one per checked value, each captioned with its got-vs-expected;
    // the failing value is marked red. (The frame count also waits out loadRuns' close-fold-reopen.)
    const ov = dt.locator('.focusov')
    const fr = ov.locator('.feval .fev .pfstrip .pframe')
    await expect(fr).toHaveCount(3)
    await expect(fr.nth(0)).toContainText('got 7 · expected 7')
    await expect(fr.nth(2)).toContainText('got 5 · expected 4')
    await expect(fr.nth(0)).not.toHaveClass(/\bbad\b/)
    await expect(fr.nth(2)).toHaveClass(/\bbad\b/)               // the failed value reads red
    await expect(fr.nth(0).locator('img')).toHaveCount(1)        // frames OF the recording, as images
    // a still is a thumbnail; a click opens it full in the existing lightbox (verify without pixels)
    await fr.nth(2).locator('img').click()
    await expect(page.locator('#lb')).toBeVisible()
    await page.locator('#lbclose').click()
    // the strip carries no label (#5 — the stills speak for themselves) and the moved test's own
    // header is folded away (the proof line replaces it)
    await expect(ov.locator('.feval .fev .flabel')).toHaveCount(0)
    await expect(ov.locator('.feval .fev .test.infocus > .th')).toBeHidden()

    // (2) AND THE STRIP IS THE TEST'S OWN: leave Focus — the borrowed node returns whole to the
    // hidden source pane, frames intact (count/class reads work on hidden rows)
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    const tst = dt.locator('.testpane .test', { hasText: R1_TITLE }).first()
    await expect(tst.locator('.pfstrip .pframe')).toHaveCount(3)
    await expect(tst.locator('.pfstrip .pframe').nth(2)).toHaveClass(/\bbad\b/)
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
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  const before = await dt.locator('.reqpane .req[data-r="R1"]').getAttribute('data-state')
  const flipped = before === 'proven' ? 'unproven' : 'proven'
  // serve a board.html where R1's derived state has flipped — exactly what a run's rebuild would change
  await page.route('**/board.html', async route => {
    const real = await (await route.fetch()).text()
    await route.fulfill({ contentType: 'text/html',
      body: real.split('data-r="R1" data-state="' + before + '"').join('data-r="R1" data-state="' + flipped + '"') })
  })
  const url = page.url()
  await checkReq('dispatch:R7', async () => {
    await page.evaluate(() => (window as any).__refreshDerived())      // the SSE run-done/change path calls this
    await expect(dt.locator('.reqpane .req[data-r="R1"]')).toHaveAttribute('data-state', flipped)  // synced in place
    expect(page.url(), 'no reload — the open panel would survive').toBe(url)
  })
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
  await checkReq('R9', async () => {
    await expect(page.locator('.grp')).toHaveCount(3)        // Core, Running, Setup
    await expect(page.locator('.grp .grph h2').first()).toHaveText('Core')
    // search matches requirement TEXT, not just the name — 'canon' appears only in the board's own reqs
    await page.locator('#q').fill('canon')
    await expect(page.locator('#home .card:not(.gone)')).toHaveCount(1)
    // a group with nothing matching hides itself rather than sitting empty
    await expect(page.locator('.grp:not(.gone)')).toHaveCount(1)
    await page.locator('#qx').click()
    await expect(page.locator('#home .card:not(.gone)')).toHaveCount(4)
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
