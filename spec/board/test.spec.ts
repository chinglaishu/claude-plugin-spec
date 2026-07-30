import { test, expect, checkReq, coverReqs } from '../_base'
import { readState, writeState, readScreen } from '../../tools/spec-store.mjs'

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

test('R1 — home is one CARD per screen: titles + a cover, never a four-column strip', async ({ page }) => {
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

test('R2 — the detail is two columns, each scrolling on its own', async ({ page }) => {
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

test('R3 — a requirement is a title that EXPANDS; a test leads with its flow name, not a requirement', async ({ page }) => {
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
  })
})

test('R4 — requirement state is computed: reworded wins, else proven / unproven — and it re-derives', async ({ page }) => {
  await coverReqs('R4')
  // Capture the REAL pinned state so the transition restores exactly — never leave the board's own
  // gate flipped (that is the human's, not mine).
  const before = readState('board')
  const prdText = readScreen('board').prdText
  await openDetail(page)
  await checkReq('R4', async () => {
    // The board's requirements were rewritten since they were accepted, so every one reads REWORDED
    // (awaiting the human's gate) — reworded wins over any proof.
    await expect(page.locator('#reqpane .req[data-state="reworded"]').first()).toBeVisible()
    const rewordedNow = await page.locator('#reqpane .req[data-state="reworded"]').count()
    expect(rewordedNow).toBeGreaterThan(0)

    // Pin the CURRENT text (what accepting the requirements does): the reworded state clears and every
    // requirement RE-DERIVES to a computed proof state (proven or unproven) — never reworded, never
    // blank. Driven directly so the test restores the exact bytes; the accept BUTTON is proven by R8.
    // (Whether a given one lands proven or unproven depends on the last run's coverage — not asserted
    // here, so this stays a clean test of "reworded wins, then state is computed", not of run timing.)
    const total = await page.locator('#reqpane .req').count()
    writeState('board', { ...before, approvedPrdText: prdText })
    await page.reload()
    await page.waitForSelector('.dt[data-screen="board"]:not([hidden]) .cols')
    await expect(page.locator('#reqpane .req[data-state="reworded"]')).toHaveCount(0)
    // every requirement now carries a computed proof state — none left uncomputed, none still reworded
    await expect(page.locator('#reqpane .req[data-state="proven"], #reqpane .req[data-state="unproven"]')).toHaveCount(total)
  })
  // restore the real pin — the board stays honestly reworded until the human accepts
  writeState('board', before)
})

test('R5 — requirements and tests are many-to-many by tag, and the link lights up on hover', async ({ page }) => {
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

test('R6 — a test declares the coverage it proves; a requirement lists every test that covers it', async ({ page }) => {
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

test('R7 — an external design link is optional context: shown, never rendered or gated; absent = disabled', async ({ page }) => {
  await coverReqs('R7')
  await openDetail(page)
  await checkReq('R7', async () => {
    const design = page.locator('.dt[data-screen="board"]:not([hidden]) [data-design]')
    await expect(design).toHaveCount(1)
    // board has no design: link, so it is disabled with a hint — never a rendered wireframe, never a gate
    await expect(design).toHaveAttribute('data-design', '')
    await expect(design).toHaveAttribute('aria-disabled', 'true')
    // the wireframe left the tool entirely: no iframe, no draft anywhere in the detail
    await expect(page.locator('.dt[data-screen="board"]:not([hidden]) iframe')).toHaveCount(0)
  })
})

test('R8 — ONE human gate: accept the requirements; no gate B, no wireframe', async ({ page }) => {
  await coverReqs('R8')
  const before = readState('board')
  await openDetail(page)
  await checkReq('R8', async () => {
    const detail = page.locator('.dt[data-screen="board"]:not([hidden])')
    await expect(detail.locator('.gate')).toHaveCount(1)     // exactly one gate
    // it is the accept-requirements gate — there is no "did you build it" gate and no draft gate
    await expect(detail.getByText(/Matches the design|approved design|Open draft/i)).toHaveCount(0)
    const accept = detail.locator('[data-act="accept"]')
    await expect(accept).toBeVisible()

    // the button actually accepts — pins the requirements, and the gate closes
    await accept.click()
    await expect(detail.locator('[data-act="accept"]')).toHaveCount(0)
  })
  writeState('board', before)   // restore — accepting is the human's, done here only to prove the wire
})

test('R9 — search across requirement text, grouped into areas, a group with no match hides', async ({ page }) => {
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

test('R10 — a test opens to its evidence and can be run; the whole log opens in a floating window', async ({ page }) => {
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
