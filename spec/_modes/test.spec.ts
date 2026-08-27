import { test, expect, checkReq } from '../_base'
import { readdirSync, rmSync, statSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readScreen } from '../../tools/spec-store.mjs'
import { reqHash, meaningText } from '../../tools/reqhash.mjs'
import { parseBehavior } from '../../tools/behavior.mjs'
import { deriveSchematic } from '../../tools/viz.mjs'
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
test('renders — a beats block leads the requirement, the List reads it, and the media pane derives from it', async ({ page }) => {
  // TWO beats (D1's chain), harvested evidence on disk, and a current PASS in the injected index —
  // the full deterministic input for the frozen-mockup Focus contract (board R13, 2026-08-21):
  // behavior leads, prose collapses, the List row carries the beat count, the gap strip counts the
  // untested R2, and the media pane defaults to the per-beat filmstrip for a passed 2-beat req.
  const body =
    '- **Given** a list with two items\n- **When** you press Clear\n- **Then** the list shows zero items\n' +
    '- **When** you press Undo\n- **Then** the two items return\n\n' +
    'Supporting prose under the shape.\n\n' +
    '## R2 — A prose-only requirement\n\nOnly prose here — no triple, so no block.'
  const { name, dir } = makeScreen('probe-behavior', body, { evidence: true })
  // a committed drawing (derived exactly as the viz pass does) so R1 leads with the STORYBOARD —
  // the behavior paired with its still (board R13, 2026-08-25 #2). R2 stays prose-only, no drawing.
  const d = deriveSchematic(parseBehavior(body))!
  mkdirSync(join(dir, 'viz'), { recursive: true })
  writeFileSync(join(dir, 'viz', 'R1.svg'), d.svg)
  const restore = injectIndex(name, passWithEvidence(name))
  try {
    const dt = page.locator('.dt[data-screen="' + name + '"]:not([hidden])')
    await settleAt(page, '/#/' + name, dt.locator('.viewseg'))

    // default FOCUS view: the STORYBOARD leads the reading card — each beat paired with its drawn
    // still, above the collapsed prose (board R13, 2026-08-25 #2 — the behavior and its drawing folded together)
    const fst = dt.locator('.fread .fstory')
    await expect(fst.locator('.sbrow')).toHaveCount(3)          // given + 2 × (When → Then)
    await expect(fst.locator('.sbrow .sbframe svg')).toHaveCount(3)  // a parked still paired into each row
    await expect(fst).toContainText('a list with two items')
    await expect(fst).toContainText('you press Undo')
    // THE STORYBOARD carries the beat NUMBERS (WHEN 1 / THEN 1 / WHEN 2 …) and a heavier rule opening
    // each beat after the first; the Given row is distinct (tinted) and carries no number
    await expect(fst.locator('.sbrow.beatstart')).toHaveCount(1)
    await expect(fst.locator('.sbrow').nth(2)).toHaveClass(/beatstart/)
    await expect(fst.locator('.sbk .bno')).toHaveText(['1', '1', '2', '2'])
    await expect(fst.locator('.sbrow.bgiven .sbk .bno')).toHaveCount(0)
    expect(await fst.locator('.sbwrap').evaluate(el => getComputedStyle(el).borderTopWidth), 'the block is bordered').toBe('1px')
    expect(await fst.locator('.sbrow.bgiven').evaluate(el => getComputedStyle(el).backgroundColor), 'the Given row is tinted').not.toBe('rgba(0, 0, 0, 0)')
    const rule1 = await fst.locator('.sbrow').nth(1).evaluate(el => parseFloat(getComputedStyle(el).borderTopWidth))
    const rule3 = await fst.locator('.sbrow').nth(2).evaluate(el => parseFloat(getComputedStyle(el).borderTopWidth))
    expect(rule3, 'a beat boundary rules heavier than a row').toBeGreaterThan(rule1)
    // …and the in-full toggle now lives in the card's PINNED FOOTER (Task 12 — supersedes fix
    // round 1 A-1's whole-column scroll: the beats region scrolls INSIDE the card instead, so the
    // toggle can never leave the viewport). Both of A-1's pre-click viewport checks are KEPT and
    // retargeted at the footer: at 900px and on a short 640px window alike, visible before ANY
    // interaction — Playwright auto-scrolls before a click, so only an explicit, pre-click
    // viewport check can see this
    await expect(dt.locator('.focusov .fread .ffoot .prose-t')).toBeInViewport({ ratio: 1 })
    await page.setViewportSize({ width: 1440, height: 640 })
    await expect(dt.locator('.focusov .fread .ffoot .prose-t')).toBeInViewport({ ratio: 1 })
    await page.setViewportSize({ width: 1440, height: 900 })
    // the PROSE is collapsed beneath the shape — one click unfolds the authored requirement in full
    await expect(dt.locator('.fread .fbody')).toBeHidden()
    await dt.locator('.fread .prose-t').click()
    await expect(dt.locator('.fread .fbody')).toContainText('Supporting prose under the shape.')

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

    // MEDIA (D2): a PASSED requirement with more than one beat defaults to the per-beat FILMSTRIP —
    // the harvested pair read as given → beat frames — under the stills · gif · video toolbar
    const media = dt.locator('.focusov .feval .fmedia')
    await expect(media.locator('.medbar button[data-m="frames"]')).toHaveClass(/\bon\b/)
    const strip = media.locator('.fmpanel[data-m="frames"] .fstrip')
    await expect(strip.locator('.fcell img')).toHaveCount(2)
    await expect(strip.locator('.fcap').nth(0)).toContainText('given')
    await expect(strip.locator('.fcap').nth(1)).toContainText('beat')
    // gif mode is the FRAME-STEPPER (Task 13): no clip file exists or is needed — the harvested
    // pair itself plays as frames, with an EXACT dot per frame and the count written out. This
    // entry carries no window (an old-harvest shape), so the equal-holds fallback paces it.
    await media.locator('.medbar button[data-m="clip"]').click()
    const stepper = media.locator('.fmpanel[data-m="clip"]')
    await expect(stepper.locator('.fsteps img')).toHaveCount(2)
    await expect(stepper.locator('.pdots .pd')).toHaveCount(2)
    await expect(stepper.locator('.fstepn')).toHaveText(/^\d \/ 2$/)
    await media.locator('.medbar button[data-m="frames"]').click()
    await page.evaluate(() => localStorage.removeItem('sbFocusMedia'))

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
    // an OPEN row is the Focus body itself, in place — same storyboard, same media pane
    await c1.locator('.lst-head').click()
    await expect(c1.locator('.lst-body .fread .fstory .sbrow')).toHaveCount(3)
    await expect(c1.locator('.lst-body .feval .fmedia .fcell img')).toHaveCount(2)
  } finally { restore() }
})

// ── Task 12: the schematic on first sight, the beats scrolling inside the card ──
// The human (2026-08-24): on first sight the schematic was not shown. The Focus page FITS the
// viewport — the requirement card's beats/prose region scrolls INTERNALLY (.fbeats) between a
// fixed card header and the pinned in-full footer, and the schematic card below keeps its
// intrinsic height, fully visible on load at a 640px-tall viewport and up. This fixture is TALL
// on purpose (three beats of wrapping text): under the superseded layout (the left column
// scrolling as one, Task 8 fix round 1) it pushed the drawing below the fold at BOTH heights.
test('renders — Focus fits the viewport: the schematic on first sight, the beats scrolling inside the card', async ({ page }) => {
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
  // a COMMITTED drawing, derived exactly as the viz pass does — the thing that must be on first sight
  const d = deriveSchematic(parseBehavior(body))!
  expect(d.archetype).toBe('toggle-and-recount')
  mkdirSync(join(dir, 'viz'), { recursive: true })
  writeFileSync(join(dir, 'viz', 'R1.svg'), d.svg)

  const dt = page.locator('.dt[data-screen="' + name + '"]:not([hidden])')
  await settleAt(page, '/#/' + name, dt.locator('.viewseg'))
  const ov = dt.locator('.focusov')
  const story = ov.locator('.fleft .fstory')
  const scroll = ov.locator('.fread .fscroll')

  // ON FIRST SIGHT, before ANY interaction: the storyboard LEADS with the Given row and its drawn
  // still — the paired drawing is on screen from the first paint (Task 12, generalized to the
  // storyboard) — and so is the pinned footer's Full-requirement toggle
  await expect(story.locator('.sbrow').first().locator('.sbframe svg')).toBeVisible()
  await expect(story.locator('.sbrow').first()).toBeInViewport({ ratio: 1 })
  await expect(ov.locator('.fread .ffoot .prose-t')).toBeInViewport({ ratio: 1 })
  // the story+prose region scrolls INTERNALLY (the storyboard packs the two old boxes into one, so
  // a real reading card fits without natural overflow — a tall spacer pushed IN proves the internal
  // scroll deterministically, the steps.ts R2 technique): the region really overflows, its scroll
  // really moves, the clipped cue lights, and moving it moves NEITHER the proof column nor the page
  // (dispatch a scroll so the clip sync runs — appending a child grows scrollHeight but not the
  // region's own box, so the ResizeObserver that normally fires syncClip on layout does not)
  await scroll.evaluate(el => { const sp = document.createElement('div'); sp.className = 'probe-spacer'; sp.style.cssText = 'min-height:4000px'; el.appendChild(sp); el.dispatchEvent(new Event('scroll')) })
  expect(await scroll.evaluate(el => el.scrollHeight > el.clientHeight), 'the reading region overflows').toBe(true)
  // the clipped edge carries the scroll cue — the hairline fade on the pinned footer (tokens only)
  await expect(ov.locator('.fread')).toHaveClass(/\bclipped\b/)
  expect(await ov.locator('.fread .ffoot').evaluate(el => getComputedStyle(el, '::before').backgroundImage),
    'the clip cue is a fade').toContain('linear-gradient')
  await scroll.evaluate(el => { el.scrollTop = 80 })
  expect(await scroll.evaluate(el => el.scrollTop), 'the reading region scrolled').toBeGreaterThan(0)
  expect(await ov.locator('.feval').evaluate(el => el.scrollTop), 'the proof did not move').toBe(0)
  // scrolled to the very end, the edge is no longer clipped — the cue clears honestly
  await scroll.evaluate(el => { el.scrollTop = el.scrollHeight })
  await expect(ov.locator('.fread')).not.toHaveClass(/\bclipped\b/)
  await scroll.evaluate(el => { el.scrollTop = 0; el.querySelector('.probe-spacer')?.remove() })
  // the PAGE itself never scrolls: the Focus page ends above the always-visible pager bar
  const vp = page.viewportSize()!
  const pb = (await ov.locator('.fpage').boundingBox())!
  expect(pb.y + pb.height, 'the Focus page fits the viewport').toBeLessThanOrEqual(vp.height)
  await expect(dt.locator('.dtfoot .fpager')).toBeInViewport()

  // at the 640px floor the storyboard STILL leads with the Given row's drawn still on first sight,
  // the footer still pinned — a drawing paired from the first paint at any height
  await page.setViewportSize({ width: 1440, height: 640 })
  await expect(story.locator('.sbrow').first().locator('.sbframe svg')).toBeVisible()
  await expect(ov.locator('.fread .ffoot .prose-t')).toBeInViewport({ ratio: 1 })
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

// ── the drawn schematic fills the Focus slot (requirement schematics, task 4) ──
// The schematic is AUTHORED-side content: derived once from the behavior text (tools/viz.mjs,
// pure), committed at spec/<screen>/viz/<id>.svg, hash-pinned — so this test needs no injected
// index at all. It proves the three contract points the brief names: the slot renders the drawn
// loop for a requirement whose committed drawing matches its text; loop · stills is a CLIENT-side
// preference (stills = the same drawing frozen per beat phase, nothing stored in the tree); and a
// drawing whose text has moved past it renders QUIET GREY with the dated ≠ note — honest, never a
// wrong picture. A requirement with no drawing keeps the placeholder line.
test('renders — the drawn schematic fills the Focus slot: loop, stills per beat, grey when the text moves', async ({ page }) => {
  const body =
    '- **Given** a list with two items\n- **When** you press Clear\n- **Then** the list shows zero items\n' +
    '- **When** you press Undo\n- **Then** the two items return\n\n' +
    'Prose under the shape.\n\n' +
    '## R2 — A prose-only requirement\n\nOnly prose — no behavior block, so no drawing to derive.'
  const { name, dir, prd } = makeScreen('probe-viz', body)
  // derive + commit the drawing EXACTLY as the viz pass does (tools/viz-derive.mjs): the SVG
  // carries its own data-viz-hash stamp, so enrichReqs reads it fresh
  const d = deriveSchematic(parseBehavior(body))!
  expect(d.archetype).toBe('press-and-clear')
  mkdirSync(join(dir, 'viz'), { recursive: true })
  writeFileSync(join(dir, 'viz', 'R1.svg'), d.svg)
  const vizat = d.svg.match(/data-viz-hash="(.{16})"/)![1].slice(0, 6)

  const dt = page.locator('.dt[data-screen="' + name + '"]:not([hidden])')
  await settleAt(page, '/#/' + name, dt.locator('.viewseg'))
  const schem = dt.locator('.focusov .fleft .fstory')

  // the STORYBOARD is the default: each beat paired with its drawn still — no placeholder line, no
  // stale banner (fresh); the derived hash rides the slot (data-vizhash) for traceability
  await expect(schem.locator('.storycap')).toContainText('schematic · the idea, not the real UI')
  await expect(schem).not.toContainText('no schematic drawn yet')
  await expect(schem).toHaveAttribute('data-vizhash', vizat)
  await expect(schem).not.toContainText('≠')
  await expect(schem.locator('.sbstale')).toHaveCount(0)          // fresh — no stale banner at all

  // STORYBOARD: given + one row per beat, NO toggle (the human, 2026-08-26) — the given is a parked
  // still, each When->Then row LOOPS its own beat
  await expect(schem.locator('.medbar')).toHaveCount(0)
  await expect(schem.locator('[data-sm]')).toHaveCount(0)
  await expect(schem.locator('.sbrow')).toHaveCount(3)            // given + 2 beats
  await expect(schem.locator('.sbrow .sbframe svg')).toHaveCount(3)
  await expect(schem.locator('.sbrow').nth(0)).toHaveClass(/bgiven/)
  await expect(schem.locator('.sbrow').nth(1).locator('.sbtext')).toContainText('When')
  await expect(schem.locator('.sbrow').nth(1).locator('.sbtext')).toContainText('Then')
  await expect(schem.locator('.viz')).toHaveCount(0)             // no single whole-animation drawing
  await expect(schem.locator('.sbrow').nth(0).locator('.sbframe[data-loop]')).toHaveCount(0)  // given parked
  await expect(schem.locator('.sbframe[data-loop]')).toHaveCount(2)                           // both beats loop

  // reduced motion → every row is a parked still (no loops at all), so it needs no animation
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/' + name + '/R2')
  await page.goto('/#/' + name + '/R1')
  await expect(schem.locator('.sbrow')).toHaveCount(3)
  await expect(schem.locator('.sbframe[data-loop]')).toHaveCount(0)    // parked, not looping
  await page.emulateMedia({ reducedMotion: null })

  // a requirement with NO drawing keeps the honest placeholder line
  await page.goto('/#/' + name + '/R2')
  await expect(dt.locator('.focusov .fleft .fstory')).toContainText('no schematic drawn yet')

  // THE TEXT MOVES PAST THE DRAWING → quiet grey + the dated stale banner. The committed SVG stays
  // byte-identical; only prd.md changes — staleness is COMPUTED from the pin, never stored. A goto
  // between two hashes is a SAME-DOCUMENT navigation (the documented trap), so the rebuilt
  // board.html would never load — force a real reload, re-asserting build() per retry like settleAt.
  writeFileSync(join(dir, 'prd.md'), prd.replace('the list shows zero items', 'the list shows an empty state'))
  await expect(async () => {
    build()
    await page.reload()
    await expect(dt.locator('.viewseg')).toBeVisible({ timeout: 2000 })
    await expect(dt.locator('.reqpane .req[data-r="R1"] .schematic[data-stale="1"]')).toHaveCount(1, { timeout: 2000 })
  }).toPass({ timeout: 60000 })
  await page.goto('/#/' + name + '/R1')
  const stale = dt.locator('.focusov .fleft .fstory')
  await expect(stale).toHaveClass(/\bisstale\b/)
  await expect(stale.locator('.sbrow .sbframe svg')).toHaveCount(3)   // the old drawing, greyed per row — shown, not hidden
  await expect(stale.locator('.sbstale')).toBeVisible()
  await expect(stale.locator('.sbstale')).toContainText('stale — text changed')
  await expect(stale.locator('.sbstale')).toContainText('redrawn on the next viz pass')
  await expect(stale).toHaveAttribute('data-vizhash', vizat)      // the derived hash still rides the slot for traceability
})

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
      // the Focus proof header's MARK must AGREE with the chip — a Changed requirement WAS proved by a
      // real passing test, so it reads with the ✓ (pass) mark and names the drift on its own stale
      // note, never the self-contradictory "not passed yet". (2026-08-25: the proof header is the
      // covering test's NAME behind a pass/fail mark; the "proven by / covered by" WORD is gone.)
      const fptop = dt.locator('.focusov .feval .fptop')
      await expect(fptop.locator('.fpm')).toHaveClass(/\bpass\b/)          // ✓ — it WAS proved
      await expect(fptop.locator('.fpname')).not.toBeEmpty()               // the covering test's name
      await expect(dt.locator('.focusov .feval')).not.toContainText('not passed yet')
      await expect(dt.locator('.focusov .feval .stalenote')).toContainText('re-verify')
      // the MEDIA pane wears the pinned-era watermark (D2: changed = last proof media, watermarked)
      const media = dt.locator('.focusov .feval .fmedia')
      await expect(media.locator('.fmbar')).toContainText('pinned era')
      await expect(media.locator('.wmark')).toHaveCount(1)
      // LIST: the row's state cell spells the fifth word out — never a plain Passed
      await dt.locator('.viewseg .vseg[data-view="grid"]').click()
      const row = dt.locator('.gridview .lst-card[data-r="R1"]')
      await expect(row.locator('.lst-head .lpf')).toHaveText(/◈ Changed/)
      await expect(row.locator('.lst-head .lpf')).toHaveClass(/changed/)
      await expect(row.locator('.lst-head .lpf.passed')).toHaveCount(0)
      // …and the open row (the Focus body itself) names the drift on its proof line
      await row.locator('.lst-head').click()
      await expect(row.locator('.lst-body .feval .stalenote')).toContainText('re-verify')
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
