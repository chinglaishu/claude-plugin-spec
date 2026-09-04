import test from 'node:test'
import assert from 'node:assert/strict'
import { extractCheckReqBlocks, hasValueAssertion, lintSource, perturbNumbers, functionBodies } from './proof-integrity.mjs'

const SRC = `
await checkReq('R5', async () => {
  await expect(page.locator('.iy1')).toHaveText('2,400,000')
})
await checkReq('x:R3', async () => {
  await expect(page.locator('.panel')).toBeVisible()
})`

test('extracts every checkReq block with its id and body', () => {
  const blocks = extractCheckReqBlocks(SRC)
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].id, 'R5')
  assert.match(blocks[0].body, /toHaveText/)
  assert.equal(blocks[1].id, 'x:R3')
})

test('a value assertion counts; existence alone does not', () => {
  assert.equal(hasValueAssertion("expect(x).toHaveText('2,400,000')"), true)
  assert.equal(hasValueAssertion('expect(n).toBe(42)'), true)
  assert.equal(hasValueAssertion('expect(rows).toHaveCount(3)'), true)
  assert.equal(hasValueAssertion('expect(el).toBeVisible()'), false)
  assert.equal(hasValueAssertion('expect(el).toBeAttached()'), false)
  assert.equal(hasValueAssertion('expect(rows).toHaveCount(0)'), false)
})

test('lintSource flags only the existence-only proof', () => {
  const rows = lintSource(SRC)
  assert.deepEqual(rows.map(r => r.ok), [true, false])
})

test('perturbNumbers nudges every numeric leaf and records the path', () => {
  const { value, changes } = perturbNumbers({ a: 100, b: { c: 2396129.0322580645 }, s: 'keep', n: [1, 2] })
  assert.equal(value.a, 101)                          // integer: +1
  assert.ok(Math.abs(value.b.c - 2396129.0322580645 * 1.01) < 1e-6)  // float: ×1.01
  assert.equal(value.s, 'keep')
  assert.deepEqual(value.n, [2, 3])
  assert.equal(changes.length, 4)
  assert.ok(changes.some(ch => ch.path === 'b.c'))
})

// ── THE MIRROR GATE (the human, 2026-09-02) ──────────────────────────────────────────────────────
// "make sure the gap between schematic and proof will not exist again." A committed wireframe is a
// claim about the app's measured layout; this refuses one that has stopped being true — either
// because the drawing no longer contains something the skeleton beside it measured (a mirror gap),
// or because the harvest has moved past the drawing (its layout pin no longer matches). Both are
// derived from the tree at gate time; nothing is stored.
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { renderWireframe } from './viz.mjs'
import { checkMirrors } from './proof-integrity.mjs'

const LAY = tick => ({
  w: 1440,
  h: 900,
  ring: tick ? { x: 24, y: 96, w: 600, h: 44 } : null,
  els: [
    { x: 0, y: 0, w: 1440, h: 900, kind: 'container' },
    { x: 24, y: 16, w: 220, h: 32, kind: 'heading', text: 'Today · to do', fs: 20, ta: 'l' },
    { x: 24, y: 96, w: 600, h: 44, kind: 'input', text: tick ? 'Water the plants' : '', fs: 15, ta: 'l', pl: 12, bg: '255,255,255', bd: '223,226,233', ...(tick ? { focus: true } : {}) },
    { x: 660, y: 96, w: 90, h: 36, kind: 'button', text: 'Add', fs: 14, bg: '79,70,229', fg: '255,255,255' }
  ]
})
const fixture = (mutate = null) => {
  const root = join(tmpdir(), 'mirror-gate-' + Math.random().toString(36).slice(2))
  mkdirSync(join(root, 'todo', 'evidence'), { recursive: true })
  mkdirSync(join(root, 'todo', 'viz'), { recursive: true })
  const pairs = [{ before: LAY(false), after: LAY(true), values: [] }]
  writeFileSync(join(root, 'todo', 'evidence', 'R1.b1.before.layout.json'), JSON.stringify(LAY(false)))
  writeFileSync(join(root, 'todo', 'evidence', 'R1.b1.after.layout.json'), JSON.stringify(LAY(true)))
  const d = renderWireframe(pairs, { id: 'R1' })
  writeFileSync(join(root, 'todo', 'viz', 'R1.svg'), (mutate ? mutate(d.svg) : d.svg) + '\n')
  return root
}

test('the mirror gate passes a committed drawing that still mirrors its harvest', () => {
  const root = fixture()
  try {
    const rows = checkMirrors(root)
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0].gaps, [])
    assert.equal(rows[0].pinOk, true)
    assert.equal(rows[0].ok, true)
    assert.equal(rows[0].id, 'R1')
    assert.equal(rows[0].screen, 'todo')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the mirror gate refuses a committed drawing that dropped a measured word', () => {
  const root = fixture(svg => svg.replace(/<text[^>]*>Today · to do<\/text>/, ''))
  try {
    const rows = checkMirrors(root)
    assert.equal(rows[0].ok, false)
    assert.ok(rows[0].gaps.length >= 1, 'the dropped heading is named')
    assert.equal(rows[0].gaps[0].kind, 'missing-text')
    assert.match(rows[0].gaps[0].what, /Today/)
    assert.equal(rows[0].pinOk, true, 'the harvest did not move — only the drawing is wrong')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the mirror gate refuses a drawing the harvest has moved past — the layout pin', () => {
  const root = fixture()
  try {
    // the app's layout moves: the field grows. The committed drawing was pinned to the old geometry.
    const moved = LAY(true)
    moved.els[2].w = 720
    writeFileSync(join(root, 'todo', 'evidence', 'R1.b1.after.layout.json'), JSON.stringify(moved))
    const rows = checkMirrors(root)
    assert.equal(rows[0].pinOk, false, 'data-viz-layout no longer equals the layoutHash of what is on disk')
    assert.equal(rows[0].ok, false)
    assert.match(rows[0].why, /layout/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the mirror gate says so when a committed wireframe has no harvest left on disk', () => {
  const root = fixture()
  try {
    rmSync(join(root, 'todo', 'evidence', 'R1.b1.before.layout.json'))
    rmSync(join(root, 'todo', 'evidence', 'R1.b1.after.layout.json'))
    const rows = checkMirrors(root)
    assert.equal(rows[0].ok, false)
    assert.match(rows[0].why, /no layout/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the mirror gate ignores an archetype drawing — only a wireframe claims to mirror an app', () => {
  const root = fixture(svg => svg.replace('data-viz-kind="wireframe"', 'data-viz-kind="archetype"'))
  try {
    assert.deepEqual(checkMirrors(root), [])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

// ── THE REPLICA GATE (phase 3, 2026-09-03) ───────────────────────────────────────────────────────
// The same guard, on the other picture. A committed .actual.html is a claim about what the app
// rendered and a .expected.html a claim about what the requirement asked for; both stop being true
// silently. checkReplicas refuses a replica that was never gated in the page, one the harvest has
// moved past, one the in-page walk found a gap in, one whose words are not the skeleton's beside it,
// and an Expected that does not carry a failed claim's own value.
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { layoutHash } from './viz.mjs'
import { checkReplicas } from './proof-integrity.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')

const RLAY = {
  w: 1440,
  h: 900,
  ring: { x: 120, y: 150, w: 90, h: 30 },
  els: [
    { x: 110, y: 110, w: 200, h: 24, kind: 'heading', text: 'All tasks' },
    { x: 120, y: 150, w: 90, h: 30, kind: 'button', text: 'Archive', focus: true },
    { x: 120, y: 200, w: 300, h: 20, kind: 'text', text: 'Pay the electricity bill' },
    { x: 900, y: 600, w: 200, h: 20, kind: 'text', text: 'Outside the scene root' }
  ]
}
const REP_ROOT = (side, body, extra = '', pin = layoutHash(RLAY, null)) =>
  '<!-- specboard replica-1 · todo:R1 b1 after · ' + side + ' -->\n<style>.rep .r1{color:red}</style>\n' +
  '<div class="rep r0" data-replica-kit="replica-1" data-replica-region="100 100 600 300"' +
  ' data-replica-side="' + side + '"' + extra + ' data-replica-layout="' + pin + '"' +
  ' data-replica-gaps="[]" style="position:relative">' + body + '</div>\n'
const ACTUAL_BODY = '<h1 class="r1">All tasks</h1><button class="r1">Archive</button>' +
  '<div class="r1">Pay the electricity bill</div>'
// the DEFAULT fixture's claim PASSED: the Expected is then this moment's own tree, and rule 4 (the
// words) is demanded of it. A file carrying a FAILED claim is deliberately a picture of the last
// scene the app got right, so its words are not this skeleton's and rule 5 is what it answers for —
// FAILED_CLAIMS is what the tests about that use.
const CLAIMS = '[{&quot;label&quot;:&quot;the row&quot;,&quot;expected&quot;:&quot;Pay the electricity bill&quot;,' +
  '&quot;got&quot;:&quot;Pay the electricity bill&quot;,&quot;ok&quot;:true}]'
const FAILED_CLAIMS = '[{&quot;label&quot;:&quot;the row&quot;,&quot;expected&quot;:&quot;Pay the electricity bill&quot;,' +
  '&quot;got&quot;:&quot;&quot;,&quot;ok&quot;:false}]'

const repFixture = (mutate = {}) => {
  const root = join(tmpdir(), 'replica-gate-' + Math.random().toString(36).slice(2))
  mkdirSync(join(root, 'todo', 'evidence'), { recursive: true })
  const lay = mutate.layout ? mutate.layout(structuredClone(RLAY)) : RLAY
  writeFileSync(join(root, 'todo', 'evidence', 'R1.b1.after.layout.json'), JSON.stringify(lay))
  // `repin` re-pins the replica to the layout the fixture just wrote — for a test about the WORDS,
  // where a mutated skeleton would otherwise also fail on the pin and prove nothing about the words
  const pin = layoutHash(mutate.repin ? lay : RLAY, null)
  // ONE HTML PER MOMENT (2026-09-04): the only replica a moment lands is the Expected, and the gate
  // asks BOTH questions of it — the words the live skeleton measured (rule 4) and the values the
  // failed claims asked for (rule 5). `mutate.actual` is kept as a name for a mutation of the app's
  // own markup, applied to the same one file; `mutate.expected` runs after it.
  let expected = REP_ROOT('expected', ACTUAL_BODY, ' data-claims="' + CLAIMS + '"', pin)
  if (mutate.actual) expected = mutate.actual(expected)
  if (mutate.expected) expected = mutate.expected(expected)
  writeFileSync(join(root, 'todo', 'evidence', 'R1.b1.after.expected.html'), expected)
  return root
}

test('the replica gate passes a gated moment whose pin, words and claims all still hold', () => {
  const root = repFixture()
  try {
    const rows = checkReplicas(root)
    assert.equal(rows.length, 1, 'one html per moment')
    assert.equal(rows[0].ok, true, rows[0].why)
    assert.equal(rows[0].screen, 'todo')
    assert.equal(rows[0].id, 'R1')
    assert.match(rows[0].file, /R1\.b1\.after\.expected\.html$/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

// A REAL one, out of this repo's own history (final re-review, new breakage 1, 2026-09-04). The
// test that stood here wrote `<div class="rep r0">stale</div>` — a file with no pin at all — and so
// only proved that an UNGATED file is refused, which was never in doubt. The file the release
// actually leaves behind is the one the OLD harness gated: `b2538c8`'s own
// spec/board/evidence/R1.b1.v1.actual.html, whose pin still hashes the skeleton committed beside it.
// Run against that, `checkReplicas` returned `ok: true` — a retired half of the two-file shape,
// reported healthy, on a tree `kg-update` brought forward without re-harvesting. So the KIND is what
// is refused now, before any rule reads a byte: there is no `.actual.html` in this release at all
// (the Actual half of a moment is the photograph named beside it), and a file of that name is a
// leftover whose only honest answer is to harvest the screen again.
const legacyActual = () => {
  const root = join(tmpdir(), 'replica-legacy-' + Math.random().toString(36).slice(2))
  const dir = join(root, 'board', 'evidence')
  mkdirSync(dir, { recursive: true })
  const show = (p) => execFileSync('git', ['show', 'b2538c8:' + p], { cwd: REPO, maxBuffer: 32 * 1024 * 1024 })
  writeFileSync(join(dir, 'R1.b1.v1.actual.html'), show('spec/board/evidence/R1.b1.v1.actual.html'))
  writeFileSync(join(dir, 'R1.b1.v1.layout.json'), show('spec/board/evidence/R1.b1.v1.layout.json'))
  return root
}

test('a leftover .actual.html the OLD harness gated is refused — the retired kind, not a verdict on its bytes', () => {
  const root = legacyActual()
  try {
    const row = checkReplicas(root).find(r => r.file.endsWith('.actual.html'))
    assert.ok(row, 'the stale file is still seen')
    assert.equal(row.side, 'actual')
    // it is NOT refused as ungated — this one carries a valid pin over the skeleton beside it, which
    // is exactly why the old fixture proved nothing
    assert.doesNotMatch(row.why, /not gated/)
    assert.equal(row.ok, false, 'a gated legacy Actual still fails: ' + JSON.stringify(row))
    assert.match(row.why, /retired file — re-harvest the screen/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a leftover .actual.html with no pin at all is refused too — the kind is enough', () => {
  const root = repFixture()
  try {
    writeFileSync(join(root, 'todo', 'evidence', 'R1.b1.after.actual.html'), '<div class="rep r0">stale</div>')
    const row = checkReplicas(root).find(r => r.file.endsWith('.actual.html'))
    assert.ok(row, 'the stale file is still seen')
    assert.equal(row.ok, false)
    assert.match(row.why, /retired file — re-harvest the screen/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('deleting a text node from a replica fixture fails the gate — the plan\'s own acceptance', () => {
  const root = repFixture({ actual: h => h.replace('<div class="r1">Pay the electricity bill</div>', '') })
  try {
    const rows = checkReplicas(root).filter(r => r.file.endsWith('.expected.html'))
    assert.equal(rows[0].ok, false)
    assert.equal(rows[0].gaps[0].kind, 'missing-text')
    assert.match(rows[0].gaps[0].what, /electricity/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the node text gate reads the skeleton INSIDE the region only', () => {
  // "Outside the scene root" is measured on the live page but lies outside the replica's own region,
  // so the replica never carried it and must not be failed for it (the fixture above passes) — but a
  // word that moves INTO the region has to be there
  const root = repFixture({ repin: true, layout: l => { l.els[3] = { ...l.els[3], x: 120, y: 260 }; return l } })
  try {
    const rows = checkReplicas(root).filter(r => r.file.endsWith('.expected.html'))
    assert.equal(rows[0].ok, false)
    assert.equal(rows[0].gaps[0].kind, 'missing-text')
    assert.match(rows[0].gaps[0].what, /Outside the scene root/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the replica gate refuses one the harvest has moved past — the layout pin', () => {
  const root = repFixture({ layout: l => { l.els[1] = { ...l.els[1], w: 140 }; return l } })
  try {
    const rows = checkReplicas(root)
    assert.deepEqual(rows.map(r => r.ok), [false])
    assert.match(rows[0].why, /pin has moved/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('an UNGATED replica is refused — a picture nobody measured is not a proven likeness', () => {
  const root = repFixture({ actual: h => h.replace(/ data-replica-layout="[^"]*"/, '') })
  try {
    const rows = checkReplicas(root).filter(r => r.file.endsWith('.expected.html'))
    assert.equal(rows[0].ok, false)
    assert.match(rows[0].why, /not gated/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('an Expected that does not carry a failed claim\'s own value is refused', () => {
  // the BODY loses the words (the claim in data-claims still asks for them — that is the point)
  const root = repFixture({ expected: h => h.replace(CLAIMS, FAILED_CLAIMS)
    .replace('<div class="r1">Pay the electricity bill</div>', '<div class="r1">Renew passport</div>') })
  try {
    const rows = checkReplicas(root).filter(r => r.file.endsWith('.expected.html'))
    assert.equal(rows[0].ok, false)
    const claim = rows[0].gaps.find(g => g.kind === 'missing-claim')
    assert.ok(claim, 'rule 5 names it: ' + JSON.stringify(rows[0].gaps))
    assert.match(claim.what, /electricity/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

// WHAT A CLAIM MOVED IS NOT A MISSING WORD (2026-09-04, one html per moment). Rules 4 and 5 now run
// on ONE file and pull against each other: rule 5 demands the value the requirement asked for, and
// applying it is exactly what removes the live text rule 4 would otherwise demand. So a live element
// standing inside a claim's own ring, or one whose text IS that claim's `got`, is exempt — and a
// word NO claim touched is still demanded, which is what keeps rule 4 worth having on this file.
test('a word a CLAIM moved is exempt from the word gate; a word nothing claimed is not', () => {
  const ringed = '[{&quot;label&quot;:&quot;the heading&quot;,&quot;expected&quot;:&quot;Every task&quot;,' +
    '&quot;got&quot;:&quot;All tasks&quot;,&quot;ok&quot;:false,&quot;ring&quot;:{&quot;x&quot;:110,&quot;y&quot;:110,&quot;w&quot;:200,&quot;h&quot;:24}}]'
  // a PASSING match claim: the file is still this moment's tree, so rule 4 runs — and the live text
  // the claim moved is exempt from it
  const passing = ringed.replace('&quot;ok&quot;:false', '&quot;ok&quot;:true')
  const claimed = repFixture({
    expected: h => h.replace(CLAIMS, passing).replace('<h1 class="r1">All tasks</h1>', '<h1 class="r1" data-claim="wrong">Every task</h1>')
  })
  try {
    const row = checkReplicas(claimed).filter(r => r.file.endsWith('.expected.html'))[0]
    assert.equal(row.ok, true, 'the claim put its own value there: ' + row.why)
  } finally { rmSync(claimed, { recursive: true, force: true }) }
  const dropped = repFixture({ expected: h => h.replace('<h1 class="r1">All tasks</h1>', '') })
  try {
    const row = checkReplicas(dropped).filter(r => r.file.endsWith('.expected.html'))[0]
    assert.equal(row.ok, false, 'a word no claim touched is still demanded')
    assert.ok(row.gaps.some(g => g.kind === 'missing-text' && /All tasks/.test(g.what)), JSON.stringify(row.gaps))
  } finally { rmSync(dropped, { recursive: true, force: true }) }
})

// …AND THE RING BRANCH IS FILTERED THE SAME WAY THE TEXT BRANCH IS (final re-review, 2026-09-04).
// The `got` branch already exempts only a claim that actually MOVED the text (`got !== expected`),
// with the reason written beside it: exempting an exact pass would waive the word rule for every
// element a beat merely READ, so deleting a text node the beat claimed would stop failing this gate
// — the plan's own acceptance case. The ring branch is a geometric overlap test and had no such
// filter, so it granted precisely the waiver its sibling refuses, to every live element touching a
// passing claim's ring box. Dormant on both trees today (a claim carries a `ring` only where the
// moment could not carry the ring at all — 0 of 204 committed claim lists have one), which is why
// this is a fixture and not a repro.
test('a PASSING claim\'s ring waives nothing — the exemption is what a claim MOVED, on both branches', () => {
  // an EXACT pass, ringing the row: the app showed the very words the beat asked for, so nothing was
  // moved and the file must still contain them
  const exact = '[{&quot;label&quot;:&quot;the row&quot;,&quot;expected&quot;:&quot;Pay the electricity bill&quot;,' +
    '&quot;got&quot;:&quot;Pay the electricity bill&quot;,&quot;ok&quot;:true,' +
    '&quot;ring&quot;:{&quot;x&quot;:110,&quot;y&quot;:190,&quot;w&quot;:320,&quot;h&quot;:40}}]'
  const root = repFixture({
    expected: h => h.replace(CLAIMS, exact).replace('<div class="r1">Pay the electricity bill</div>', '')
  })
  try {
    const row = checkReplicas(root).filter(r => r.file.endsWith('.expected.html'))[0]
    assert.equal(row.ok, false, 'a word inside a passing claim\'s ring is still demanded: ' + JSON.stringify(row))
    assert.ok(row.gaps.some(g => g.kind === 'missing-text' && /electricity/.test(g.what)), JSON.stringify(row.gaps))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('…and a FAILED claim\'s ring still exempts what it moved — the seam rule 5 answers for', () => {
  // the claim asked for words the app did not show, so the Expected carries the REQUIREMENT's value
  // and the live one is, correctly, gone: rule 4 must not demand it back, and rule 5 checks the file
  // really does carry the expected words
  const moved = '[{&quot;label&quot;:&quot;the row&quot;,&quot;expected&quot;:&quot;Renew passport&quot;,' +
    '&quot;got&quot;:&quot;Pay the electricity bill&quot;,&quot;ok&quot;:false,' +
    '&quot;ring&quot;:{&quot;x&quot;:110,&quot;y&quot;:190,&quot;w&quot;:320,&quot;h&quot;:40}}]'
  const root = repFixture({
    expected: h => h.replace(CLAIMS, moved)
      .replace('<div class="r1">Pay the electricity bill</div>', '<div class="r1" data-claim="row">Renew passport</div>')
  })
  try {
    const row = checkReplicas(root).filter(r => r.file.endsWith('.expected.html'))[0]
    assert.equal(row.ok, true, 'the claim put its own value there: ' + row.why + ' ' + JSON.stringify(row.gaps))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a gap the IN-PAGE walk already found rides on the file and is reported here', () => {
  const gaps = '[{&quot;kind&quot;:&quot;missing-box&quot;,&quot;what&quot;:&quot;row&quot;,&quot;x&quot;:1,&quot;y&quot;:2,&quot;w&quot;:3,&quot;h&quot;:4}]'
  const root = repFixture({ actual: h => h.replace('data-replica-gaps="[]"', 'data-replica-gaps="' + gaps + '"') })
  try {
    const rows = checkReplicas(root).filter(r => r.file.endsWith('.expected.html'))
    assert.equal(rows[0].ok, false)
    assert.equal(rows[0].gaps[0].kind, 'missing-box')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a TRUNCATED replica is a gap — a picture that ran out of bytes cannot be a likeness', () => {
  const root = repFixture({ actual: h => h.replace('data-replica-kit', 'data-replica-truncated="1" data-replica-kit') })
  try {
    const rows = checkReplicas(root).filter(r => r.file.endsWith('.expected.html'))
    assert.equal(rows[0].ok, false)
    assert.equal(rows[0].gaps[0].kind, 'truncated')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a replica whose skeleton is gone is refused, not quietly passed', () => {
  const root = repFixture()
  try {
    rmSync(join(root, 'todo', 'evidence', 'R1.b1.after.layout.json'))
    const rows = checkReplicas(root)
    assert.deepEqual(rows.map(r => r.ok), [false])
    assert.match(rows[0].why, /no layout skeleton/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a spec with no replicas yields no rows', () => {
  const root = join(tmpdir(), 'replica-gate-empty-' + Math.random().toString(36).slice(2))
  mkdirSync(join(root, 'todo', 'evidence'), { recursive: true })
  try { assert.deepEqual(checkReplicas(root), []) } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the CLI\'s node text gate reads a word RUN too — a live "5" is not answered by "15" (fix round 1, I1)', () => {
  const root = repFixture({
    repin: true,
    layout: l => { l.els.push({ x: 120, y: 250, w: 40, h: 20, kind: 'text', text: '5' }); return l },
    actual: h => h.replace('<div class="r1">Pay the electricity bill</div>',
      '<div class="r1">Pay the electricity bill</div><div class="r1">15</div>')
  })
  try {
    const rows = checkReplicas(root).filter(r => r.file.endsWith('.expected.html'))
    assert.equal(rows[0].ok, false)
    assert.equal(rows[0].gaps[0].what, '5')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('…and a live "5" IS answered by "To do 5" — its own run inside a longer text', () => {
  const root = repFixture({
    repin: true,
    layout: l => { l.els.push({ x: 120, y: 250, w: 40, h: 20, kind: 'text', text: '5' }); return l },
    actual: h => h.replace('<div class="r1">Pay the electricity bill</div>',
      '<div class="r1">Pay the electricity bill</div><div class="r1">To do 5</div>')
  })
  try {
    assert.equal(checkReplicas(root).filter(r => r.file.endsWith('.expected.html'))[0].ok, true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

// ── FIX ROUND 2, item 1: the CLI's node-text gate shares containsRun's 48-char-cap relaxation too ──
// (spec/_layout-walk.mjs's clean() hard-slices every measured text to 48 chars, so a skeleton text
// that comes back at exactly that length may have been cut mid-word.) The brief's own example: init
// R2's nine gaps were all real PRD sentences the walk had cut at 48, rejected here because the CLI's
// haystack is the whole file's text with no box to pin it — the same rule must hold there too.
test('the CLI\'s node text gate also lets a live text AT the 48-char cap end mid-word', () => {
  const cut = 'Search across requirement text, grouped into are'
  const root = repFixture({
    repin: true,
    layout: l => { l.els.push({ x: 120, y: 250, w: 300, h: 20, kind: 'text', text: cut }); return l },
    actual: h => h.replace('<div class="r1">Pay the electricity bill</div>',
      '<div class="r1">Pay the electricity bill</div><div class="r1">Search across requirement text, grouped into areas</div>')
  })
  try {
    assert.equal(cut.length, 48)
    assert.equal(checkReplicas(root).filter(r => r.file.endsWith('.expected.html'))[0].ok, true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the CLI\'s node text gate never demands text back from a style/script/etc-tagged element', () => {
  const root = repFixture({
    repin: true,
    layout: l => { l.els.push({ x: 120, y: 250, w: 300, h: 20, kind: 'image', tag: 'style', text: '.wf0{animation:x 1s}' }); return l }
    // the actual body carries NOTHING matching that text — if the gate demanded it back, this would fail
  })
  try {
    assert.equal(checkReplicas(root).filter(r => r.file.endsWith('.expected.html'))[0].ok, true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

// ── THE AUTHORED-INTENT LINT (phase 6, 2026-09-04) ───────────────────────────────────────────────
// The existence lint above asks "does this proof read a VALUE at all". This one asks the next
// question: does it read the values the REQUIREMENT NAMES. A Then that names three facts and a beat
// that claims one is a proof of a third of a requirement wearing the requirement's green — and,
// since the Expected picture is built from the beat's claims, a Then fact no claim covers is also a
// fact the picture can never show. So every fact a Then names must be a SOFT claim (proveVisible
// `soft: true`): the beat reaches and photographs each of them and fails once at its end with the
// whole list, instead of stopping at the first red with the rest of the requirement unshown.
import { splitFacts, lintIntent, isAbsenceFact, absenceTarget, opensPage, claimsIn } from './proof-integrity.mjs'

test('splitFacts splits a Then only where BOTH sides carry a verb-ish token', () => {
  // both sides carry one — two facts
  assert.deepEqual(splitFacts('the row stays listed — the count reads 4'),
    ['the row stays listed', 'the count reads 4'])
  // the right side names a thing, not a fact about it — one fact (when in doubt, one)
  assert.deepEqual(splitFacts('exactly one card appears — its name, its titles and its cover'),
    ['exactly one card appears — its name, its titles and its cover'])
  // `; ` and `, and ` are separators too
  assert.equal(splitFacts('an Undo appears; the count stays 5').length, 2)
  assert.equal(splitFacts('the stamp reads edited, and the ring shows 2 / 4').length, 2)
  // a separator INSIDE an aside — a parenthetical, a backticked token, a quoted phrase — never splits
  assert.deepEqual(splitFacts('the banner is shown *(removed 2026-09-02; the human: "avoid useless things")*'),
    ['the banner is shown *(removed 2026-09-02; the human: "avoid useless things")*'])
  assert.equal(splitFacts('the chip reads `EXPECTED "5"; nothing else` on one line').length, 1)
  // no separator at all — one fact
  assert.deepEqual(splitFacts('the ring shows 2 / 4'), ['the ring shows 2 / 4'])
})

const PRD_TWO = `---
screen: todo
---

## R1 — the count moves by the leaves

- **Given** the seeded board
- **When** you tick one sub-task
- **Then** the row stays listed — the count reads 4

## R2 — one fact only

- **Given** the seeded board
- **When** you add a task
- **Then** the new row shows at the bottom
`

const specWith = body => `
test('todo', async ({ page }) => {
  await checkReq('R1', async () => {
${body}
  })
  await checkReq('R2', async () => {
    await proveVisible(page.locator('.ttl'), 'Water the plants', 'The new row')
  })
})
`

test('lintIntent flags a two-fact Then whose beat makes one hard claim', () => {
  const rows = lintIntent(PRD_TWO, specWith("    await proveVisible(page.locator('.n'), '4', 'To do')"))
  const r1 = rows.find(r => r.id === 'R1')
  assert.equal(r1.facts, 2)
  assert.equal(r1.claims, 1)
  assert.equal(r1.soft, 0)
  assert.equal(r1.ok, false)
  assert.match(r1.why, /2 facts/)          // (a) fewer claims than facts…
  assert.match(r1.why, /soft/)             // …(b) and the one it makes is not soft
})

test('…and passes the same beat once every fact is a soft claim', () => {
  const rows = lintIntent(PRD_TWO, specWith(
    "    await proveVisible(page.locator('.row'), 'Water the plants', 'The row, still listed', { soft: true })\n" +
    "    await proveVisible(page.locator('.n'), '4', 'To do', { soft: true })"))
  const r1 = rows.find(r => r.id === 'R1')
  assert.equal(r1.facts, 2)
  assert.equal(r1.claims, 2)
  assert.equal(r1.soft, 2)
  assert.equal(r1.ok, true)
  assert.equal(r1.state, 'ok')
})

test('a one-fact Then is proven by one claim — hard or soft — but never by none', () => {
  const ok = lintIntent(PRD_TWO, specWith("    await proveVisible(page.locator('.n'), '4', 'To do')"))
  assert.equal(ok.find(r => r.id === 'R2').ok, true)      // R2's beat has a proveVisible
  const bad = lintIntent(PRD_TWO, `
test('todo', async ({ page }) => {
  await checkReq('R2', async () => {
    await expect(page.locator('.ttl')).toHaveText('Water the plants')
  })
})
`)
  const r2 = bad.find(r => r.id === 'R2')
  assert.equal(r2.claims, 0)
  assert.equal(r2.ok, false)
  assert.match(r2.why, /no claim/)
})

test('a beat no checkReq maps to is no-beat, not a gap — coverage already calls it unproven', () => {
  const rows = lintIntent(PRD_TWO, "test('todo', async ({ page }) => {\n  await checkReq('R1', async () => { await proveVisible(a, 'b', 'c', { soft: true }) })\n})")
  const r2 = rows.find(r => r.id === 'R2')
  assert.equal(r2.state, 'no-beat')
  assert.equal(r2.ok, true, 'the intent lint does not fail a requirement no test reaches')
})

test('the claims a beat FUNCTION makes count — the beat-function convention', () => {
  // the flow keeps its checkReq AROUND the call (kg-e2e); the claims live in the step's body
  const spec = "test('todo', async ({ page }) => {\n  await checkReq('R1', async () => { await tickOneSubTask(page, state) })\n})"
  const steps = `
export async function tickOneSubTask (page, state) {
  await proveVisible(rowById(page, 'k1'), 'Water the plants', 'The row, still listed', { soft: true })
  await proveVisible(page.locator('.n'), '4', 'To do', { soft: true })
}
`
  const rows = lintIntent(PRD_TWO, spec, { helpers: [steps] })
  const r1 = rows.find(r => r.id === 'R1')
  assert.equal(r1.claims, 2)
  assert.equal(r1.soft, 2)
  assert.equal(r1.ok, true)
})

test('beats map to checkReq blocks per TEST, with the last beat taking the rest (BEAT_CURSOR)', () => {
  const prd = `---
screen: todo
---

## R1 — two beats

- **Given** the seeded board
- **When** you tick one
- **Then** the count reads 4
- **When** you tick the last one
- **Then** the container completes itself
`
  // BEAT_CURSOR resets per test (spec/_base.ts's page fixture), so the SECOND test's first
  // checkReq('R1') is beat 1 again — and a third call in one test clamps onto the last beat.
  const spec = `
test('one', async ({ page }) => {
  await checkReq('R1', async () => { await proveVisible(a, '4', 'To do') })
  await checkReq('R1', async () => { await proveVisible(a, 'done', 'The container') })
  await checkReq('R1', async () => { /* clamped onto beat 2 */ })
})
test('two', async ({ page }) => {
  await checkReq('R1', async () => { /* beat 1 again */ })
})
`
  // …and since fix round 2 the beat is scored on the block that covers it LEAST (I2), so the second
  // test's empty first block is what beat 1 reads — and the three-blocks-for-two-beats test is
  // itself a beat-mismatch row. (This test asserted "the best of the two tests' first blocks" until
  // 2026-09-04; the controller overruled that reading — rule 4, the test was the wrong side.)
  const rows = lintIntent(prd, spec)
  const beats = rows.filter(r => r.state !== 'beat-mismatch')
  assert.equal(beats.length, 2)
  assert.equal(beats[0].beat, 1)
  assert.equal(beats[0].claims, 0, 'the second test proves beat 1 with no claim at all')
  assert.equal(beats[1].beat, 2)
  assert.equal(beats[1].claims, 0, 'the clamped third block harvests beat 2 too, and it claims nothing')
  assert.ok(rows.some(r => r.state === 'beat-mismatch'), 'three blocks for two beats is a mismatch')
})

// ── THE EXISTENCE LINT READS A BEAT'S FUNCTIONS TOO (phase 6, 2026-09-04) ────────────────────────
// Found while wiring the intent lint: `npm run proof lint` was red on BOTH boards for a reason that
// had nothing to do with a weak proof — every checkReq that keeps its assertion in a step function
// (the beat-function convention the kg-e2e skill teaches) read as EXISTENCE-ONLY, because the lint
// looked only at the block's own bytes. A proof does not stop being a proof because it was lifted
// into spec/<screen>/steps.ts. Same expansion the intent lint uses, same helper sources.
test('lintSource follows a checkReq into the beat function it calls', () => {
  const spec = "test('todo', async ({ page }) => {\n  await checkReq('R1', async () => { await tickOneSubTask(page, state) })\n})"
  const steps = "export async function tickOneSubTask (page, state) {\n  await expect(page.locator('.n')).toHaveText('4')\n}"
  assert.equal(lintSource(spec)[0].ok, false, 'the block alone asserts nothing')
  assert.equal(lintSource(spec, { helpers: [steps] })[0].ok, true, 'the beat it calls asserts the value')
})

test('…and proveVisible IS a value assertion — it reads the value off the screen and asserts it', () => {
  assert.equal(hasValueAssertion("await proveVisible(page.locator('.n'), '4', 'To do', { soft: true })"), true)
  assert.equal(hasValueAssertion("await expect(page.locator('.n')).toBeVisible()"), false)
  // …and so are these two, missing from the list until phase 6 read the rows: a plain `toContain`
  // on a string the test pulled off the page (board R10's voiced-cut src), and `toHaveURL` (board
  // R1's card-still opening its screen). Both fail when the value changes; both read EXISTENCE-ONLY.
  assert.equal(hasValueAssertion("expect(src).toContain('a.voiced.mp4')"), true)
  assert.equal(hasValueAssertion("await expect(page).toHaveURL(new RegExp('#/' + name))"), true)
})

test('a claim named in a COMMENT is not a claim', () => {
  // found on board R19: a comment explaining why the board's own harvest records no ring
  // ("its specs read the page with reveal(), not proveVisible()") counted as that beat's one claim,
  // and the beat read one claim short of a gap. A lint that can be satisfied by prose is not a lint.
  const prd = `---
screen: todo
---

## R1 — one fact

- **Given** the seeded board
- **When** you tick one sub-task
- **Then** the count reads 4
`
  const spec = `
test('todo', async ({ page }) => {
  await checkReq('R1', async () => {
    // this beat reads the page with reveal(), not proveVisible()
    /* nor proveVisible( ) in a block comment */
    await expect(page.locator('.n')).toHaveText('4')
  })
})
`
  const row = lintIntent(prd, spec)[0]
  assert.equal(row.claims, 0)
  assert.equal(row.ok, false)
})

// ── A DECLARED GAP (fix round 1, 2026-09-04 — the controller's ruling) ───────────────────────────
// Some facts a Then names have no screen surface at all: a beat that drives the server with no page
// open, a geometric relation between two cells, what the CLI gate refuses, a surface that lives only
// on the hidden baked pane. The honest answer is neither a claim nobody can make nor silence — it is
// a line IN THE BEAT saying why there is nothing to read. The lint reads it, prints DECLARED with
// the reason, and does not fail the exit code for it. A visible debt, never a pass.
const PRD_ONE = `---
screen: dispatch
---

## R4 — the slot

- **Given** a job holding the slot
- **When** a person starts a second job
- **Then** the running job is cancelled and the new one takes the slot
`

test('a beat that DECLARES its gap is reported, and does not fail the lint', () => {
  const spec = `
test('dispatch', async ({ request }) => {
  await checkReq('R4', async () => {
    intentGap('the slot is the server\\'s own contract — this beat drives the API with no page open')
    expect((await request.post('/api/run')).status()).toBe(200)
  })
})
`
  const row = lintIntent(PRD_ONE, spec)[0]
  assert.equal(row.state, 'declared')
  assert.equal(row.ok, true, 'a declared gap is a debt, not a failure')
  assert.match(row.why, /no page open/, 'the reason is carried into the row')
})

test('…and a beat that declares NOTHING still fails', () => {
  const spec = "test('dispatch', async ({ request }) => {\n  await checkReq('R4', async () => { expect(1).toBe(1) })\n})"
  const row = lintIntent(PRD_ONE, spec)[0]
  assert.equal(row.state, 'gap')
  assert.equal(row.ok, false)
})

// A ZERO-CLAIM DECLARATION WAIVES A WHOLE BEAT — ONLY WHERE NO PAGE IS OPEN (final review I3,
// 2026-09-04). The intent is right ("a beat with no page open has no surface for any fact") but the
// TEST for it was "the beat made no claims", which an author satisfies by simply not writing one.
// Live at HEAD: board R11 beat 1 opened /#howitworks/kg-deep, asserted three visible/hidden things,
// made zero claims, wrote one intentGap, and the lint printed DECLARED for all three facts. What
// decides is whether the block OPENS A PAGE, which its own source says.
test('a zero-claim declaration cannot waive a beat that opens a page', () => {
  const prd = `---
screen: board
---

## R11 — the guide

- **Given** the board
- **When** you open the kg-deep guide
- **Then** the guide is shown; the composer is hidden; the crumb names it
`
  const open = `
test('board', async ({ page }) => {
  await checkReq('R11', async () => {
    intentGap('these are geometry, not values')
    await expect(page.locator('#howview')).toBeVisible()
    await expect(page.locator('.composeview')).toBeHidden()
  })
})
`
  const row = lintIntent(prd, open)[0]
  assert.equal(row.state, 'gap', 'the declaration is refused on an open page')
  assert.equal(row.ok, false)
  assert.match(row.why, /declared-on-an-open-page/)
})

test('…and it still waives a beat that opens none — the API-only shape it was written for', () => {
  const prd = `---
screen: dispatch
---

## R4 — one job at a time

- **Given** a run in flight
- **When** a second run is asked for
- **Then** it is refused; the first keeps the slot
`
  const closed = `
test('dispatch', async ({ request }) => {
  await checkReq('R4', async () => {
    intentGap('this beat drives the API with no page open — the slot is the server\\'s own contract')
    expect((await request.post('/api/run')).status()).toBe(409)
  })
})
`
  const row = lintIntent(prd, closed)[0]
  assert.equal(row.state, 'declared')
  assert.equal(row.ok, true)
})

// …AND THE QUESTION IS ASKED OF THE WHOLE BLOCK, HELPERS INCLUDED (final re-review's I3 residual,
// 2026-09-04). `opensPage` read the block's own bytes, and this project's own beat-function
// convention — the shape skills/kg-e2e actively promotes — keeps every `page.` inside an exported
// step function: `await draftedRowBecomesCard(page, state)` matches no token at all, so a composed
// flow block read as HEADLESS and could take the whole-beat waiver on a page that is wide open.
// lintIntent already hands `claimsIn` an EXPANDED body, so the CLI's own answer was right; the
// predicate itself was not, and it is exported. It now takes the same functionBodies map the claim
// count is read through, so no caller can ask the narrow question by accident.
const STEPS = 'export async function draftedRowBecomesCard (page, state) {\n' +
  '  await page.locator(".dr").click()\n}\n' +
  'export async function countRows (state) { return state.rows.length }\n'

test('a block whose page work lives in a step function opens a page — helpers included', () => {
  const bodies = functionBodies(STEPS)
  const body = 'await draftedRowBecomesCard(page, state)'
  assert.equal(opensPage(body), false, 'its own bytes say nothing — `page` as an argument is not `page.`')
  assert.equal(opensPage(body, bodies), true, 'read through the helper it calls, the page is wide open')
  assert.equal(claimsIn(body, bodies).open, true, 'and claimsIn asks the same expanded question')
  // a genuinely headless beat is still headless through the same expansion — the waiver dispatch
  // depends on is not taken away by reading further
  assert.equal(claimsIn('const n = await countRows(state)', bodies).open, false)
})

test('a zero-claim declaration cannot waive a beat whose page work is one call away', () => {
  const prd = `---
screen: init
---

## R3 — the drafted row becomes a card

- **Given** a crawled row
- **When** the depth pass drafts it
- **Then** the row becomes a card; the crumb names the screen
`
  const spec = `
test('init', async ({ page }) => {
  await checkReq('R3', async () => {
    intentGap('these are geometry, not values')
    await draftedRowBecomesCard(page, state)
  })
})
`
  const row = lintIntent(prd, spec, { screen: 'init', helpers: [STEPS] })[0]
  assert.equal(row.state, 'gap', 'the declaration is refused: the helper opens the page')
  assert.equal(row.ok, false)
  assert.match(row.why, /declared-on-an-open-page/)
})

test('a declaration is REFUSED on a fact that names an absence — that one is claimable', () => {
  // `proveVisible(locator, MISSING, …)` passes exactly when the thing is gone and fails, with the
  // app's own text as `got`, the moment it is back. A Then that says so must claim it.
  const prd = `---
screen: board
---

## R21 — one order

- **Given** the reader
- **When** you page to the next requirement
- **Then** it reads in that same order; there is no control to change it
`
  const spec = `
test('board', async ({ page }) => {
  await checkReq('R21', async () => {
    intentGap('there is nothing to read here')
    await proveVisible(page.locator('.sbhc'), 'behavior', 'The first cell', { soft: true })
  })
})
`
  const row = lintIntent(prd, spec)[0]
  assert.equal(row.facts, 2)
  assert.equal(row.state, 'gap', 'the declaration is refused')
  assert.equal(row.ok, false)
  assert.match(row.why, /absence/i)
  assert.match(row.why, /MISSING/, 'and it says what to write instead')
})

// (superseded 2026-09-04 by the controller's I4 — the narrow subject-only vocabulary let an
// absence the splitter had just isolated be declared away instead of claimed. What the wide list
// must NOT do is refuse a declaration on a beat that photographs nothing at all; that narrowing
// moved from the vocabulary into lintIntent, and is tested there.)

// ── FIX ROUND 2 (2026-09-04) — the controller's rulings C1, I1+I2, I3, I4 ────────────────────────

// C1 · A CONCISE ARROW HAS NO BRACE, and reading one as if it did credits a beat with claims it
// never makes. `functionBodies`' declaration scan took `text.indexOf('{', …)` as the body's opening
// brace, so `const op = (l) => l.evaluate(…)` captured the next `{` ANYWHERE in the file — on the
// board's own spec that handed `rowOf` 2514 chars of R23's checkReq and `marked` 3514 of R22's, and
// board R11's beat 2 read "2 claims" for a block that contains no proveVisible at all: the one false
// green the phase exists to make impossible. A body is the expression after `=>` up to the end of the
// statement, or the brace block when the brace is the very next thing.
test('functionBodies reads a CONCISE arrow as its expression, never the next brace in the file (C1)', () => {
  const src = [
    "const op = (l) => l.evaluate(n => n.getBoundingClientRect().width)",
    "const plain = s => s.trim()",
    "async function later (page) {",
    "  await proveVisible(page.locator('.n'), '4', 'To do', { soft: true })",
    "}"
  ].join('\n')
  const bodies = functionBodies(src)
  assert.match(bodies.get('op'), /getBoundingClientRect/)
  assert.equal(/proveVisible/.test(bodies.get('op')), false, 'a later block is not this arrow\'s body')
  assert.equal(bodies.get('plain').trim(), 's.trim()')
  assert.match(bodies.get('later'), /proveVisible/)
})

test('…so a block whose helpers make no claim reads honestly — the R11 b2 repro (C1)', () => {
  // the exact shape measured on spec/board/test.spec.ts at fix round 1's HEAD: a beat that calls a
  // concise-arrow helper and claims nothing, credited with the claims of an unrelated block below it.
  const spec = [
    "const width = (l) => l.evaluate(n => n.getBoundingClientRect().width)",
    "async function readBoth (page) {",
    "  await proveVisible(page.locator('.x'), '1', 'x', { soft: true })",
    "  await proveVisible(page.locator('.y'), '2', 'y', { soft: true })",
    "}",
    "test('reader', async ({ page }) => {",
    "  await checkReq('R1', async () => {",
    "    await proveVisible(page.locator('.a'), '1', 'one', { soft: true })",
    "    await proveVisible(page.locator('.b'), '2', 'two', { soft: true })",
    "  })",
    "  await checkReq('R1', async () => {",
    "    expect(await width(page.locator('.c'))).toBeGreaterThan(0)",
    "  })",
    "})",
    "test('elsewhere', async ({ page }) => {",
    "  await checkReq('R2', async () => {",
    "    await proveVisible(page.locator('.d'), 'x', 'd', { soft: true })",
    "    await proveVisible(page.locator('.e'), 'y', 'e', { soft: true })",
    "  })",
    "})"
  ].join('\n')
  const b2 = lintIntent(PRD_TWO_BEATS, spec).find(r => r.beat === 2 && r.id === 'R1')
  assert.equal(b2.claims, 0, 'the second block claims nothing')
  assert.equal(b2.ok, false)
})

const PRD_TWO_BEATS = `---
screen: todo
---

## R1 — two beats

- **Given** the seeded board
- **When** you tick one
- **Then** the count reads 4
- **When** you tick the last one
- **Then** the container completes itself
`

// I1 · THE LINT MIRRORS THE HARNESS EXACTLY. Block k IS beat k, and a requirement whose blocks do
// not walk its beats is a beat-mismatch: the harness files every block's harvest under the beat its
// POSITION names, so an extra block hands its pictures to a sentence it is not about (board R20 had
// seven blocks for six beats, and the beat-1 row showed another test's pictures).
test('a requirement with more blocks than beats is a beat-mismatch that fails the gate (I1)', () => {
  const spec = [
    "test('one', async ({ page }) => {",
    "  await checkReq('R1', async () => { await proveVisible(a, '4', 'To do', { soft: true }) })",
    "  await checkReq('R1', async () => { await proveVisible(a, 'done', 'The container', { soft: true }) })",
    "  await checkReq('R1', async () => { await proveVisible(a, 'x', 'clamped onto beat 2', { soft: true }) })",
    "})"
  ].join('\n')
  const rows = lintIntent(PRD_TWO_BEATS, spec)
  const mism = rows.find(r => r.state === 'beat-mismatch')
  assert.ok(mism, 'the mismatch is its own row')
  assert.equal(mism.ok, false, 'and it fails the gate')
  assert.match(mism.why, /3 blocks, 2 beats/)
})

test('…while a second test proving FEWER of its beats is NOT a mismatch (I1)', () => {
  // board R10 is proven by five tests, dispatch R5 by a unit and a flow: a test that walks beat 1
  // and stops is the many-to-many coverage the board is built on, not a defect. What catches the
  // real version — a block that harvests a beat without covering it (board R20's seventh) — is the
  // WORST-block scoring below, on that beat's own row.
  const spec = [
    "test('one', async ({ page }) => {",
    "  await checkReq('R1', async () => { await proveVisible(a, '4', 'To do', { soft: true }) })",
    "})",
    "test('two', async ({ page }) => {",
    "  await checkReq('R1', async () => { await proveVisible(a, '4', 'To do', { soft: true }) })",
    "  await checkReq('R1', async () => { await proveVisible(a, 'done', 'The container', { soft: true }) })",
    "})"
  ].join('\n')
  const rows = lintIntent(PRD_TWO_BEATS, spec)
  assert.equal(rows.some(r => r.state === 'beat-mismatch'), false)
  assert.equal(rows.every(r => r.ok), true, 'and both blocks cover the beat they harvest')
})

test('…while two tests that each walk the SAME beats are not a mismatch (I1)', () => {
  const spec = [
    "test('unit', async ({ page }) => {",
    "  await checkReq('R1', async () => { await proveVisible(a, '4', 'To do', { soft: true }) })",
    "  await checkReq('R1', async () => { await proveVisible(a, 'done', 'The container', { soft: true }) })",
    "})",
    "test('flow', async ({ page }) => {",
    "  await checkReq('R1', async () => { await proveVisible(a, '4', 'To do', { soft: true }) })",
    "  await checkReq('R1', async () => { await proveVisible(a, 'done', 'The container', { soft: true }) })",
    "})"
  ].join('\n')
  assert.equal(lintIntent(PRD_TWO_BEATS, spec).some(r => r.state === 'beat-mismatch'), false)
})

// I2 · THE row is scored on THE block of beat k — the last one to harvest it, whose pictures are
// the ones the board shows (workers:1, declaration order) — never the best of several. A beat that
// reads ok from one block while the picture comes from another is the false green in another dress.
test('a beat is scored on the block whose harvest the board shows, never the best (I2)', () => {
  const spec = [
    "test('unit', async ({ page }) => {",
    "  await checkReq('R1', async () => { await proveVisible(a, '4', 'To do', { soft: true }) })",
    "  await checkReq('R1', async () => { await proveVisible(a, 'done', 'The container', { soft: true }) })",
    "})",
    "test('flow', async ({ page }) => {",
    "  await checkReq('R1', async () => { expect(1).toBe(1) })",
    "  await checkReq('R1', async () => { await proveVisible(a, 'done', 'The container', { soft: true }) })",
    "})"
  ].join('\n')
  const b1 = lintIntent(PRD_TWO_BEATS, spec).find(r => r.beat === 1 && r.state !== 'beat-mismatch')
  assert.equal(b1.claims, 0, 'the flow block claims nothing, and its harvest is the one that lands')
  assert.equal(b1.ok, false)
  assert.ok(b1.line, 'the row names the line the verdict came from')
})

// I3 · THE FACT SPLIT IS BLUNT AND WIDE. No verb test: a Then is cut at every seam whose two sides
// each carry three words or more. Over-splitting is safe — a fragment is then either claimed or
// declared — while under-splitting HIDES a fact behind a green row.
test('splitFacts cuts every seam whose two sides carry three words each (I3)', () => {
  assert.deepEqual(splitFacts('the row stays listed — the count reads 4'),
    ['the row stays listed', 'the count reads 4'])
  // the old verb list read this as one fact; both sides are three words or more, so it is two
  assert.equal(splitFacts('it scrolls inside the card, the card\'s header stays pinned, and the page itself never scrolls').length, 3)
  // …but a short apposition is not a fact of its own — "route" is one word
  assert.equal(splitFacts('only cards matching a name, route, or requirement stay').length, 1)
  assert.equal(splitFacts('an Undo appears; the count stays 5').length, 2)
  // an aside still never splits
  assert.deepEqual(splitFacts('the banner is shown *(removed 2026-09-02; the human: "avoid useless things")*'),
    ['the banner is shown *(removed 2026-09-02; the human: "avoid useless things")*'])
  assert.deepEqual(splitFacts('the ring shows 2 / 4'), ['the ring shows 2 / 4'])
})

// I4 · AN ABSENCE IS ANY FACT WHOSE SUBJECT OR PREDICATE SAYS SOMETHING IS NOT THERE — tested on
// the strings this tree actually carries, never on a string invented for the test.
test('the absence vocabulary reads the tree\'s own facts (I4)', () => {
  assert.equal(isAbsenceFact('gone from the slot'), true, 'dispatch R5 b1, as splitFacts cuts it')
  assert.equal(isAbsenceFact('there is no control to change it'), true)
  assert.equal(isAbsenceFact('a moment that claimed nothing carries no chip at all'), true)
  assert.equal(isAbsenceFact('no design chip, no design link and no embedded wireframe exist anywhere in it'), true)
  assert.equal(isAbsenceFact('not a full-screen scrim'), true, 'board R10 b3, as splitFacts cuts it')
  assert.equal(isAbsenceFact('never refused or queued'), true, 'dispatch R4 b1, as splitFacts cuts it')
  assert.equal(isAbsenceFact('the card is gone from Open'), true, 'conflicts R4 b1')
  assert.equal(isAbsenceFact('no rows show'), true, 'init R4 b1')
  assert.equal(isAbsenceFact('the toast is dismissed'), true)
  assert.equal(isAbsenceFact('the box is cleared'), true)
  assert.equal(isAbsenceFact('the row vanishes'), true)
  assert.equal(isAbsenceFact('the count reads 4'), false)
  assert.equal(isAbsenceFact('the process is killed'), false)
  assert.equal(isAbsenceFact('the run panel opens naming that screen'), false)
})

// …and a declaration is refused for an absence ONLY where the beat photographs something. A beat
// that claims nothing at all has no page open (dispatch's specs drive /api/run with no browser), and
// an absence there has no more surface to ring than a presence does — refusing its declaration would
// demand a claim nobody can write.
test('an absence on a beat that photographs NOTHING may still be declared (I4)', () => {
  const prd = `---
screen: dispatch
---

## R5 — the takeover

- **Given** a job holding the slot
- **When** the person cancels it
- **Then** the process is killed, gone from the slot, and its partial work is left in place
`
  const spec = [
    "test('dispatch', async ({ request }) => {",
    "  await checkReq('R5', async () => {",
    "    intentGap('no page is open at all — this beat drives /api/cancel and reads the server\\'s own state')",
    "    expect((await request.post('/api/cancel')).status()).toBe(200)",
    "  })",
    "})"
  ].join('\n')
  const row = lintIntent(prd, spec)[0]
  assert.equal(row.state, 'declared')
  assert.equal(row.ok, true)
})

// …and a DECLARATION COVERS ONE FACT, like a claim does. A Then that names five facts, four of them
// on screen and one only in a file, is four claims and one declaration — not one declaration that
// waves the whole beat through.
test('a declaration covers one fact; the rest of the beat still needs its claims (I3)', () => {
  const prd = `---
screen: todo
---

## R1 — three facts

- **Given** the seeded board
- **When** you tick one sub-task
- **Then** the row stays listed, the count reads 4, and the log records the tick
`
  const one = [
    "test('todo', async ({ page }) => {",
    "  await checkReq('R1', async () => {",
    "    intentGap('the log is a file on disk — no screen shows it')",
    "    await proveVisible(a, 'Water the plants', 'The row', { soft: true })",
    "  })",
    "})"
  ].join('\n')
  const short = lintIntent(prd, one)[0]
  assert.equal(short.facts, 3)
  assert.equal(short.ok, false, 'one claim and one declaration do not cover three facts')
  const full = one.replace("    await proveVisible(a, 'Water the plants', 'The row', { soft: true })",
    "    await proveVisible(a, 'Water the plants', 'The row', { soft: true })\n    await proveVisible(b, '4', 'To do', { soft: true })")
  const row = lintIntent(prd, full)[0]
  assert.equal(row.state, 'declared')
  assert.equal(row.ok, true)
})

// …and the REFUSAL asks a narrower question than the vocabulary does. "Does this fact speak of an
// absence" (wide, above) tells an author a MISSING claim is available. "Is there a NAMED THING
// whose absence can be photographed" is what may refuse a declaration — and only that: a fragment
// like "not a truncated snippet" or "never a gap" says the app shows nothing OF A KIND, and a
// proveVisible(…, MISSING) on a selector the app has never had is an assertion that cannot fail,
// which is the one thing rule 2 refuses.
test('a declaration is refused only for an absence with a NAMED subject (I4)', () => {
  assert.equal(absenceTarget('there is no control to change it'), true)
  assert.equal(absenceTarget('a moment that claimed nothing carries no chip at all'), true)
  assert.equal(absenceTarget('no design chip, no design link and no embedded wireframe exist anywhere in it'), true)
  assert.equal(absenceTarget('the card is gone from Open'), true)
  assert.equal(absenceTarget('no rows show'), true)
  assert.equal(absenceTarget('not a truncated snippet'), false, 'dispatch R6 b1 — nothing to ring')
  assert.equal(absenceTarget('never a gap'), false, 'conflicts R1 b1')
  assert.equal(absenceTarget('never refused or queued'), false, 'dispatch R4 b1')
  assert.equal(absenceTarget('the count reads 4'), false)
})

test('a BACKTICK inside a regex character class is not a template literal (C1, second face)', () => {
  // spec/board/test.spec.ts:1246 — `const plain = (s) => String(s).replace(/[`*]/g, '')`. Read as a
  // template opener it swallowed 200 KB of the file, and every block calling `plain` was credited
  // with the 61 claims in that span: board R18 b1, R20 b2 and R23 b1 all read "33 claims" from a
  // two-line helper. A quote with no partner on its own line is not a string here.
  const src = [
    "const plain = (s) => String(s || '').replace(/[`*]/g, '').trim()",
    "async function far (page) {",
    "  await proveVisible(page.locator('.n'), '4', 'To do', { soft: true })",
    "}"
  ].join('\n')
  const bodies = functionBodies(src)
  assert.ok(bodies.get('plain').length < 80, 'the arrow body is the expression, not the file')
  assert.equal(/proveVisible/.test(bodies.get('plain')), false)
})

test('a checkReq named in a COMMENT is not a block (fix round 2)', () => {
  // spec/board/test.spec.ts:1884 — "// this is the SECOND checkReq('R19') of the test" — read as a
  // real call it invented a fourth block for a two-beat requirement, which BEAT_CURSOR then clamped
  // onto the last beat: a phantom block, and a beat-mismatch row nobody could fix by editing code.
  // Prose is not a claim (stripComments); prose is not a BLOCK either.
  const src = [
    "test('reader', async ({ page }) => {",
    "  await checkReq('R1', async () => { await proveVisible(a, '4', 'To do', { soft: true }) })",
    "  // this is the SECOND checkReq('R1') of the test, so the callout has advanced",
    "  /* and a block comment naming checkReq('R1') is not one either */",
    "  await checkReq('R1', async () => { await proveVisible(a, 'done', 'The container', { soft: true }) })",
    "})"
  ].join('\n')
  const blocks = extractCheckReqBlocks(src)
  assert.equal(blocks.length, 2, 'two real calls: ' + blocks.map(b => b.line).join(', '))
  assert.deepEqual(blocks.map(b => b.line), [2, 5], 'and their lines are unchanged by the masking')
})

// …AND THE CLI'S OWN WORD GATE ASKS THE SAME QUESTION THE IN-PAGE ONE DOES (fix round 2, I6 —
// completed 2026-09-04 after the census: the mark was read by `replicaGaps` and NOT by the loop
// here, so a toast, a dismiss control or any body-level overlay whose box happens to fall inside
// the region was still demanded back out of a file that can never contain it — board R16's ✕,
// measured at 1359,146 with `inRoot: 0`, reported as a missing word on a replica that was right).
test('the CLI word gate skips an element the skeleton marks OUTSIDE the scene root (I6)', () => {
  const root = repFixture({
    repin: true,
    layout: l => {
      l.rootMarked = 1
      l.els = l.els.map(e => ({ ...e, inRoot: 1 }))
      l.els[3] = { ...l.els[3], x: 120, y: 260, inRoot: 0 }   // moved INTO the region, outside the subtree
      return l
    }
  })
  try {
    const rows = checkReplicas(root).filter(r => r.file.endsWith('.expected.html'))
    assert.deepEqual(rows[0].gaps, [], 'an element outside the picture is not the picture\'s to show')
    assert.equal(rows[0].ok, true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
