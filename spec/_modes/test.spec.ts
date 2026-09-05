import { test, expect, checkReq } from '../_base'
import { readdirSync, rmSync, statSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readScreen } from '../../tools/spec-store.mjs'
import { reqHash, meaningText } from '../../tools/reqhash.mjs'
import { parseBehavior } from '../../tools/behavior.mjs'
import { build } from '../../tools/build-board.mjs'

// The ENGINE of the board's computed state (board R4/R8). A requirement's state is COMPUTED — proven or
// unproven — from the tests alone, never typed, and there is NO acceptance gate: editing the PRD IS
// the change, so a stale proof simply reads unproven. There is also no draft/guess state (the human,
// 2026-08-17): a PRD is canon the moment it is written, full stop — nothing on a screen waits on a
// person any more. These specs prove the derivation directly against the store, then that the board
// renders those states and NO gate. (This is a `_`-prefixed pseudo-screen: Playwright runs it, but it
// is not a row.)
//
// Fixtures are `probe-` screens. This file sorts BEFORE board/ (an underscore beats a letter), so a
// leftover would be a phantom row while the board specs assert exact counts — clean up after EACH test
// and rebuild to the real board (the state guard also sweeps any new dir at teardown).

const SPEC = join(dirname(fileURLToPath(import.meta.url)), '..')

test.afterEach(() => {
  let removed = false
  for (const n of readdirSync(SPEC))
    if (n.startsWith('probe-') && statSync(join(SPEC, n)).isDirectory()) {
      rmSync(join(SPEC, n), { recursive: true, force: true }); removed = true
    }
  if (removed) build()
})

// A screen with one requirement. There is nothing to "accept" (board R8) — a requirement is the
// source of truth the moment it is written, and its state is computed from its tests. `extra` lets a
// test inject an arbitrary extra frontmatter line — used below to prove a pre-redesign `guess:` line
// left over in an old PRD is now inert.
function makeScreen (name: string, body = 'One behaviour, asserted by a test.', { extra = '', evidence = false, title = 'A first requirement' } = {}) {
  const dir = join(SPEC, name); mkdirSync(dir, { recursive: true })
  const prd = `---\nscreen: ${name}\narea: Core\ntitle: ${name}\nroute: /${name}\n` +
    extra + `---\n\n## R1 — ${title}\n\n${body}\n`
  writeFileSync(join(dir, 'prd.md'), prd)
  if (evidence) {
    // a real (1×1) png pair at the harvest's deterministic home, so the baked data-ev-* attributes
    // pass the builder's existsSync guard and the media pane has genuine files to show
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64')
    const ed = join(dir, 'evidence'); mkdirSync(ed, { recursive: true })
    writeFileSync(join(ed, 'R1.before.png'), png)
    writeFileSync(join(ed, 'R1.after.png'), png)
  }
  return { name, dir, prd }
}

// (The `sketchRows` helper — how many rows show the requirement's DRAWING, inline or inside a
// borrowed page — went with the SKETCH on 2026-09-05, CLAUDE.md rule 4. No row draws anything from
// a requirement's sentence any more: a beat row's Expected cell is the replica the app rendered, or
// the honest "no Expected yet". These probe screens harvest nothing, so every one of their rows is
// the honest blank, and that is what the legs below read.)
// A fresh, far-future passing result for this screen's R1 — fed straight to readScreen, so no
// _results-index.json on disk is touched. Far-future so it is never counted stale against the source.
const passResult = (name: string) =>
  ({ [name]: { ranAt: Date.now() + 100000, tests: [{ title: 'x', ok: true, reqs: { [`${name}:R1`]: 'pass' } }] } })

// A passing result from the PAST — before the source on disk was written — so it reads STALE: a proof
// that predates the current version of the screen no longer proves anything.
const stalePass = (name: string) =>
  ({ [name]: { ranAt: 1, tests: [{ title: 'x', ok: true, reqs: { [`${name}:R1`]: 'pass' } }] } })

// ── the two requirement states (board R4) ─────────────────────────────────
test('unproven — a requirement with no passing test reads unproven', () => {
  const { name } = makeScreen('probe-unproven')
  const s = readScreen(name)!
  expect(s.reqs[0].state).toBe('unproven')   // no passing assertion covers it — honestly ungreen
})

test('proven — a current passing proof makes a requirement proven', () => {
  const { name } = makeScreen('probe-proven')
  const s = readScreen(name, passResult(name) as any)!
  expect(s.reqs[0].state).toBe('proven')
})

test('a proof that predates the source no longer proves — editing the PRD IS the change', () => {
  const { name } = makeScreen('probe-stale')
  // a pass recorded before this prd.md was written describes a version that has moved on
  const s = readScreen(name, stalePass(name) as any)!
  expect(s.reqs[0].state).toBe('unproven')   // stale by source — no gate needed to notice
})

// board R4's four-word `status` must apply the SAME staleness rule `state` does — a pass that
// predates the source is not current, and deriveReqStatus must never see it either. Fixed
// 2026-08-18 (fix round 1, finding 2): `status` was computed from the RAW aggregated entries,
// bypassing the staleness filter `hasCurrentPass` uses two lines above it — a stale-only pass
// read Passed even while `state` correctly read unproven, a real green the code exists to prevent
// (rule 3, never fake a green).
test('a stale-only pass does not read Passed either — status honours the same staleness filter as state', () => {
  const { name } = makeScreen('probe-stale-status')
  const s = readScreen(name, stalePass(name) as any)!
  expect(s.reqs[0].state).toBe('unproven')     // unchanged behaviour, re-asserted for context
  expect(s.reqs[0].status).not.toBe('passed')  // the stale pass must not count for status either
  expect(s.reqs[0].status).toBe('untested')    // nothing else covers it once the stale pass is dropped
})

test('state is only ever proven or unproven — there is no reworded / accept state', () => {
  // with a proof and without one, the computed state is one of exactly two — never a third
  // "changed since accepted" value, because there is no acceptance to change against (board R8)
  const proven = readScreen(makeScreen('probe-two-a').name, passResult('probe-two-a') as any)!
  const bare = readScreen(makeScreen('probe-two-b').name)!
  expect(proven.reqs[0].state).toBe('proven')
  expect(bare.reqs[0].state).toBe('unproven')
  for (const s of [proven, bare]) expect(s.reqs[0].state).not.toBe('reworded')
})

// ── no more guess / draft state (the human, 2026-08-17) ────────────────────
// A requirement is canon the moment it is written — there is no `guess:` flag, no waiting, no
// acceptance. A pre-redesign PRD that still carries a leftover `guess: true` line (this repo's own
// spec/init/state.json relic predates the change) must be read no differently from any other PRD: the
// frontmatter key is simply unused now, not a distinguishing state.
test('a leftover guess: frontmatter line is inert — the screen reads exactly like any other', () => {
  const normal = makeScreen('probe-normal')
  const leftover = makeScreen('probe-leftover-guess', 'A drafted requirement.', { extra: 'guess: true\n' })
  const ns = readScreen(normal.name)! as any
  const ls = readScreen(leftover.name)! as any
  expect(ns.guess).toBeUndefined()
  expect(ls.guess).toBeUndefined()   // the flag is no longer read at all — canon either way
})

// ── Changed — board R4's fifth word (2026-08-19) ───────────────────────────
// A requirement a test PROVED before, whose TEXT has moved since that proof, reads Changed — a
// modifier on Passed only, computed from the per-screen `provenHashes` pin the fold stamps at each
// passing run (reqHash(meaningText(body)) at that moment) against the current body. Never stored as
// a status; Failed / Not-reached / Untested keep their word.

// A fresh, current PASS for this screen's R1 whose pin does NOT match the current body — the text
// moved since the proof was pinned.
const changedResult = (name: string) => ({
  [name]: {
    ranAt: Date.now() + 100000, total: 1, failed: 0,
    tests: [{ title: 'x', ok: true, reqs: { [`${name}:R1`]: 'pass' } }],
    provenHashes: { R1: 'deadbeefdeadbeef' }
  }
})

test('changed — a current pass whose text-pin no longer matches reads Changed', () => {
  const { name } = makeScreen('probe-changed-store')
  const s = readScreen(name, changedResult(name) as any)!
  expect(s.reqs[0].status).toBe('changed')
  // a modifier ON Passed: the pass itself is still current, so `state` stays proven
  expect(s.reqs[0].state).toBe('proven')
})

test('changed — a matching pin stays plainly Passed', () => {
  const { name, prd } = makeScreen('probe-changed-same')
  const body = prd.split(/\n## R1[^\n]*\n/)[1].trim()
  const r = changedResult(name) as any
  r[name].provenHashes.R1 = reqHash(meaningText(body))
  const s = readScreen(name, r)!
  expect(s.reqs[0].status).toBe('passed')
})

test('changed is a modifier on Passed only — a failing test keeps the requirement Failed', () => {
  const { name } = makeScreen('probe-changed-fail')
  const r = changedResult(name) as any
  r[name].tests[0].ok = false
  r[name].tests[0].reqs[`${name}:R1`] = 'fail'
  r[name].failed = 1
  const s = readScreen(name, r)!
  expect(s.reqs[0].status).toBe('failed')   // fail wins; the moved pin changes nothing here
})

// ── the board renders proven/unproven and NO gate (board R2/R8) ────────────
async function settleAt (page: any, url: string, ready: any) {
  // Re-assert the board each retry — the watcher can stale-overwrite board.html (a rebuild it began
  // before the fixture landed, finishing late) and never self-correct. A fresh in-process build is the
  // last writer once the file events settle, so goto lands on a board that has this fixture.
  // The INNER visibility check gets a SHORT timeout so the outer toPass can actually RETRY: with the
  // default 15s expect timeout inside, one stale-overwrite (the watcher finishing a pre-fixture rebuild
  // late) eats the whole outer budget and never re-builds — the intermittent 15.2s flake this file is
  // prone to. Short inner + a wider outer budget lets each retry re-assert build() until the file
  // events settle. The assertion is unchanged; only the retry cadence is.
  // 2026-08-22, two more turns of the same screw (assertions still unchanged):
  //   · page.reload() after the goto — the FIRST retry's goto from another hash is a SAME-DOCUMENT
  //     navigation (the documented trap) and serves the old DOM no matter how fresh board.html is;
  //     an unconditional reload makes every retry land on the board build() just wrote.
  //   · outer budget 25s → 60s: the watcher's debounced child builds form a CONVOY under load (each
  //     fixture write spawns one; a slow stale child overwrites the fresh board as it lands), and a
  //     full-suite run was once still draining it at 25s (one solo run recovered at ~24s). More
  //     retries, same assertion — the af1d732 wall-clock-budget precedent.
  await expect(async () => {
    build()
    await page.goto(url)
    await page.reload()
    await expect(ready).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 60000 })
}

// Every fixture test above injects an index and rebuilds board.html to that FIXTURE via settleAt's
// build(). After each test's finally restores the real index, rebuild board.html to it too — so the
// board's OWN suite, which runs after _modes (serial, workers:1) and does NOT force its own build,
// never opens onto a leftover fixture board. This closes the watcher-stale-overwrite race these
// settle tests are prone to (see settleAt) at the file boundary; a fresh in-process build is the last
// writer once each test's file events settle.
test.afterEach(async () => {
  await expect(async () => { build(); const { reqs } = readScreen('board'); expect(reqs.length).toBeGreaterThan(0) })
    .toPass({ timeout: 10000 })
})

test('renders — the detail carries NO gate and no accept button', async ({ page }) => {
  const { name } = makeScreen('probe-render')
  const dt = page.locator('.dt[data-screen="' + name + '"]:not([hidden])')
  await settleAt(page, '/#/' + name, dt.locator('.viewseg'))
  // the two baked source panes are in the DOM but HIDDEN — the Columns view is retired (board R13,
  // 2026-08-18); Focus and Grid read these rows, and count/text assertions work on hidden nodes
  await expect(dt.locator('.cols')).toBeHidden()
  await expect(dt.locator('.cols .pane')).toHaveCount(2)           // the baked source panes (board R2)
  await expect(dt.locator('.gate')).toHaveCount(0)                 // no acceptance gate (board R8)
  await expect(dt.locator('[data-act="accept"]')).toHaveCount(0)   // nothing to accept
  await expect(dt.locator('[data-gate]')).toHaveCount(0)           // no gate B / draft gate either
  await expect(dt.locator('iframe')).toHaveCount(0)                // no wireframe
  // every requirement renders a COMPUTED state — never reworded, never blank
  await expect(dt.locator('.reqpane .req[data-state="reworded"]')).toHaveCount(0)
  const reqN = await dt.locator('.reqpane .req').count()
  await expect(dt.locator('.reqpane .req[data-state="proven"], .reqpane .req[data-state="unproven"]'))
    .toHaveCount(reqN)
})

test('renders — a leftover guess: frontmatter line renders exactly like a normal screen', async ({ page }) => {
  const { name } = makeScreen('probe-render-guess', 'A drafted requirement.', { extra: 'guess: true\n' })
  const card = page.locator('#home .card[data-screen="' + name + '"]')
  await settleAt(page, '/', card)
  expect(await card.getAttribute('data-waiting')).toBeNull()   // no waiting attribute exists any more
  await expect(card.locator('.chip', { hasText: /guess/i })).toHaveCount(0)
})

// ── the behavior shape leads the detail (visual requirements, 2026-08-18) ──
// A requirement MAY lead with a `- **Given** / - **When** / - **Then**` triple (tools/behavior.mjs
// parses it; enrichReqs attaches it as r.behavior). The board renders that shape as a structured
// block ABOVE the prose; a prose-only requirement renders NO block at all — the empty-string
// contract, so nothing changes for every PRD that does not carry the triple. Focus must show the
// same block because the reader clones the baked source row's .body verbatim (stripping only
// .covers) — asserted here so a client.js change can never silently drop it.
test('renders — a beats block leads the requirement, the List reads it, and the proof rides its rows', async ({ page }) => {
  // TWO beats (D1's chain), harvested evidence on disk, and a current PASS in the injected index —
  // the full deterministic input for the frozen-mockup Focus contract (board R13, 2026-08-21):
  // behavior leads, prose collapses, the List row carries the beat count, the gap strip counts the
  // untested R2, and each beat's own harvested frame rides the row it proves (the retired media
  // pane's per-beat filmstrip default went with the pane itself, 2026-08-28 / 2026-09-02).
  const body =
    '- **Given** a list with two items\n- **When** you press Clear\n- **Then** the list shows zero items\n' +
    '- **When** you press Undo\n- **Then** the two items return\n\n' +
    'Supporting prose under the shape.\n\n' +
    '## R2 — A prose-only requirement\n\nOnly prose here — no triple, so no block.'
  const { name, dir } = makeScreen('probe-behavior', body, { evidence: true })
  const restore = injectIndex(name, passWithEvidence(name))
  try {
    const dt = page.locator('.dt[data-screen="' + name + '"]:not([hidden])')
    await settleAt(page, '/#/' + name, dt.locator('.viewseg'))

    // default FOCUS view: the STORYBOARD leads the reading card — each beat on its own row above the
    // collapsed prose (board R13, 2026-08-25 #2 — the behavior and its picture folded together)
    const fst = dt.locator('.fread .fstory')
    await expect(fst.locator('.sbrow')).toHaveCount(3)          // given + 2 × (When → Then)
    await expect(fst.locator('.sbrow .sbframe')).toHaveCount(3) // …each with an Expected cell of its own
    await expect(fst).toContainText('a list with two items')
    await expect(fst).toContainText('you press Undo')
    // THE STORYBOARD carries the beat NUMBERS and a heavier rule opening each beat after the first;
    // the Given row is distinct (tinted) and carries no number. REWRITTEN 2026-09-02 (the human:
    // the `When¹ · Then¹` superscripts were "hard to read and not intuitive"), and again the same
    // day when the words went SENTENCE-FIRST ("even more easy to read"): the number is the row's
    // MARK COLUMN now — a ringed numeral beside each beat's words, the context row's mark a small
    // hollow ring with no number — and no <sup>, and no label column, is emitted anywhere.
    await expect(fst.locator('.sbrow.beatstart')).toHaveCount(1)
    await expect(fst.locator('.sbrow').nth(2)).toHaveClass(/beatstart/)
    await expect(fst.locator('.sbno:not(.hollow)')).toHaveText(['1', '2'])
    await expect(fst.locator('.sbrow.bgiven .sbno.hollow')).toHaveCount(1)
    await expect(fst.locator('.sbrow.bgiven .sbno:not(.hollow)')).toHaveCount(0)
    // the keyword leads its own sentence — When/Then/Given inside the words, no label column
    await expect(fst.locator('.sbrow').nth(1).locator('.sbwhen .lead')).toHaveText('When')
    await expect(fst.locator('.sbrow').nth(1).locator('.sbthen .lead')).toHaveText('Then')
    await expect(fst.locator('.sbrow.bgiven .sbgiven .lead')).toHaveText('Given')
    await expect(fst.locator('.sbk')).toHaveCount(0)
    await expect(fst.locator('sup')).toHaveCount(0)
    expect(await fst.locator('.sbwrap').evaluate(el => getComputedStyle(el).borderTopWidth), 'the block is bordered').toBe('1px')
    expect(await fst.locator('.sbrow.bgiven').evaluate(el => getComputedStyle(el).backgroundColor), 'the Given row is tinted').not.toBe('rgba(0, 0, 0, 0)')
    const rule1 = await fst.locator('.sbrow').nth(1).evaluate(el => parseFloat(getComputedStyle(el).borderTopWidth))
    const rule3 = await fst.locator('.sbrow').nth(2).evaluate(el => parseFloat(getComputedStyle(el).borderTopWidth))
    expect(rule3, 'a beat boundary rules heavier than a row').toBeGreaterThan(rule1)
    // …the card's HEADER is pinned (Task 12 — the beats region scrolls INSIDE the card, so the
    // header can never leave the viewport). Both of A-1's pre-click viewport checks are KEPT and
    // retargeted at that header: at 900px and on a short 640px window alike, visible before ANY
    // interaction — Playwright auto-scrolls before a click, so only an explicit, pre-click
    // viewport check can see this.
    await expect(dt.locator('.focusov .fread > .frmeta')).toBeInViewport({ ratio: 1 })
    await page.setViewportSize({ width: 1440, height: 640 })
    await expect(dt.locator('.focusov .fread > .frmeta')).toBeInViewport({ ratio: 1 })
    await page.setViewportSize({ width: 1440, height: 900 })
    // …and the authored PROSE is ALWAYS SHOWN beneath the beats (the human, 2026-08-28): the
    // 'Full requirement' toggle is GONE, so the full text reads with no interaction at all —
    // there is no control left to click, and none is needed
    await expect(dt.locator('.focusov .fread .prose-t')).toHaveCount(0)
    await expect(dt.locator('.focusov .fread > .ffoot button')).toHaveCount(0)
    // …the prose block itself is GONE from the reader (the human, 2026-09-02: "remove the whole
    // thing as well") — the rows are the requirement; the paragraph stays in prd.md
    await expect(dt.locator('.fread .fbody')).toHaveCount(0)
    await expect(dt.locator('.focusov .fread')).not.toContainText('Supporting prose under the shape.')

    // THE BAKED SOURCE ROW (hidden — count/text reads work there): the block renders inside R1's
    // .body, five labelled rows carrying the text
    const beh = dt.locator('.reqpane .req[data-r="R1"] .body .behavior')
    await expect(beh).toHaveCount(1)
    await expect(beh.locator('.brow')).toHaveCount(5)
    await expect(beh.locator('.brow').nth(0)).toContainText('a list with two items')
    await expect(beh.locator('.brow').nth(1)).toContainText('you press Clear')
    await expect(beh.locator('.brow').nth(2)).toContainText('the list shows zero items')
    // the shape LEADS: the block is the body's first element, above the rendered prose
    await expect(dt.locator('.reqpane .req[data-r="R1"] .body > :first-child')).toHaveClass(/behavior/)
    // the beats are drawn ONCE, as the shape — never re-emitted as a bullet list below
    await expect(dt.locator('.reqpane .req[data-r="R1"] .body ul li', { hasText: 'a list with two items' })).toHaveCount(0)
    await expect(dt.locator('.reqpane .req[data-r="R1"] .body')).toContainText('Supporting prose under the shape.')
    // and the prose-only requirement renders NO block — no wrapper, no empty grid
    await expect(dt.locator('.reqpane .req[data-r="R2"] .body .behavior')).toHaveCount(0)

    // MEDIA (D2, re-split by the human 2026-08-28): the harvested frames ride the BEAT ROWS they
    // belong to. This fixture's index entry is a requirement-level pair only — no per-beat harvest —
    // so the reader has to place it HONESTLY: the `before` opens the story on the Given row, the
    // `after` closes it on the LAST beat row, and the row in between says the gap out loud rather
    // than borrowing a neighbour's frame to look complete (rule 3).
    const proof = dt.locator('.focusov .fread .fstory .sbrow .sbproof')
    await expect(proof).toHaveCount(3)                                  // one per row: given + 2 beats
    await expect(proof.locator('.pcstrip .pcfig img')).toHaveCount(2)   // exactly the pair that exists
    // the per-cell caption row is REMOVED (the human, 2026-09-02: "remove the given row on proof");
    // the frames themselves still carry before/after in their alt, and the gap row still says it has
    // nothing rather than borrowing a neighbour's frame
    await expect(proof.nth(0).locator('.pccap')).toHaveCount(0)          // no caption row any more
    await expect(proof.nth(0).locator('.pcstrip .pcfig img')).toHaveAttribute('alt', /before/i)
    await expect(proof.nth(1).locator('.pcnone')).toContainText('no per-beat evidence yet')
    await expect(proof.nth(1).locator('img')).toHaveCount(0)            // nothing invented for the gap
    await expect(proof.nth(2).locator('.pcstrip .pcfig img')).toHaveAttribute('alt', /after/i)
    // …and there is NOTHING beneath the rows but the proof header and the moved test: the whole
    // proof band went with the reader's video (the human, 2026-09-02), as the stills · gif · video
    // toolbar and its stored preference went with the per-beat split before it
    await expect(dt.locator('.focusov .feval .fmedia')).toHaveCount(0)
    await expect(dt.locator('.focusov .feval video')).toHaveCount(0)
    await expect(dt.locator('.focusov .feval .medbar')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('sbFocusMedia'))).toBeNull()

    // LIST view (board R13: Grid became List, a list of Focus): one collapsed row per requirement —
    // the row carries the BEAT COUNT; the gap strip above counts the untested R2 and offers the
    // add-test affordance (the R15 prompt handoff, unchanged behavior)
    await dt.locator('.viewseg .vseg[data-view="grid"]').click()
    await expect(dt.locator('.gridview .remind')).toContainText('1 Untested')
    await expect(dt.locator('.gridview .remind [data-addtest]')).toHaveCount(1)
    const c1 = dt.locator('.gridview .lst-card[data-r="R1"]')
    await expect(c1.locator('.lst-head .lbeats')).toHaveText('2 beats')
    await expect(c1.locator('.lst-head .lpf')).toContainText('Passed')
    await expect(dt.locator('.gridview .lst-card[data-r="R2"] .lbeats')).toHaveCount(0)
    // an OPEN row is the Focus body itself, in place — same storyline, same per-beat proof cells
    await c1.locator('.lst-head').click()
    await expect(c1.locator('.lst-body .fread .fstory .sbrow')).toHaveCount(3)
    await expect(c1.locator('.lst-body .fread .fstory .sbproof .pcstrip .pcfig img')).toHaveCount(2)
  } finally { restore() }
})

// ── Task 12: the first beat row on first sight, the beats scrolling inside the card ──
// The human (2026-08-24): on first sight the picture was not shown. The Focus page FITS the
// viewport — the requirement card's beats/prose region scrolls INTERNALLY (.fbeats) between a
// fixed card header and the pinned in-full footer, and the first row below keeps its intrinsic
// height, fully visible on load at a 640px-tall viewport and up. This fixture is TALL
// on purpose (three beats of wrapping text): under the superseded layout (the left column
// scrolling as one, Task 8 fix round 1) it pushed the drawing below the fold at BOTH heights.
test('renders — Focus fits the viewport: the first beat row on first sight, the beats scrolling inside the card', async ({ page }) => {
  // Task 14 (×0.8 --scale, 2026-08-24): the scaled chrome fits MORE — the original seven ~100-char
  // rows all single-lined in the wider reading column and the region stopped overflowing at 900px,
  // so "the beats region overflows" went red with the behaviour intact (rule 4: the fixture had
  // stopped being tall, not the contract). The beats stay THREE (toggle-and-recount caps there);
  // each row's text is lengthened instead, so every row wraps and the shape overflows again.
  // Task 14b (2026-08-24): the columns became fractional (both wider), which left the reading
  // column a touch wider still and cut the overflow margin to ~95px — enough that a settle-timing
  // jitter under full-suite load flipped it once. Each row is lengthened FURTHER here so the shape
  // overflows by a comfortable margin (~250px) that no paint jitter can flip. The assertions are
  // unchanged; the toggle-and-recount keywords (tick / count / remaining) are preserved.
  const body =
    '- **Given** a working list of three long-running items, every one of them still open and counted in the header, each carrying the kind of long descriptive label a real project accumulates over a season of renaming things again and again until the words finally say plainly what the item actually is and why it has stayed open on the list for as long as it has\n' +
    '- **When** you tick the first of the three long-running items open in the working list this morning, scrolling down past the other two still-open rows to reach it where it has sat quietly at the very bottom of the working list since the week it was first written down and added to the count\n' +
    '- **Then** the header count reads 2 remaining, the ticked row struck through where it stands in the list, the strike drawn cleanly through every single word of its long label so the finished row still reads in place, right where you left it, but now unmistakably reads as done and no longer counted\n' +
    '- **When** you tick the second of the two long-running items still open in the working list after that first one, its own label just as long and wandering as the first, wrapping onto a second and very nearly a third line exactly the way the rest of the crowded working list wraps its longer entries\n' +
    '- **Then** the header count reads 1 remaining, both ticked rows struck through where they stand in the list, the two strikes reading together as a visible running history of the morning’s work rather than the finished rows quietly vanishing from the list the instant they are marked complete\n' +
    '- **When** you tick the last long-running item still open anywhere in the working list at the very end of the day, leaving nothing at all still open in the list for the first time since the header count first started keeping its honest running score of what remained to be done\n' +
    '- **Then** the header count reads 0 remaining, the empty-state line shown under the three struck rows so the cleared list still tells you plainly what was finished here over the day rather than presenting a blank and uninformative pane that forgets the work entirely\n\n' +
    'Supporting prose under the tall shape, itself long enough to add another wrapped line or two of reading beneath the behaviour table so the region has still more reason to overflow its box.\n'
  // …and a TWO-LINE title (release pass M-3): at the 640px floor a long title once left the
  // beats region a sliver — "THE BEHAVIOR" over zero beats; the region now keeps one row.
  // (Lengthened for Task 14 so it still wraps to two lines in the wider scaled column.)
  const { name, dir } = makeScreen('probe-tall', body,
    { title: 'Ticking the long-running items one by one recounts the header and strikes each finished row through where it stands in the working list' })

  const dt = page.locator('.dt[data-screen="' + name + '"]:not([hidden])')
  await settleAt(page, '/#/' + name, dt.locator('.viewseg'))
  const ov = dt.locator('.focusov')
  const story = ov.locator('.fread .fstory')
  const scroll = ov.locator('.fread .fscroll')

  // ON FIRST SIGHT, before ANY interaction: the storyline LEADS with the Given row and its Expected
  // cell — whole, on screen from the first paint (Task 12, generalized to the storyline) — and the
  // card's header is pinned above it. (This used to count the row's drawn SKETCH; the sketch is
  // retired — the human, 2026-09-05 — so what must be on first sight is the row itself and the cell
  // that says, honestly, that nothing has been harvested for it yet.)
  await expect(story.locator('.sbrow').first().locator('.sbframe .noschem')).toHaveCount(1)
  await expect(story.locator('.sbrow').first()).toBeInViewport({ ratio: 1 })
  await expect(ov.locator('.fread > .frmeta')).toBeInViewport({ ratio: 1 })
  // the story+proof+prose region scrolls INTERNALLY (the storyline packs what used to be several
  // boxes into one, so a real reading card fits without natural overflow — a tall spacer pushed IN
  // proves the internal scroll deterministically, the steps.ts R2 technique): the region really
  // overflows, its scroll really moves, the clipped cue lights, and the card's own header does not
  // move with it (dispatch a scroll so the clip sync runs — appending a child grows scrollHeight but
  // not the region's own box, so the ResizeObserver that normally fires syncClip on layout does not)
  await scroll.evaluate(el => { const sp = document.createElement('div'); sp.className = 'probe-spacer'; sp.style.cssText = 'min-height:4000px'; el.appendChild(sp); el.dispatchEvent(new Event('scroll')) })
  expect(await scroll.evaluate(el => el.scrollHeight > el.clientHeight), 'the reading region overflows').toBe(true)
  // the clipped edge carries the scroll cue — the hairline fade on the pinned footer (tokens only)
  await expect(ov.locator('.fread')).toHaveClass(/\bclipped\b/)
  expect(await ov.locator('.fread .ffoot').evaluate(el => getComputedStyle(el, '::before').backgroundImage),
    'the clip cue is a fade').toContain('linear-gradient')
  const headTop = () => ov.locator('.fread > .frmeta').evaluate(el => Math.round(el.getBoundingClientRect().top))
  const headBefore = await headTop()
  await scroll.evaluate(el => { el.scrollTop = 80 })
  expect(await scroll.evaluate(el => el.scrollTop), 'the reading region scrolled').toBeGreaterThan(0)
  expect(await headTop(), 'the card header stayed pinned').toBe(headBefore)
  // scrolled to the very end, the edge is no longer clipped — the cue clears honestly
  await scroll.evaluate(el => { el.scrollTop = el.scrollHeight })
  await expect(ov.locator('.fread')).not.toHaveClass(/\bclipped\b/)
  await scroll.evaluate(el => { el.scrollTop = 0; el.querySelector('.probe-spacer')?.remove() })
  // the PAGE itself never scrolls: the Focus page ends above the always-visible pager bar
  const vp = page.viewportSize()!
  const pb = (await ov.locator('.fpage').boundingBox())!
  expect(pb.y + pb.height, 'the Focus page fits the viewport').toBeLessThanOrEqual(vp.height)
  await expect(dt.locator('.dtfoot .fpager')).toBeInViewport()

  // at the 640px floor the storyline STILL leads with the Given row on first sight, the header
  // still pinned — the row is paired from the first paint at any height
  await page.setViewportSize({ width: 1440, height: 640 })
  await expect(story.locator('.sbrow').first().locator('.sbframe')).toHaveCount(1)
  await expect(ov.locator('.fread > .frmeta')).toBeInViewport({ ratio: 1 })
  // …and it is never a heading over nothing (M-3): the first storyboard row sits inside the region,
  // near the top (below the sticky toolbar, never pushed off)
  const firstTop = await scroll.evaluate(el => {
    const row = el.querySelector('.sbrow') as HTMLElement
    return row.getBoundingClientRect().top - el.getBoundingClientRect().top
  })
  expect(firstTop, 'at the 640 floor the first storyboard row sits inside the region').toBeGreaterThanOrEqual(0)
  expect(firstTop, 'at the 640 floor the first storyboard row is near the top, not pushed off').toBeLessThan(140)
  await page.setViewportSize({ width: 1440, height: 900 })
})

// (TWO WHOLE TESTS WERE DELETED HERE ON 2026-09-05, CLAUDE.md rule 4 — a test of a retired
// feature is deleted with it, and the human retired the SKETCH.
//
//   · "the Expected picture fills the Focus slot: loop, stills per beat, grey when the text moves"
//     proved the drawn slot end to end: a committed spec/<screen>/viz/R1.svg rendered per row, one
//     park point per row, the `data-vizhash` stamp, and the quiet grey + "redrawn at the next fold"
//     banner once the prd text moved past the drawing's pin. Every surface it named is gone — the
//     derive pass, `data-vizhash`, the drawing's own staleness. The one fact that outlives it, that
//     a requirement with NO picture keeps the honest "no Expected yet" line, is proven by board R18's
//     second beat (spec/board/test.spec.ts) on the real pipeline rather than on a fixture.
//   · "reduced motion parks every drawn row: the beats loop, and under reduce nothing does" proved
//     that a drawn beat cell carries `data-loop` and drops it under prefers-reduced-motion. Only the
//     SKETCH's cell ever looped (client.js `frameCell`); it is deleted, nothing in the storyline
//     sets `data-loop` any more, and the replica cell beside a proof is stepped by the row's one
//     stepper, never by an animation. Asserting the absence here would pin a class that no code can
//     produce — which is not an accessibility guarantee, only a green over nothing.)

// ── the board RENDERS Changed (board R4's fifth word) ──────────────────────
// The board's own requirements are never naturally Changed (a fresh fold re-stamps their pins from
// the current text), so these tests inject the state: a screen whose R1 is Passed in its folded
// coverage but whose `provenHashes` pin does not match the current body. The index is written to
// disk because build() reads it there; each test restores the exact prior bytes in `finally` (the
// state guard does not snapshot the results index — it is meant to fold, so we put it back ourselves).
const INDEX = join(SPEC, '_results-index.json')

function injectIndex (name: string, entry?: any) {
  const before = existsSync(INDEX) ? readFileSync(INDEX, 'utf8') : null
  const idx = before ? JSON.parse(before) : {}
  idx[name] = entry || (changedResult(name) as any)[name]
  writeFileSync(INDEX, JSON.stringify(idx, null, 2) + '\n')
  return () => { if (before == null) rmSync(INDEX, { force: true }); else writeFileSync(INDEX, before) }
}

// a fresh, current PASS for R1 that also carries the D2 evidence harvest's index entry — the
// deterministic input the Focus media pane derives its default from (status × beat count)
const passWithEvidence = (name: string) => ({
  ranAt: Date.now() + 100000, total: 1, failed: 0,
  tests: [{ title: 'x', ok: true, reqs: { [`${name}:R1`]: 'pass' } }],
  evidence: {
    R1: {
      before: `spec/${name}/evidence/R1.before.png`,
      after: `spec/${name}/evidence/R1.after.png`,
      clip: null, window: null, at: '2026-08-21T00:00:00.000Z'
    }
  }
})

test('renders — a Changed requirement wears the indigo changed chip, never a plain Passed', async ({ page }) => {
  const { name } = makeScreen('probe-changed')
  const restore = injectIndex(name)
  try {
    const dt = page.locator('.dt[data-screen="' + name + '"]:not([hidden])')
    await settleAt(page, '/#/' + name, dt.locator('.viewseg'))
    // A plain render guard — NOT a checkReq coverage tag. board:R4 is proven by the board's OWN R4 test;
    // a cross-screen checkReq('board:R4') here made R4 proven-via-cross-tag while the board's own tag
    // lagged in the pane, breaking that test's per-pane untaggedProven self-check (the very case its
    // comment warned about). These assertions still fail loudly if the Changed render breaks (rule 2),
    // exactly like the behavior-block render test above, which also guards a render without tagging.
    {
      // FOCUS (the default view): the reader chip carries the fifth word, in the changed class
      await expect(dt.locator('.fread .fchip')).toHaveText('◈ Changed')
      await expect(dt.locator('.fread .fchip')).toHaveClass(/changed/)
      // the baked source row derives status "changed" and wears the chip with its own mark —
      // hue never alone (design rule), so the mark class is asserted too
      const req = dt.locator('.reqpane .req[data-r="R1"]')
      await expect(req).toHaveAttribute('data-status', 'changed')
      await expect(req.locator('.h .chip.changed .mark.c')).toHaveCount(1)
      await expect(req.locator('.h .chip.ok')).toHaveCount(0)          // NOT a plain Passed chip
      // THE DRIFT IS SAID BY THE CHIP, and only by it (the human, 2026-09-02: the TEST ✓ <name> group
      // came off the title row — "can we remove the test ✓ Tsumiki — the full flow (R1–R8)"). Until
      // then a second MARK beside the test's name carried the ✓ and spelled the drift on hover; the
      // reader's one word for a Changed requirement is the ◈ Changed chip on this very row now. A
      // Changed requirement WAS proved by a real passing test, so it may never read the
      // self-contradictory "not passed yet" — that leg stands unchanged, and the mark is asserted GONE
      // rather than quietly dropped (the R8 assert-the-gone precedent).
      const fptop = dt.locator('.focusov .frmeta .fptop')                   // on the TITLE ROW since 2026-09-02
      await expect(dt.locator('.focusov .fread .frmeta .fchip')).toHaveText('◈ Changed')
      await expect(dt.locator('.focusov .fread .frmeta .fchip')).toHaveClass(/\bchanged\b/)
      await expect(fptop.locator('.fpm')).toHaveCount(0)                   // no mark to agree or disagree
      await expect(fptop.locator('.fpname')).toHaveCount(0)                // and no test name on the row
      await expect(dt.locator('.focusov .fread')).not.toContainText('not passed yet')
      await expect(fptop.locator('.fpacts > .runone')).toBeVisible()       // the covering test's Run still rides it
      // the drift is said in WORDS, and only in words (2026-09-02): the media band that carried the
      // "pinned era" bar and the watermark over it is gone with the reader's video, so the ◈ Changed
      // chip asserted just above IS the Changed cue in the reader — assert the retired surfaces are
      // absent rather than quietly dropping the leg (the R8 assert-the-gone precedent)
      await expect(dt.locator('.focusov .feval .fmedia')).toHaveCount(0)
      await expect(dt.locator('.focusov .feval .wmark')).toHaveCount(0)
      await expect(dt.locator('.focusov .fread .stalenote')).toHaveCount(0)   // no note under the name — there is no "under"
      // LIST: the row's state cell spells the fifth word out — never a plain Passed
      await dt.locator('.viewseg .vseg[data-view="grid"]').click()
      const row = dt.locator('.gridview .lst-card[data-r="R1"]')
      await expect(row.locator('.lst-head .lpf')).toHaveText(/◈ Changed/)
      await expect(row.locator('.lst-head .lpf')).toHaveClass(/changed/)
      await expect(row.locator('.lst-head .lpf.passed')).toHaveCount(0)
      // …and the open row (the Focus body itself) says the drift the same way its Focus twin does:
      // the ◈ Changed chip on its title row, with no mark beside it (2026-09-02, the human)
      await row.locator('.lst-head').click()
      await expect(row.locator('.lst-body .fread .frmeta .fchip')).toHaveText('◈ Changed')
      await expect(row.locator('.lst-body .fread .frmeta .fchip')).toHaveClass(/\bchanged\b/)
      await expect(row.locator('.lst-body .frmeta .fptop .fpm')).toHaveCount(0)
    }
  } finally { restore() }
})

test('renders — the home banner counts a Changed requirement as drift', async ({ page }) => {
  const { name } = makeScreen('probe-changed-banner')
  const restore = injectIndex(name)
  try {
    const card = page.locator('#home .card[data-screen="' + name + '"]')
    await settleAt(page, '/', card)
    // the drift banner names the changed count — "… 1 changed since their proof"
    await expect(page.locator('.clear')).toContainText('1 changed since their proof')
  } finally { restore() }
})

// THE "NEED A LOOK" STRIP (Task 8, the frozen mockup 2026-08-17): with anything failed or changed
// the strip reads `N need a look · X failed · Y changed since their proof — … Open <id> →`, the link
// a deep link into the FIRST one's Focus. Both states injected at once so the counts and the sum are
// all asserted together (the board's own tree is never naturally failed or changed on a green fold).
test('renders — the home strip counts what needs a look and deep-links the first one', async ({ page }) => {
  const bad = makeScreen('probe-attn-fail')
  const chg = makeScreen('probe-attn-changed')
  const failEntry = { ranAt: Date.now() + 100000, total: 1, failed: 1,
    tests: [{ title: 'x', ok: false, error: 'expected 2 · got 1', reqs: { [`${bad.name}:R1`]: 'fail' } }] }
  const restoreA = injectIndex(bad.name, failEntry)
  const restoreB = injectIndex(chg.name)
  try {
    const card = page.locator('#home .card[data-screen="' + chg.name + '"]')
    await settleAt(page, '/', card)
    const strip = page.locator('.clear.attn')
    await expect(strip).toHaveCount(1)
    // the two counts named, and their SUM as the headline — the probes are the only failed/changed
    // requirements on a green tree, but a stale dogfood fold may add its own: read the parts and
    // check the sum, so the assertion bites on the arithmetic and never on a lucky tree
    await expect(strip).toContainText(/\d+ failed/)
    await expect(strip).toContainText(/\d+ changed since their proof/)
    const txt = (await strip.textContent()) || ''
    const need = Number((/(\d+) need a look/.exec(txt) || [])[1])
    const failed = Number((/(\d+) failed/.exec(txt) || [])[1])
    const changed = Number((/(\d+) changed since/.exec(txt) || [])[1])
    expect(failed).toBeGreaterThanOrEqual(1)
    expect(changed).toBeGreaterThanOrEqual(1)
    expect(need, 'need a look = failed + changed').toBe(failed + changed)
    // "Open R1 →" deep-links the FIRST requirement that needs a look into its Focus reader
    const link = strip.locator('a.qopen')
    await expect(link).toHaveText(/^Open R\d+ →$/)
    const href = await link.getAttribute('href')
    expect(href).toMatch(/^#\/[a-z0-9_-]+\/R\d+$/)
    await link.click()
    const scr = href!.split('/')[1]
    const rid = href!.split('/')[2]
    const dt = page.locator('.dt[data-screen="' + scr + '"]:not([hidden])')
    await expect(dt.locator('.focusov .fread .frmeta .fid')).toHaveText(rid)
    await expect(dt.locator('.focusov .fread .fchip')).toHaveText(/Failed|Changed/)
  } finally { restoreB(); restoreA() }
})
