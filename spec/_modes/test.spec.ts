import { test, expect, checkReq } from '../_base'
import { readdirSync, rmSync, statSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readScreen } from '../../tools/spec-store.mjs'
import { reqHash, meaningText } from '../../tools/reqhash.mjs'
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
function makeScreen (name: string, body = 'One behaviour, asserted by a test.', { extra = '' } = {}) {
  const dir = join(SPEC, name); mkdirSync(dir, { recursive: true })
  const prd = `---\nscreen: ${name}\narea: Core\ntitle: ${name}\nroute: /${name}\n` +
    extra + `---\n\n## R1 — A first requirement\n\n${body}\n`
  writeFileSync(join(dir, 'prd.md'), prd)
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
  await expect(async () => {
    build()
    await page.goto(url)
    await expect(ready).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 25000 })
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
test('renders — a Given/When/Then triple leads the requirement, and a prose-only one gets no block', async ({ page }) => {
  const { name } = makeScreen('probe-behavior',
    '- **Given** a list with two items\n- **When** you press Clear\n- **Then** the list shows zero items\n\n' +
    'Supporting prose under the shape.\n\n' +
    '## R2 — A prose-only requirement\n\nOnly prose here — no triple, so no block.')
  const dt = page.locator('.dt[data-screen="' + name + '"]:not([hidden])')
  await settleAt(page, '/#/' + name, dt.locator('.viewseg'))

  // default FOCUS view: the reader's clone of the baked row's .body carries the block untouched
  const fbeh = dt.locator('.fread .fbody .behavior')
  await expect(fbeh).toHaveCount(1)
  await expect(fbeh.locator('.brow')).toHaveCount(3)
  await expect(fbeh).toContainText('a list with two items')

  // THE BAKED SOURCE ROW (hidden — the Columns view is retired; count/text reads work there): the
  // block renders inside R1's .body, three labelled rows carrying the text
  const beh = dt.locator('.reqpane .req[data-r="R1"] .body .behavior')
  await expect(beh).toHaveCount(1)
  await expect(beh.locator('.brow')).toHaveCount(3)
  await expect(beh.locator('.brow').nth(0)).toContainText('a list with two items')
  await expect(beh.locator('.brow').nth(1)).toContainText('you press Clear')
  await expect(beh.locator('.brow').nth(2)).toContainText('the list shows zero items')
  // the shape LEADS: the block is the body's first element, above the rendered prose
  await expect(dt.locator('.reqpane .req[data-r="R1"] .body > :first-child')).toHaveClass(/behavior/)
  // the triple is drawn ONCE, as the shape — the prose renderer must NOT re-emit the same three
  // lines as a bullet list below it (renderBehavior draws it; the lead is stripped before renderBody)
  await expect(dt.locator('.reqpane .req[data-r="R1"] .body ul li', { hasText: 'a list with two items' })).toHaveCount(0)
  // …and the supporting prose that FOLLOWS the triple still renders, so the strip took the lead only
  await expect(dt.locator('.reqpane .req[data-r="R1"] .body')).toContainText('Supporting prose under the shape.')
  // and the prose-only requirement renders NO block — no wrapper, no empty grid
  await expect(dt.locator('.reqpane .req[data-r="R2"] .body .behavior')).toHaveCount(0)

  // GRID view (board R13, Grid replaced the compact List 2026-08-18): the behavior grid leads each
  // row with the same shape, read from the same r.behavior — R1's row carries the triple's text, and
  // prose-only R2 renders NO behavior cell content at all (the empty-string contract, a third time).
  await dt.locator('.viewseg .vseg[data-view="grid"]').click()
  const g1 = dt.locator('.gridview .grrow[data-r="R1"]')
  await expect(g1.locator('.behavior')).toHaveCount(1)
  await expect(g1).toContainText('a list with two items')
  await expect(g1).toContainText('you press Clear')
  await expect(g1).toContainText('the list shows zero items')
  await expect(dt.locator('.gridview .grrow[data-r="R2"] .behavior')).toHaveCount(0)
})

// ── the board RENDERS Changed (board R4's fifth word) ──────────────────────
// The board's own requirements are never naturally Changed (a fresh fold re-stamps their pins from
// the current text), so these tests inject the state: a screen whose R1 is Passed in its folded
// coverage but whose `provenHashes` pin does not match the current body. The index is written to
// disk because build() reads it there; each test restores the exact prior bytes in `finally` (the
// state guard does not snapshot the results index — it is meant to fold, so we put it back ourselves).
const INDEX = join(SPEC, '_results-index.json')

function injectIndex (name: string) {
  const before = existsSync(INDEX) ? readFileSync(INDEX, 'utf8') : null
  const idx = before ? JSON.parse(before) : {}
  idx[name] = (changedResult(name) as any)[name]
  writeFileSync(INDEX, JSON.stringify(idx, null, 2) + '\n')
  return () => { if (before == null) rmSync(INDEX, { force: true }); else writeFileSync(INDEX, before) }
}

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
      // the Focus proof line must AGREE with the chip (client.js:401 invariant) — a Changed requirement
      // WAS proved by a real passing test, so it reads "proved by …" and names the drift, never the
      // self-contradictory "covered by … passed — not passed yet".
      const fpby = dt.locator('.focusov .feval .fpby')
      await expect(fpby).toContainText('proved by')
      await expect(fpby).not.toContainText('not passed yet')
      await expect(fpby).toContainText('re-verify')
      // GRID: the row chip spells it out, and the proof line says the text moved — not "✓ proved by"
      await dt.locator('.viewseg .vseg[data-view="grid"]').click()
      const row = dt.locator('.gridview .grrow[data-r="R1"]')
      await expect(row.locator('.grchip')).toHaveText('◈ Changed')
      await expect(row.locator('.grchip')).toHaveClass(/changed/)
      await expect(row.locator('.chip.ok')).toHaveCount(0)
      await expect(row.locator('.grproof')).toContainText('text moved')
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
