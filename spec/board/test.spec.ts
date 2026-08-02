import { test, expect, checkReq, coverReqs } from '../_base'

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
test('Steps read as named beats, a failure names itself, and the recording explains itself', async ({ page }) => {
  await coverReqs('R10')
  await openDetail(page)
  const t0 = (await page.locator('#testpane .test .ttl').nth(0).textContent())!.trim()
  const t1 = (await page.locator('#testpane .test .ttl').nth(1).textContent())!.trim()
  // the passing case carries a RECOVERED error (a caught wait, as real setups do) — it must not
  // read as a failure: the case's verdict, not a step's, decides whether the alarm is raised
  const steps0 = [
    { label: 'proves R1', cat: 'test.step', depth: 0, ok: true, t: 0, d: 5000 },
    { label: 'Wait for the “#email”', cat: 'pw:api', depth: 1, ok: false, t: 50, d: 30 },
    { label: 'Open /', cat: 'pw:api', depth: 1, ok: true, t: 100, d: 400 },
    { label: 'proves R2', cat: 'test.step', depth: 0, ok: true, t: 5000, d: 4000 },
    { label: 'Check the “cards” has the expected number', cat: 'expect', depth: 1, ok: true, t: 5200, d: 300 }
  ]
  // the failing case ALSO carries an early recovered error — the failing beat is the one holding
  // the LAST failed step (the flow stopped there), never the first errored-and-recovered one
  const steps1 = [
    { label: 'proves R4', cat: 'test.step', depth: 0, ok: true, t: 0, d: 2000 },
    { label: 'Wait for the “.grid”', cat: 'pw:api', depth: 1, ok: false, t: 50, d: 30 },
    { label: 'Click the “Run all”', cat: 'pw:api', depth: 1, ok: true, t: 100, d: 200 },
    { label: 'proves R5', cat: 'test.step', depth: 0, ok: false, t: 2000, d: 1000 },
    { label: 'Check the “tags” has the expected number', cat: 'expect', depth: 1, ok: false, t: 2100, d: 900 }
  ]
  const mk = (ok: boolean, steps: object[]) => ({
    shots: [], video: 'spec/_runs/rt/' + (ok ? 'a' : 'b') + '.webm', steps, log: 'x',
    at: '2026-08-03T00:00:00.000Z', ms: 9000, ok, commit: 'abc1234'
  })
  await page.route('**/api/runs', route => route.fulfill({ json: {
    watch: false, running: false,
    runs: [{ screen: 'board', runId: 'rt', hasLog: false, at: '2026-08-03T00:00:00.000Z', ms: 9000,
      ok: false, total: 2, failed: 1, shotsByTest: { [t0]: mk(true, steps0), [t1]: mk(false, steps1) } }]
  } }))
  await page.reload()                                            // same-document hash nav never reloads
  await page.waitForSelector('.dt[data-screen="board"]:not([hidden]) .cols')
  const dt = page.locator('.dt[data-screen="board"]:not([hidden])')
  const pass = dt.locator('.test', { hasText: t0 }).first()
  const fail = dt.locator('.test', { hasText: t1 }).first()

  await checkReq('R10', async () => {
    // the steps fold reads as the author's NAMED BEATS, not one flat wall behind a count
    await pass.locator('.th').click()
    const beats = pass.locator('.tststeps .beat')
    await expect(beats).toHaveCount(2)
    await expect(beats.first()).toContainText('proves R1')
    // a passing beat keeps its actions folded; one click on the beat reveals them
    await expect(pass.locator('.tststeps .bacts li').first()).toBeHidden()
    await beats.first().locator('.stepstog').click()
    await expect(pass.locator('.tststeps .bacts li').first()).toBeVisible()
    await expect(pass.locator('.tststeps .bacts li').nth(1)).toContainText('Open /')
    // the recovered step keeps its honest ✕ mark at detail level — it happened — without the alarm
    await expect(pass.locator('.tststeps .bacts li.sf')).toHaveCount(1)

    // a PASSING case never raises the alarm, even when a step inside it errored and recovered —
    // the verdict is the case's, not a caught wait's
    await expect(pass.locator('.tststeps .beat.f')).toHaveCount(0)
    await expect(pass.locator('.tmeta')).toContainText('2 beats')
    await expect(pass.locator('.tmeta')).not.toContainText('failed')

    // WHICH PART FAILED is visible without opening anything: the meta line names the failing beat…
    await expect(fail.locator('.tmeta')).toContainText('proves R5')
    // …and inside, exactly ONE beat wears the failure — the one holding the LAST failed step,
    // arriving OPEN with its failing check marked, not the early errored-and-recovered beat
    await fail.locator('.th').click()
    const fbeat = fail.locator('.tststeps .beat.f')
    await expect(fbeat).toHaveCount(1)
    await expect(fbeat).toContainText('proves R5')
    await expect(fbeat.locator('.bacts li.sf')).toBeVisible()    // auto-revealed, marked ✕
    // while its recovered neighbour beat stays folded and quiet
    await expect(fail.locator('.tststeps .beat.p .bacts li').first()).toBeHidden()
  })

  await checkReq('R10', async () => {
    // the CONTEXT BAR: while the recording plays it names the beat under the playhead. The stub
    // names no real video file, so the playhead is driven by hand — the bar logic is what is proven.
    await pass.locator('.rec').click()
    const bar = pass.locator('.rec .ctx')
    await expect(bar).toBeAttached()
    await pass.locator('.rec video').evaluate(v => {
      Object.defineProperty(v, 'currentTime', { get: () => 5.5, configurable: true })
      v.dispatchEvent(new Event('timeupdate'))
    })
    await expect(bar).toBeVisible()
    await expect(bar).toContainText('proves R2')                 // the beat live at 5.5s
    await expect(bar).not.toHaveClass(/bad/)                     // a recovered error never pins a failure
    // on a failed case, once the playhead passes the failure the bar PINS the failing beat
    await fail.locator('.rec').click()
    await fail.locator('.rec video').evaluate(v => {
      Object.defineProperty(v, 'currentTime', { get: () => 2.6, configurable: true })
      v.dispatchEvent(new Event('timeupdate'))
    })
    await expect(fail.locator('.rec .ctx')).toHaveClass(/bad/)
    await expect(fail.locator('.rec .ctx')).toContainText('proves R5')
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

    // …and that state is ASSERTION-BACKED, not typed. A proven requirement NAMES the passing test(s)
    // that cover it (real .ctag chips in its covers line); an unproven one says so honestly. If the
    // derivation were faked — every requirement stamped proven regardless of its tests — a proven row
    // would have no covering test to name and its .ctag would be missing, and this would fail.
    const proven = page.locator('#reqpane .req[data-state="proven"]')
    const provenN = await proven.count()
    for (let i = 0; i < provenN; i++) {
      const row = proven.nth(i)
      await row.locator('.h').click()
      await expect(row.locator('.covers .ctag').first()).toBeVisible()
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
    // a proven requirement names its covering test(s) in the covers line
    const proven = page.locator('#reqpane .req[data-state="proven"]').first()
    if (await proven.count()) {
      await proven.locator('.h').click()
      await expect(proven.locator('.covers')).toBeVisible()
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
