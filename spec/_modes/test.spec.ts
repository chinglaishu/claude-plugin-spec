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
function makeScreen (name: string, body = 'One behaviour, asserted by a test.', { extra = '', evidence = false } = {}) {
  const dir = join(SPEC, name); mkdirSync(dir, { recursive: true })
  const prd = `---\nscreen: ${name}\narea: Core\ntitle: ${name}\nroute: /${name}\n` +
    extra + `---\n\n## R1 — A first requirement\n\n${body}\n`
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
  const { name } = makeScreen('probe-behavior',
    '- **Given** a list with two items\n- **When** you press Clear\n- **Then** the list shows zero items\n' +
    '- **When** you press Undo\n- **Then** the two items return\n\n' +
    'Supporting prose under the shape.\n\n' +
    '## R2 — A prose-only requirement\n\nOnly prose here — no triple, so no block.',
    { evidence: true })
  const restore = injectIndex(name, passWithEvidence(name))
  try {
    const dt = page.locator('.dt[data-screen="' + name + '"]:not([hidden])')
    await settleAt(page, '/#/' + name, dt.locator('.viewseg'))

    // default FOCUS view: the behavior block LEADS the reading card, above the collapsed prose
    const fbeh = dt.locator('.fread .behavior')
    await expect(fbeh).toHaveCount(1)
    await expect(fbeh.locator('.brow')).toHaveCount(5)          // Given + 2 × (When → Then)
    await expect(fbeh).toContainText('a list with two items')
    await expect(fbeh).toContainText('you press Undo')
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
    // no clip was cut (no ffmpeg output in the index) — the gif mode says so honestly, never errors
    await media.locator('.medbar button[data-m="clip"]').click()
    await expect(media.locator('.fmpanel[data-m="clip"]')).toContainText('stills still stand')
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
    // an OPEN row is the Focus body itself, in place — same behavior block, same media pane
    await c1.locator('.lst-head').click()
    await expect(c1.locator('.lst-body .fread .behavior .brow')).toHaveCount(5)
    await expect(c1.locator('.lst-body .feval .fmedia .fcell img')).toHaveCount(2)
  } finally { restore() }
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
  const schem = dt.locator('.focusov .fleft .fschem')

  // the slot is FILLED: the drawn loop under the caption, the viz@hash note — no placeholder line
  await expect(schem.locator('.viz svg')).toHaveCount(1)
  await expect(schem.locator('.figcap')).toContainText('schematic · the idea, not the real UI')
  await expect(schem).not.toContainText('no schematic drawn yet')
  await expect(schem.locator('.figfoot')).toContainText('viz@' + vizat)
  await expect(schem.locator('.figfoot')).not.toContainText('≠')
  await expect(schem.locator('.staleov')).toHaveCount(0)          // fresh — no stale overlay at all

  // loop · stills: STILLS is the same drawing frozen per beat phase — given + one frame per beat —
  // and the choice is a client-side preference (localStorage), never stored in the tree
  await expect(schem.locator('.medbar button[data-sm="loop"]')).toHaveClass(/\bon\b/)
  await schem.locator('.medbar button[data-sm="stills"]').click()
  await expect(schem.locator('.sstills .sframe')).toHaveCount(3)  // given + 2 beats
  await expect(schem.locator('.sstills .sframe svg')).toHaveCount(3)
  await expect(schem.locator('.sstills .scap').nth(0)).toHaveText('given')
  await expect(schem.locator('.sstills .scap').nth(1)).toHaveText('beat 1 · then')
  await expect(schem.locator('.sstills .scap').nth(2)).toHaveText('beat 2 · then')
  expect(await page.evaluate(() => localStorage.getItem('sbSchemMode'))).toBe('stills')
  // clearing the preference restores the loop default on the next open — client-only, nothing baked
  await page.evaluate(() => localStorage.removeItem('sbSchemMode'))
  await page.goto('/#/' + name + '/R2')
  await page.goto('/#/' + name + '/R1')
  await expect(schem.locator('.medbar button[data-sm="loop"]')).toHaveClass(/\bon\b/)
  await expect(schem.locator('.viz svg')).toHaveCount(1)

  // reduced motion → the stepped form by default (D3): the same stills, no looping animation
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/' + name + '/R2')
  await page.goto('/#/' + name + '/R1')
  await expect(schem.locator('.sstills .sframe')).toHaveCount(3)
  await page.emulateMedia({ reducedMotion: null })

  // a requirement with NO drawing keeps the honest placeholder line
  await page.goto('/#/' + name + '/R2')
  await expect(dt.locator('.focusov .fleft .fschem')).toContainText('no schematic drawn yet')

  // THE TEXT MOVES PAST THE DRAWING → quiet grey + the dated "text ≠ viz" note. The committed SVG
  // stays byte-identical; only prd.md changes — staleness is COMPUTED from the pin, never stored.
  // A goto between two hashes is a SAME-DOCUMENT navigation (the documented trap), so the rebuilt
  // board.html would never load — force a real reload, re-asserting build() per retry like settleAt.
  writeFileSync(join(dir, 'prd.md'), prd.replace('the list shows zero items', 'the list shows an empty state'))
  await expect(async () => {
    build()
    await page.reload()
    await expect(dt.locator('.viewseg')).toBeVisible({ timeout: 2000 })
    await expect(dt.locator('.reqpane .req[data-r="R1"] .schematic[data-stale="1"]')).toHaveCount(1, { timeout: 2000 })
  }).toPass({ timeout: 60000 })
  await page.goto('/#/' + name + '/R1')
  const stale = dt.locator('.focusov .fleft .fschem')
  await expect(stale).toHaveClass(/\bisstale\b/)
  await expect(stale.locator('.viz svg')).toHaveCount(1)          // the old drawing, greyed — shown, not hidden
  await expect(stale.locator('.staleov')).toBeVisible()
  await expect(stale.locator('.staleov')).toContainText('stale — text changed')
  await expect(stale.locator('.staleov')).toContainText('redrawn on the next viz pass')
  await expect(stale.locator('.figfoot')).toContainText('≠')      // text@… ≠ viz@… — both pins named
  await expect(stale.locator('.figfoot')).toContainText('viz@' + vizat)
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
      // the Focus proof line must AGREE with the chip (client.js:401 invariant) — a Changed requirement
      // WAS proved by a real passing test, so it reads "proved by …" and names the drift, never the
      // self-contradictory "covered by … passed — not passed yet".
      const fpby = dt.locator('.focusov .feval .fpby')
      await expect(fpby).toContainText('proved by')
      await expect(fpby).not.toContainText('not passed yet')
      await expect(fpby).toContainText('re-verify')
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
      await expect(row.locator('.lst-body .feval .fpby')).toContainText('re-verify')
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
