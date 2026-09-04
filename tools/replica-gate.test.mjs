// tools/replica-gate.test.mjs — THE REPLICA GATE's pure half (tools/replica-gate.mjs), on two plain
// skeletons exactly the way tools/layout-walk.test.mjs pins the walk that produces them.
//
// Phase 3's whole claim is "the replica LOOKS like the app" — and a claim nobody measures is a
// decoration. The measurement is: render the captured replica back, walk it with the SAME walk that
// measured the live page, and demand every box and word the live skeleton recorded inside the scene
// root be found again. What that demand actually means is decided here, on fixtures, not in a
// browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GATE_TOL, replicaGaps, claimGaps, replicaAttrs, withReplicaAttrs, textOf, replicaNote, GATE_MAX_GAPS, GATE_BYTE_RESERVE } from './replica-gate.mjs'

// ── the fixture the brief names: six elements, one of them outside the region ────────────────────
// (a header word · a button with the focus · two row words · a painted divider · a leaf outside)
const REGION = { x: 100, y: 100, w: 600, h: 300 }
const LIVE = () => ({
  w: 1440,
  h: 900,
  ring: { x: 120, y: 150, w: 90, h: 30 },
  els: [
    { x: 110, y: 110, w: 200, h: 24, kind: 'heading', text: 'All tasks' },
    { x: 120, y: 150, w: 90, h: 30, kind: 'button', text: 'Archive', focus: true },
    { x: 120, y: 200, w: 300, h: 20, kind: 'text', text: 'Pay the electricity bill' },
    { x: 120, y: 240, w: 300, h: 20, kind: 'text', text: 'Renew passport' },
    { x: 110, y: 280, w: 560, h: 14, kind: 'container', bd: '220,220,220' },
    { x: 900, y: 600, w: 200, h: 20, kind: 'text', text: 'Far away, outside the scene' }
  ]
})
// the replica, walked back in the SAME viewport frame — a faithful one is the live skeleton again
const REP = () => ({ w: 1440, h: 900, ring: { x: 120, y: 150, w: 90, h: 30 }, els: LIVE().els.map(e => ({ ...e })) })

test('an identical replica has no gaps at all', () => {
  assert.deepEqual(replicaGaps(LIVE(), REP(), REGION), [])
})

test('a row word the replica dropped is one missing-text gap, and only one', () => {
  const rep = REP()
  rep.els = rep.els.filter(e => e.text !== 'Renew passport')
  const gaps = replicaGaps(LIVE(), rep, REGION)
  assert.equal(gaps.length, 1, 'one gap per live element, no cascade')
  assert.equal(gaps[0].kind, 'missing-text')
  assert.equal(gaps[0].what, 'Renew passport')
  assert.deepEqual([gaps[0].x, gaps[0].y, gaps[0].w, gaps[0].h], [120, 240, 300, 20], 'named where the app had it')
})

test('a row word the replica put somewhere else is moved-text, never missing', () => {
  const rep = REP()
  rep.els[3] = { ...rep.els[3], y: 243 }
  const gaps = replicaGaps(LIVE(), rep, REGION)
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].kind, 'moved-text')
  assert.equal(gaps[0].what, 'Renew passport')
})

test('the ring must come back as the ring — a replica that lost the focus is missing-focus', () => {
  const rep = REP()
  rep.els[1] = { ...rep.els[1], focus: undefined }
  delete rep.els[1].focus
  const gaps = replicaGaps(LIVE(), rep, REGION)
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].kind, 'missing-focus')
  assert.equal(gaps[0].what, 'ring')
})

test('half-pixel rounding between two renderings of the same font is not a gap — 1.4 px is inside GATE_TOL', () => {
  assert.equal(GATE_TOL, 1.5)
  const rep = REP()
  rep.els[2] = { ...rep.els[2], x: 121.4, y: 201.4 }
  assert.deepEqual(replicaGaps(LIVE(), rep, REGION), [], 'a sub-pixel shift is the same box')
  const far = REP()
  far.els[2] = { ...far.els[2], x: 122, y: 202 }
  assert.equal(replicaGaps(LIVE(), far, REGION)[0].kind, 'moved-text', '2 px is not')
})

test('a painted box with no words must come back too — else missing-box, named by its kind', () => {
  const rep = REP()
  rep.els = rep.els.filter(e => e.kind !== 'container')
  const gaps = replicaGaps(LIVE(), rep, REGION)
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].kind, 'missing-box')
  assert.equal(gaps[0].what, 'container')
})

test('an UNPAINTED wordless box is not a gap — the photograph does not show it either', () => {
  const live = LIVE()
  live.els.push({ x: 130, y: 300, w: 100, h: 40, kind: 'container' })   // no bg, no border, no words
  assert.deepEqual(replicaGaps(live, REP(), REGION), [])
})

test('what lies outside the scene root is not the replica\'s business', () => {
  const rep = REP()
  rep.els = rep.els.filter(e => e.x < 800)          // the far leaf is not in the replica at all
  assert.deepEqual(replicaGaps(LIVE(), rep, REGION), [])
})

test('a fleck below the walk\'s own size floor is not gated', () => {
  const live = LIVE()
  live.els.push({ x: 130, y: 300, w: 8, h: 8, kind: 'container', bg: '0,0,0' })
  assert.deepEqual(replicaGaps(live, REP(), REGION), [])
})

test('the gap list is bounded — opts.max, defaulting to 40', () => {
  const live = LIVE()
  for (let i = 0; i < 60; i++) live.els.push({ x: 120, y: 100 + i, w: 40, h: 16, kind: 'text', text: 'w' + i })
  assert.equal(replicaGaps(live, REP(), REGION).length, 40)
  assert.equal(replicaGaps(live, REP(), REGION, { max: 5 }).length, 5)
})

test('one replica element may answer for two live elements — duplicated words are legal', () => {
  const live = LIVE()
  live.els.push({ x: 120, y: 200, w: 300, h: 20, kind: 'text', text: 'Pay the electricity bill' })
  assert.deepEqual(replicaGaps(live, REP(), REGION), [])
})

test('the replica\'s own extra words are never a gap — the gate reads live → replica only', () => {
  const rep = REP()
  rep.els.push({ x: 300, y: 320, w: 60, h: 18, kind: 'text', text: 'Undo' })
  assert.deepEqual(replicaGaps(LIVE(), rep, REGION), [])
})

// ── the claim gate: the Expected must actually CARRY what the requirement asked for ──────────────
test('claimGaps names every failed claim whose expected value the Expected replica does not carry', () => {
  const claims = [
    { label: 'the counter', expected: '5', got: '4', ok: false },
    { label: 'the row', expected: 'Pay the electricity bill', got: '', ok: false, missing: true },
    { label: 'the title', expected: 'All tasks', got: 'All tasks', ok: true }
  ]
  const gaps = claimGaps('All tasks 5 Renew passport', claims)
  assert.equal(gaps.length, 1, 'the carried one and the passing one are not gaps')
  assert.equal(gaps[0].kind, 'missing-claim')
  assert.equal(gaps[0].what, 'Pay the electricity bill')
})

test('claimGaps reads collapsed text on both sides, and an empty expectation claims nothing', () => {
  assert.deepEqual(claimGaps('a  b\n c', [{ expected: 'a b c', got: '', ok: false }]), [])
  assert.deepEqual(claimGaps('', [{ expected: '', got: 'x', ok: false }]), [])
  assert.deepEqual(claimGaps('', []), [])
  assert.deepEqual(claimGaps('', null), [])
})

// ── the root's data attributes: read, written, and read back ─────────────────────────────────────
const ROOT = '<style>.rep .r0{color:red}</style>\n<div class="rep r0" data-replica-kit="replica-1" ' +
  'data-replica-region="100 100 600 300" data-replica-side="expected" ' +
  'data-claims="[{&quot;expected&quot;:&quot;Tom &amp; Jerry&quot;,&quot;got&quot;:&quot;&quot;,&quot;ok&quot;:false}]" ' +
  'style="position:relative"><span class="r1">Tom &amp; Jerry</span></div>'

test('replicaAttrs reads the root\'s data attributes, entities decoded', () => {
  const a = replicaAttrs(ROOT)
  assert.equal(a.kit, 'replica-1')
  assert.deepEqual(a.region, { x: 100, y: 100, w: 600, h: 300 })
  assert.equal(a.side, 'expected')
  assert.equal(a.layout, '')
  assert.deepEqual(a.gaps, [])
  assert.equal(a.truncated, false)
  assert.equal(a.claims.length, 1)
  assert.equal(a.claims[0].expected, 'Tom & Jerry', 'the quotes and the ampersand survive the round trip')
})

test('withReplicaAttrs writes the pin and the gaps, and replaces them rather than doubling them', () => {
  const gaps = [{ kind: 'missing-text', what: 'a "quoted" & <angled> word', x: 1, y: 2, w: 3, h: 4 }]
  const once = withReplicaAttrs(ROOT, { layout: 'abc123', gaps })
  const back = replicaAttrs(once)
  assert.equal(back.layout, 'abc123')
  assert.deepEqual(back.gaps, gaps)
  assert.equal(back.kit, 'replica-1', 'the attributes it did not write are untouched')
  const twice = withReplicaAttrs(once, { layout: 'def456', gaps: [] })
  assert.equal((twice.match(/data-replica-layout=/g) || []).length, 1)
  assert.equal((twice.match(/data-replica-gaps=/g) || []).length, 1)
  assert.equal(replicaAttrs(twice).layout, 'def456')
  assert.deepEqual(replicaAttrs(twice).gaps, [])
})

test('a truncated replica says so, and replicaAttrs reads it', () => {
  const t = ROOT.replace('data-replica-kit', 'data-replica-truncated="1" data-replica-kit')
  assert.equal(replicaAttrs(t).truncated, true)
})

test('replicaAttrs on markup with no replica root is empty rather than a throw', () => {
  const a = replicaAttrs('<div>not a replica</div>')
  assert.equal(a.kit, '')
  assert.equal(a.region, null)
  assert.deepEqual(a.gaps, [])
})

test('textOf is the body\'s words only — the style block, the comment and every attribute are gone', () => {
  const html = '<!-- specboard replica-1 · todo:R9 b1 after · Expected -->\n' + ROOT
  const t = textOf(html)
  assert.equal(t, 'Tom & Jerry')
  assert.ok(!/color:red/.test(t), 'the sheet is not text')
  assert.ok(!/data-claims/.test(t), 'nor is an attribute — which is what makes the claim gate mean something')
  assert.ok(!/specboard/.test(t), 'nor the file\'s own comment header')
})

// ── what the FOLD records about a landed replica ─────────────────────────────────────────────────
test('replicaNote is what a folded moment says about its replica: how many gaps, and whether it was gated at all', () => {
  const gaps = [{ kind: 'missing-text', what: 'Undo', x: 1, y: 2, w: 3, h: 4 }]
  const gated = withReplicaAttrs(ROOT, { layout: 'abc', gaps })
  // the shape grew in phase 4a (the pin + the truncation word — see below); the counts are unchanged
  assert.deepEqual(replicaNote(gated), { gaps: 1, gated: true, list: gaps, pin: 'abc', trunc: false })
  assert.deepEqual(replicaNote(ROOT), { gaps: 0, gated: false, list: [], pin: '', trunc: false })
})

test('replicaNote counts a truncated capture as a gap of its own — it can never be a likeness', () => {
  const t = withReplicaAttrs(ROOT.replace('data-replica-kit', 'data-replica-truncated="1" data-replica-kit'),
    { layout: 'abc', gaps: [] })
  const note = replicaNote(t)
  assert.equal(note.gaps, 1)
  assert.equal(note.list[0].kind, 'truncated')
})

// ── PHASE 4a (2026-09-03): the board's stale banner reads the REPLICA's reasons ──────────────────
// The Focus reader's one banner names each way the picture stops being true, and two of them are
// properties of the file the fold just landed rather than of anything the board can re-derive
// cheaply: the PIN it was gated against (so a later build can see the harvest move past it without
// re-reading 8 MB of committed html) and whether the capture ran out of BYTES (a truncation is a
// gap, but the banner says it in its own words — a part of a component is a different complaint
// from a box that did not match).
test('replicaNote carries the pin it was gated against, so a later build can see the harvest move past it', () => {
  const gated = withReplicaAttrs(ROOT, { layout: 'a1b2c3d4e5f60718', gaps: [] })
  assert.equal(replicaNote(gated).pin, 'a1b2c3d4e5f60718')
  assert.equal(replicaNote(ROOT).pin, '', 'an ungated replica has no pin to report')
})
test('replicaNote says truncation in its own word too — the banner names it, not just the gap count', () => {
  const t = withReplicaAttrs(ROOT.replace('data-replica-kit', 'data-replica-truncated="1" data-replica-kit'),
    { layout: 'abc', gaps: [] })
  assert.equal(replicaNote(t).trunc, true)
  assert.equal(replicaNote(withReplicaAttrs(ROOT, { layout: 'abc', gaps: [] })).trunc, false)
})

// ── FIX ROUND 1, C2: the gate could not see a box the app never had ─────────────────────────────
// The capture leaked its own probe frame into every body-rooted replica and `replicaGaps` was blind
// to it, because it only ever asked live → replica. A big PAINTED box in the replica that no live
// element stands on is a picture of something the app does not show — the same defect class, from
// the other side.
test('a painted box the app never had is an extra-box gap', () => {
  const rep = REP()
  rep.els.push({ x: 200, y: 300, w: 120, h: 80, kind: 'container', bg: '255,0,0' })
  const gaps = replicaGaps(LIVE(), rep, REGION)
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].kind, 'extra-box')
  assert.deepEqual([gaps[0].x, gaps[0].y, gaps[0].w, gaps[0].h], [200, 300, 120, 80])
})

test('extra-box is bounded: small boxes, unpainted boxes and anything outside the region are not gaps', () => {
  const rep = REP()
  rep.els.push({ x: 200, y: 300, w: 30, h: 80, kind: 'container', bg: '255,0,0' })      // under 40 wide
  rep.els.push({ x: 200, y: 320, w: 120, h: 80, kind: 'container' })                    // paints nothing
  rep.els.push({ x: 900, y: 700, w: 200, h: 200, kind: 'container', bg: '0,0,255' })    // outside the scene
  assert.deepEqual(replicaGaps(LIVE(), rep, REGION), [])
})

test('extra-box holds its tongue when the live walk was at its own cap — it did not measure everything', () => {
  const live = LIVE()
  for (let i = 0; i < 360; i++) live.els.push({ x: 2000, y: 2000, w: 10, h: 10, kind: 'container' })
  const rep = REP()
  rep.els.push({ x: 200, y: 300, w: 120, h: 80, kind: 'container', bg: '255,0,0' })
  assert.deepEqual(replicaGaps(live, rep, REGION), [], 'a full skeleton is not proof the app lacks a box')
})

test('a replica box that DOES stand on a live element is no gap — the ordinary case', () => {
  const rep = REP()
  rep.els.push({ x: 110, y: 280, w: 560, h: 14, kind: 'container', bg: '255,255,255' })  // the divider's own box
  assert.deepEqual(replicaGaps(LIVE(), rep, REGION), [])
})

// ── FIX ROUND 1, I1: THE WORDS RULE IS A WORD RUN, NOT A SUBSTRING ──────────────────────────────
// The containment relaxation exists for a real case — a ::before materialised as a span makes the
// element that reads `Add` on the live page read `+ Add` in the replica at the very same box. But
// plain containment is weakest exactly where requirements live: a live element reading `5` was
// satisfied by a replica reading `15` at the same box, i.e. a WRONG asserted value passing the
// likeness gate. The live text must occur as its own run — bounded by the ends of the string or by
// something that is not a letter, a digit or an underscore.
test('a short value is matched as its own word, never inside a longer one', () => {
  const live = { w: 1440, h: 900, els: [{ x: 120, y: 200, w: 40, h: 20, kind: 'text', text: '5' }] }
  const at = { x: 120, y: 200, w: 40, h: 20, kind: 'text' }
  const wrong = { w: 1440, h: 900, els: [{ ...at, text: '15' }] }
  const also = { w: 1440, h: 900, els: [{ ...at, text: '50' }] }
  const right = { w: 1440, h: 900, els: [{ ...at, text: '5' }] }
  const run = { w: 1440, h: 900, els: [{ ...at, text: 'To do 5' }] }
  assert.equal(replicaGaps(live, wrong, REGION)[0].kind, 'missing-text', '15 does not contain the value 5')
  assert.equal(replicaGaps(live, also, REGION)[0].kind, 'missing-text', 'nor does 50')
  assert.deepEqual(replicaGaps(live, right, REGION), [])
  assert.deepEqual(replicaGaps(live, run, REGION), [], 'but its own run inside a longer text does')
})

test('the case the relaxation exists for: a pseudo-element\'s content in front of the words', () => {
  const live = { w: 1440, h: 900, els: [{ x: 120, y: 200, w: 60, h: 20, kind: 'button', text: 'Add' }] }
  const rep = { w: 1440, h: 900, els: [{ x: 120, y: 200, w: 60, h: 20, kind: 'button', text: '+ Add' }] }
  assert.deepEqual(replicaGaps(live, rep, REGION), [])
  const glued = { w: 1440, h: 900, els: [{ x: 120, y: 200, w: 60, h: 20, kind: 'button', text: 'Addendum' }] }
  assert.equal(replicaGaps(live, glued, REGION)[0].kind, 'missing-text', 'and not a word that merely starts the same')
})

test('the scene root is not an extra box — the live walk never measures the body it stands for', () => {
  // caught on the first harvest after extra-box landed: every body-rooted replica reported its own
  // root (`container at 0,0 1440x1890`). spec/_layout-walk.mjs walks doc.body's CHILDREN, so the
  // body itself is in no skeleton, ever — and the replica's root IS that body.
  const rep = REP()
  rep.els.unshift({ x: REGION.x, y: REGION.y, w: REGION.w, h: REGION.h, kind: 'container', bg: '253,252,249' })
  assert.deepEqual(replicaGaps(LIVE(), rep, REGION), [])
})

// ── FIX ROUND 2, item 1: A LIVE TEXT AT THE SKELETON'S OWN 48-CHAR CAP MAY END MID-WORD ──────────
// spec/_layout-walk.mjs's `clean()` hard-slices every measured text to 48 characters. Below the cap
// that is simply the whole word run and both ends stay bounded — but AT the cap the walk may have
// cut the string mid-word ("...grouped into are" was "areas" before the slice), and the run rule's
// right-boundary check then rejects the replica's own, uncut "areas" because 'e' and 'a' are both
// wordy. The census (init R2, 9 gaps) was entirely this: nine PRD sentences that happen to run past
// 48 characters. Below the cap nothing changes — a short, deliberately-typed value must still be
// bounded on BOTH ends (the '5'/'15' case stays caught).
test('a live text exactly at the skeleton\'s 48-char cap may end mid-word — the cut, not a false gap', () => {
  const cut = 'Search across requirement text, grouped into are'
  assert.equal(cut.length, 48, 'the fixture is the real cap-cut PRD sentence, not a guess')
  const live = { w: 1440, h: 900, els: [{ x: 139, y: 129, w: 252, h: 17, kind: 'text', text: cut }] }
  const rep = { w: 1440, h: 900, els: [{ x: 139, y: 129, w: 252, h: 17, kind: 'text', text: 'Search across requirement text, grouped into areas' }] }
  assert.deepEqual(replicaGaps(live, rep, REGION), [], 'the replica\'s own uncut word completes the cut one')
})

test('…but BELOW the cap both ends still have to be bounded — a short value stays caught', () => {
  const live = { w: 1440, h: 900, els: [{ x: 120, y: 200, w: 40, h: 20, kind: 'text', text: '5' }] }
  const rep = { w: 1440, h: 900, els: [{ x: 120, y: 200, w: 40, h: 20, kind: 'text', text: '15' }] }
  assert.equal(replicaGaps(live, rep, REGION)[0].kind, 'missing-text', 'a 1-char needle is nowhere near the cap')
})

test('a needle AT the cap still needs its START bounded — the relaxation is end-only', () => {
  const cap48 = 'x'.repeat(47) + 'e'                 // 48 chars, cut mid-word by construction
  assert.equal(cap48.length, 48)
  const live = { w: 1440, h: 900, els: [{ x: 120, y: 200, w: 40, h: 20, kind: 'text', text: cap48 }] }
  const glued = { w: 1440, h: 900, els: [{ x: 120, y: 200, w: 40, h: 20, kind: 'text', text: 'y' + cap48 + 'xtra' }] }
  assert.equal(replicaGaps(live, glued, REGION)[0].kind, 'missing-text',
    'glued to a wordy character on the LEFT is still not its own run — only the right end is relaxed')
})

// ── FIX ROUND 2, item 2: A LIVE ELEMENT TAGGED style/script/title/desc/metadata NEVER GATES ITS TEXT
// board R18: a focused svg's embedded <style> leaked its raw CSS as the element's own "text" (fixed
// at the source in spec/_layout-walk.mjs — an svg's textContent fallback is gone). This is the belt
// half of the belt-and-suspenders: even a skeleton carrying such a record (an older harvest, or a
// `tag` this module cannot fully trust) is never asked to produce a word no replica could honestly
// draw, because these tags are sanitised OUT of every replica (spec/_replica.mjs's DROP list).
test('a live element tagged style/script/etc never demands its text back — even if one somehow carries text', () => {
  const live = { w: 1440, h: 900, els: [{ x: 120, y: 200, w: 300, h: 20, kind: 'image', tag: 'style', text: '.wf0{animation:x 1s}' }] }
  const rep = { w: 1440, h: 900, els: [] }
  assert.deepEqual(replicaGaps(live, rep, REGION), [], 'no missing-text for a tag that paints nothing')
})

// ── FIX ROUND 2, item 4: replicaGaps' own default max is GATE_MAX_GAPS, not a bare literal ────────
// The caller (spec/_base.ts) reserves GATE_BYTE_RESERVE bytes off captureReplica's own budget so
// the file still fits once the gate's `data-replica-gaps` JSON is spliced in afterward — a reserve
// that can only stay honest if it is sized off the SAME number replicaGaps actually caps at.
test('replicaGaps defaults to exactly GATE_MAX_GAPS, so the byte reserve and the gap cap can never disagree', () => {
  const live = { w: 1440, h: 900, els: [] }
  for (let i = 0; i < GATE_MAX_GAPS + 20; i++) {
    live.els.push({ x: 120, y: 100 + i, w: 40, h: 16, kind: 'text', text: 'w' + i })
  }
  assert.equal(replicaGaps(live, { w: 1440, h: 900, els: [] }, REGION).length, GATE_MAX_GAPS)
  assert.ok(GATE_BYTE_RESERVE > 0)
})

// ── THE ROOT IS NOT ALWAYS A DIV (phase 6, 2026-09-04) ───────────────────────────────────────────
// A scene root whose tag renders standalone keeps that tag (spec/_replica.mjs ROOT_TAGS — a nav
// button around the badge a claim rang, on demo/todo). This regex used to demand `<div class="rep`,
// so such a file read as "not gated: no data-replica-layout" with no region at all — and with no
// region the CLI's word gate then demanded every text on the page back out of one component. The
// root's TAG is not what any of these rules are about.
const BTN_ROOT = '<style>.rep .r0{display:flex}</style>\n<button class="rep r0" data-replica-kit="replica-1" ' +
  'data-replica-region="16 124 197 37" data-ring-box="195 134 8 18" data-replica-side="actual" ' +
  'data-replica-layout="abc123" data-replica-gaps="[]" style="position:relative">' +
  '<span class="r4">All tasks</span><span class="r5" data-ring="1">6</span></button>'

test('replicaAttrs reads a root of any tag — a button scene root is still a replica root', () => {
  const a = replicaAttrs(BTN_ROOT)
  assert.equal(a.kit, 'replica-1')
  assert.deepEqual(a.region, { x: 16, y: 124, w: 197, h: 37 })
  assert.equal(a.layout, 'abc123', 'it was gated, and the pin is read')
  assert.deepEqual(a.gaps, [])
})

test('…and withReplicaAttrs re-stamps that root without turning it into a div', () => {
  const out = withReplicaAttrs(BTN_ROOT, { layout: 'def456', gaps: [] })
  assert.match(out, /<button class="rep r0"/, 'the root element is untouched')
  assert.equal(replicaAttrs(out).layout, 'def456')
  assert.equal((out.match(/data-replica-layout=/g) || []).length, 1, 'replaced, never doubled')
})

// ── AN ANCESTOR OF THE SCENE ROOT IS NOT A GAP (phase 6, 2026-09-04) ─────────────────────────────
// The region is the scene root's own rect, and `inRegion` is a RECTANGLE test with a 1.5px
// tolerance — so the root's own PARENT, one pixel bigger on each side, reads as "inside the region"
// and is then demanded back out of a file that can never contain it (it is the root's ancestor).
// board R13: a `.lst-card` container at 60,181 1320×41 around a `.lst-head` root at 61,182 1318×39,
// reported as `missing-box container` on an otherwise perfect replica. A box that ENCLOSES the
// region and is bigger than it is an ancestor, not a member of the picture.
test('replicaGaps skips a box that encloses the region — the root\'s own parent', () => {
  const region = { x: 61, y: 182, w: 1318, h: 39 }
  const root = { x: 61, y: 182, w: 1318, h: 39, kind: 'button', bg: '1,1,1' }
  const parent = { x: 60, y: 181, w: 1320, h: 41, kind: 'container', bg: '2,2,2' }
  const live = { w: 1440, h: 900, els: [parent, root] }
  const replica = { w: 1440, h: 900, els: [root] }
  assert.deepEqual(replicaGaps(live, replica, region), [])
})

test('…but a box the same size as the region is still checked — it may be the picture itself', () => {
  const region = { x: 61, y: 182, w: 1318, h: 39 }
  const filling = { x: 61, y: 182, w: 1318, h: 39, kind: 'row', bg: '3,3,3' }
  const live = { w: 1440, h: 900, els: [filling] }
  const gaps = replicaGaps(live, { w: 1440, h: 900, els: [] }, region)
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].kind, 'missing-box')
})

// ── AN ELEMENT INSIDE THE RECTANGLE AND OUTSIDE THE PICTURE (phase 6 fix round 2, I6) ────────────
// The three gap rows this fix round inherited (board R10.b1.v1, R18.b3.v2, R18.b4.v1) are one
// family: a toast, a set of pager dots, a fixed overlay — an element that OVERLAPS the captured
// rectangle but is not in the scene root's subtree, so no honest replica of that root can ever
// contain it. The region is a rectangle; the picture is a SUBTREE. Since the one-pass moment hands
// the walk the very root the capture used, the skeleton says which of its elements are in it
// (`inRoot`), and the gate asks that instead of guessing from geometry. A skeleton with no mark at
// all (a harvest from before this) is read exactly as it was: the rectangle decides.
test('a live element inside the region but OUTSIDE the scene root is not a gap (I6)', () => {
  const live = LIVE()
  live.rootMarked = 1
  for (const e of live.els) e.inRoot = 1
  live.els.push({ x: 300, y: 250, w: 120, h: 40, kind: 'text', text: 'Saved · undo', inRoot: 0 })
  const gaps = replicaGaps(live, REP(), REGION)
  assert.deepEqual(gaps, [], 'the toast overlapping the card is not the card\'s to show')
})

test('…and the same element INSIDE the root still gates (I6)', () => {
  const live = LIVE()
  live.rootMarked = 1
  for (const e of live.els) e.inRoot = 1
  live.els.push({ x: 300, y: 250, w: 120, h: 40, kind: 'text', text: 'Saved · undo', inRoot: 1 })
  const gaps = replicaGaps(live, REP(), REGION)
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].kind, 'missing-text')
})

test('…and an UNMARKED skeleton is read exactly as before (I6)', () => {
  const live = LIVE()
  live.els.push({ x: 300, y: 250, w: 120, h: 40, kind: 'text', text: 'Saved · undo' })
  assert.equal(replicaGaps(live, REP(), REGION).length, 1, 'no evidence about the subtree is not evidence of exclusion')
})
