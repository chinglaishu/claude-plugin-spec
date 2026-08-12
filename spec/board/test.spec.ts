import { test, expect, checkReq, coverReqs, hudCheck, flowStep } from '../_base'

// The board proves ITSELF — its ten requirements (R1–R10) are the rows on its own board, and each
// test here tags the requirement it covers and asserts something that would fail if that requirement
// were deleted. The redesigned board is two ends only: the requirements (the source of truth) and
// the tests that prove them, with drift computed and one human gate. A test that asserted the page
// "loaded" would pass with every requirement removed — a smoke alarm with the battery out.

const openDetail = async (page) => {
  await page.goto('/#/board')
  await page.waitForSelector('.dt[data-screen="board"]:not([hidden]) .cols')
}

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

test('The detail opens as two independent columns', async ({ page }) => {
  await coverReqs('R2')
  await openDetail(page)
  await checkReq('R2', async () => {
    const panes = page.locator('.dt[data-screen="board"]:not([hidden]) .cols .pane')
    await expect(panes).toHaveCount(2)
    await expect(page.locator('#reqpane h2')).toContainText('Requirements')
    await expect(page.locator('#testpane h2')).toContainText('tests')
    // each pane scrolls INDEPENDENTLY — its own overflow, a bounded height, so scrolling one never
    // moves the other and neither scrolls the page
    for (const id of ['#reqpane', '#testpane']) {
      const oflow = await page.locator(id).evaluate(el => getComputedStyle(el).overflowY)
      expect(['auto', 'scroll']).toContain(oflow)
      const bounded = await page.locator(id).evaluate(el => el.clientHeight < el.scrollHeight + 1 && getComputedStyle(el).height !== 'auto')
      expect(bounded).toBeTruthy()
    }
  })
})

test('A requirement expands; a test leads with its flow name', async ({ page }) => {
  await coverReqs('R3')
  await openDetail(page)
  await checkReq('R3', async () => {
    const req = page.locator('#reqpane .req').first()
    const body = req.locator('.body')
    await expect(req.locator('.rt')).not.toBeEmpty()        // the title always shows
    await expect(body).toBeHidden()                          // the long description is collapsed
    await req.locator('.h').click()
    await expect(body).toBeVisible()                         // one click reveals the full markdown
    await expect(body.locator('p, ul').first()).toBeVisible()
    // a test leads with a PROMINENT flow title and carries coverage tags — it does not just repeat a
    // requirement's title
    const t = page.locator('#testpane .test').first()
    await expect(t.locator('.ttl')).not.toBeEmpty()
    const testTitle = (await t.locator('.ttl').textContent())?.trim()
    const reqTitles = await page.locator('#reqpane .req .rt').allTextContents()
    expect(reqTitles.map(s => s.trim())).not.toContain(testTitle)

    // the READING HIERARCHY: never bare title rows. Each pane's header wears a quiet purpose hint;
    // a requirement row shows a one-line excerpt of its body under the title — and the excerpt
    // yields to the full text once the row is open, never repeating it.
    await expect(page.locator('#reqpane h2 .s')).not.toBeEmpty()
    await expect(page.locator('#testpane h2 .s')).not.toBeEmpty()
    const second = page.locator('#reqpane .req').nth(1)
    await expect(second.locator('.rhint')).not.toBeEmpty()
    await expect(second.locator('.rhint')).toBeVisible()
    await expect(req.locator('.rhint')).toBeHidden()             // this row is open — the body follows
    // a test row carries a meta-line hook under its title (loadRuns fills it from the case's record)
    await expect(t.locator('.tmeta')).toBeAttached()
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
  'Open the board detail — the two columns are there',
  'Announce a golden value on the narration bar',
  'Confirm the tests column is present'
]

test('Steps read from the definition; a run overlays passed/failed/not-reached, and the video explains itself', async ({ page }) => {
  await coverReqs('R10')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  const t0 = (await page.locator('#testpane .test .ttl').nth(0).textContent())!.trim()   // proves R1
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
    await page.route('**/api/runs', r => r.fulfill({ json: { watch: false, running: false, runs: [] } }))
    await page.reload()
    await page.waitForSelector('.dt[data-screen="board"]:not([hidden]) .cols')
    const story = dt.locator('.test', { hasText: STORY_TITLE }).first()
    await story.locator('.th').click()
    const srows = story.locator('.tststeps .beat')
    await expect(srows).toHaveCount(3)                              // its three flowStep sentences
    await expect(srows.nth(0)).toContainText(STORY[0])
    await expect(srows.nth(0).locator('.bnum')).toHaveText('1')
    await expect(srows).toHaveClass([/pending/, /pending/, /pending/])  // none green, none red
    // a checkReq-only test plans one step per requirement, by TITLE, also before running
    const p0 = dt.locator('.test', { hasText: t0 }).first()
    await p0.locator('.th').click()
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
      { label: 'Check the tests column is present', cat: 'expect', depth: 1, ok: false, t: 1500, d: 5 }
    ]
    await page.route('**/api/runs', r => r.fulfill({ json: {
      watch: false, running: false,
      runs: [{ screen: 'board', runId: 'rt', hasLog: false, at: '2026-08-03T00:00:00.000Z', ms: 6000,
        ok: false, total: 1, failed: 1, shotsByTest: { [STORY_TITLE]: {
          shots: [], video: 'spec/_runs/rt/a.webm', steps: rec, log: 'x',
          at: '2026-08-03T00:00:00.000Z', ms: 6000, ok: false, commit: 'abc1234'
        } } }]
    } }))
    await page.reload()
    await page.waitForSelector('.dt[data-screen="board"]:not([hidden]) .cols')
    const s2 = dt.locator('.test', { hasText: STORY_TITLE }).first()
    await s2.locator('.th').click()
    const rows = s2.locator('.tststeps .beat')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toHaveClass(/\bp\b/)                  // step 1 passed
    await expect(rows.nth(1)).toHaveClass(/\bf\b/)                  // step 2 failed — and shown
    await expect(rows.nth(2)).toHaveClass(/\bf\b/)                  // step 3 ALSO failed — not hidden
    // the meta line SHOUTS the count, not just the first failure
    await expect(s2.locator('.tmeta')).toContainText('2 steps failed')
    // both failed steps arrive OPEN to their failing value; the passing step's detail expands on click
    await expect(rows.nth(1).locator('.bdet .bnote')).toContainText('got 2338064 · expected 2396129')
    await expect(rows.nth(2).locator('.bdet .braw')).toContainText('tests column')
    await rows.nth(0).locator('.bh').click()
    await expect(rows.nth(0).locator('.bdet .bnote')).toContainText('Net Rent 40,000 → 60,000')
    await expect(rows.nth(0).locator('.bdet .bprove')).toContainText(await titleOf('R10'))

    // the complete raw record opens in the Steps WINDOW — a floating card, not a scrim
    await s2.locator('[data-steps]').click()
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
    // and an object-fit that fills-and-crops (cover) sliced exactly that edge off in display
    await s2.locator('.rec').click()
    const fit = await s2.locator('.rec video').evaluate(el => getComputedStyle(el).objectFit)
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
  await flowStep('Open the board detail — the two columns are there', async () => {
    await page.goto('/#/board')
    await page.waitForSelector('.dt[data-screen="board"]:not([hidden]) .cols')
    await checkReq('R10', async () => { await expect(page.locator('#reqpane')).toBeVisible() })
  })
  await flowStep('Announce a golden value on the narration bar', async () => {
    await hudCheck('cards on the home board', 4, await page.locator('#home .card').count())
  })
  await flowStep('Confirm the tests column is present', async () => {
    await expect(page.locator('#testpane')).toBeVisible()
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
    // serves it with the hover wire instead — hovering a requirement lights every test tagging it
    // and vice versa (build-board.mjs ~1771/1779), which is what the R5 test above asserts. So the
    // many-to-many listing is proven; it is simply proven where it now lives, not in a covers line.
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
      await unproven.locator('.h').click()
      await expect(unproven.locator('.covers .nocov')).toBeVisible()
    }
  })
})

test('Hovering a test lights up the requirements it covers', async ({ page }) => {
  await coverReqs('R5')
  await openDetail(page)
  await checkReq('R5', async () => {
    const test0 = page.locator('#testpane .test').first()
    const tag = test0.locator('.tags .tag[data-r]').first()
    await expect(tag).toBeVisible()                          // a test tags the requirement ids it covers
    const rid = await tag.getAttribute('data-r')
    // hovering the test lights up the requirement it covers (the many-to-many wire), and vice versa
    await test0.hover()
    await expect(page.locator(`#reqpane .req[data-r="${rid}"]`)).toHaveClass(/hot/)
    await page.locator('.dbar').hover()                     // move off
    await expect(page.locator(`#reqpane .req[data-r="${rid}"]`)).not.toHaveClass(/hot/)
  })
})

test('A requirement names the tests that cover it', async ({ page }) => {
  await coverReqs('R6')
  await openDetail(page)
  await checkReq('R6', async () => {
    // Few, comprehensive: the model lets one test cover several requirements (tags carry the link),
    // and a requirement's detail names the tests that prove it — never a bare "7 of 7 passing".
    const tests = page.locator('#testpane .test')
    await expect(tests.first()).toBeVisible()
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
    // the hover wire carries it). The old assertion was unsatisfiable the moment board had a single
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

test('No acceptance gate — the detail is the two columns, nothing to accept', async ({ page }) => {
  await coverReqs('R8')
  await openDetail(page)
  await checkReq('R8', async () => {
    const detail = page.locator('.dt[data-screen="board"]:not([hidden])')
    // There is NO gate (R8): a requirement is the source of truth the moment it is written, so the
    // detail has no gate bar and no accept button — nothing waits on a rubber-stamp.
    await expect(detail.locator('.gate')).toHaveCount(0)
    await expect(detail.locator('[data-act="accept"]')).toHaveCount(0)
    // nor any "did you build it" / draft gate — none ever existed in the two-column model
    await expect(detail.locator('[data-gate]')).toHaveCount(0)
    await expect(detail.getByText(/Matches the design|approved design|Open draft/i)).toHaveCount(0)
    // the detail goes straight from its header to the two columns
    await expect(detail.locator('.dtscroll > .cols')).toHaveCount(1)
    await expect(detail.locator('.cols .pane')).toHaveCount(2)
  })
})

test('The detail offers a focus reader — one requirement per page, columns a click away', async ({ page }) => {
  await coverReqs('R13')
  await openDetail(page)
  await checkReq('R13', async () => {
    const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
    // default is the two columns (R2); the focus reader is opt-in
    await expect(dt.locator('.cols')).toBeVisible()
    await expect(dt.locator('.focusov')).toHaveCount(0)
    // open Focus → the columns give way to a single-requirement reader
    await dt.locator('.focusbtn').click()
    const ov = dt.locator('.focusov')
    await expect(ov).toBeVisible()
    await expect(dt.locator('.cols')).toBeHidden()
    // exactly ONE requirement on screen — its id, state, title and full body
    await expect(ov.locator('.fcard')).toHaveCount(1)
    await expect(ov.locator('.fcard .fid')).not.toBeEmpty()
    await expect(ov.locator('.fcard .fchip')).toHaveClass(/proven|unproven/)
    await expect(ov.locator('.fcard .fttl')).not.toBeEmpty()
    await expect(ov.locator('.fcard .fbody p, .fcard .fbody ul').first()).toBeVisible()
    // a pager with one dot per requirement; next advances to a different requirement
    const dots = ov.locator('.fdots .fdot')
    const reqCount = await dt.locator('.reqpane .req').count()
    await expect(dots).toHaveCount(reqCount)
    const firstId = (await ov.locator('.fcard .fid').textContent())!.trim()
    await ov.locator('.fnav.next').click()
    await expect(ov.locator('.fcard .fid')).not.toHaveText(firstId)
    // Columns returns to the two-column view
    await ov.locator('.fcols').click()
    await expect(dt.locator('.focusov')).toHaveCount(0)
    await expect(dt.locator('.cols')).toBeVisible()

    // THE PROOF is on the card, not just the requirement — and the card now carries the WHOLE
    // single-test detail (board R13, enriched): for a covered requirement it EMBEDS that test's own
    // evidence — its recording, its Run/Logs/Steps controls, and its numbered story steps — MOVED in
    // from the columns, so no player is duplicated (R13's "reuse the columns' machinery").
    // (Robust to the dogfood lag: a board requirement may read proven OR unproven on any given run,
    // so this asserts the machinery, not a specific green state.)
    await dt.locator('.focusbtn').click()
    const ov2 = dt.locator('.focusov')
    await expect(ov2.locator('.fcard .fproof')).toBeVisible()
    // R1 (the card opens on it) is covered by a test, so the card names its proof source once…
    await expect(ov2.locator('.fcard .fpby, .fcard .fpnone')).toHaveCount(1)
    await expect(ov2.locator('.fcard .fpby')).toBeVisible()
    // …and EMBEDS that test's full evidence, opened: the recording, the numbered steps, and the
    // Logs/Steps window controls are all present INSIDE the card, not a screen away.
    const ev = ov2.locator('.fcard .fev .test').first()
    await expect(ev).toBeVisible()
    await expect(ev).toHaveClass(/\bopen\b/)
    await expect(ov2.locator('.fcard .fev .beat').first()).toBeVisible()
    await expect(ov2.locator('.fcard .fev .rec')).toHaveCount(1)
    await expect(ov2.locator('.fcard .fev [data-steps]')).toHaveCount(1)
    await expect(ov2.locator('.fcard .fev [data-log]')).toHaveCount(1)
    // a single secondary action returns to the columns with that test open — and it is FUNCTIONAL,
    // MOVING the embedded test back into the pane intact (so the columns are whole again afterwards)
    const openBtn = ov2.locator('.fcard .fopen')
    await expect(openBtn).toBeVisible()
    await openBtn.click()
    await expect(dt.locator('.focusov')).toHaveCount(0)
    await expect(dt.locator('.cols')).toBeVisible()
    await expect(dt.locator('.testpane .test.open')).not.toHaveCount(0)
    // the proof line is COVERAGE-honest and never a bare title row: a covered requirement (the card
    // opens on R1) names its flow whatever its green state — "Proven by" when green, still named when
    // not. (Every board requirement is now covered by a test, so the uncovered "No test asserts this
    // yet" branch is exercised on other projects' boards, not the dogfood — see the R14 strip test.)
    await dt.locator('.focusbtn').click()
    const ov3 = dt.locator('.focusov')
    const chip = await ov3.locator('.fcard .fchip').textContent()
    if (/proven/.test(chip || '') && !/unproven/.test(chip || '')) {
      await expect(ov3.locator('.fcard .fpby')).toContainText('proved by')
    } else {
      await expect(ov3.locator('.fcard .fpby')).toBeVisible()   // covered but ungreen — still named
    }
  })
})

test('The proof is scannable as frames, not only as video — a strip of stills per checked value', async ({ page }) => {
  await coverReqs('R14')
  await openDetail(page)
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  // R1 is covered by exactly ONE test, so it is that test's own row in the columns AND the primary flow
  // its focus card embeds — the single place the stubbed frames must appear both times.
  const R1_TITLE = 'Home lists every screen as a card'
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
    await page.waitForSelector('.dt[data-screen="board"]:not([hidden]) .cols')

    // (1) IN THE TEST'S EVIDENCE (the columns): open the covering test → a scannable strip of stills,
    // one per checked value, each captioned with its got-vs-expected; the failing value is marked red.
    const tst = dt.locator('.test', { hasText: R1_TITLE }).first()
    await tst.locator('.th').click()
    const strip = tst.locator('.pfstrip')
    await expect(strip).toBeVisible()
    const fr = strip.locator('.pframe')
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

    // (2) IN THE FOCUS CARD: the reader EMBEDS the primary covering test (R13), so the strip rides
    // along — R1's card shows the same stills flat, without opening the columns.
    await dt.locator('.focusbtn').click()
    const ov = dt.locator('.focusov')
    await ov.locator('.fdot[title^="R1 "]').click()             // "R1 —…" (the trailing space excludes R10+)
    await expect(ov.locator('.fcard .fev .pfstrip .pframe')).toHaveCount(3)
    await expect(ov.locator('.fcard .fev .pframe.bad')).toHaveCount(1)
    // rendered flat like the reading layout: labelled sections, the header folded into the proof line
    await expect(ov.locator('.fcard .fev .flabel', { hasText: 'Proof frames' })).toBeVisible()
    await expect(ov.locator('.fcard .fev .test.infocus > .th')).toBeHidden()
  })
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
    const t = page.locator('#testpane .test').first()
    await t.locator('.th').click()                           // open the test
    await expect(t.locator('.tbody')).toBeVisible()
    await expect(t.locator('[data-run]')).not.toHaveCount(0) // Run / Watch stay wherever a test is shown
    // its steps fold, scrollable so fifty read as clearly as five
    await expect(t.locator('.fold')).toHaveCount(1)
    // the whole log opens in a FLOATING window, not a full-viewport scrim (a scrim suppresses the
    // board's own paint) — the board stays visible behind the box
    const sheet = page.locator('#logsheet')
    await expect(sheet).toBeHidden()
    await t.locator('.loglink').click()
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
    // 1 · the flag that drops — the bubble becomes a written requirement, and the ONE thing that
    //     waits on a person is on it
    const req = w2.locator('.scene.s-req')
    await expect(req.locator('.sc-bub')).toHaveCount(1)
    await expect(req.locator('.sc-card')).toHaveCount(1)
    await expect(req.locator('.wflag')).toContainText('guess:')
    await expect(req.locator('.wconfirm')).toContainText('you confirm the meaning')
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
    const flag = w2.locator('.scene.s-req .wflag')
    expect(await settle(flag)).toBeGreaterThan(0)      // it really animates, and it really finishes
    expect(await op(flag)).toBeLessThan(0.1)           // the guess flag has dropped
    expect(await op(w2.locator('.scene.s-req .wconfirm'))).toBe(1)   // your confirmation is held
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
    expect(await op(req.locator('.wconfirm'))).toBe(1)
    expect(await op(req.locator('.wflag'))).toBeLessThan(0.1)
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
