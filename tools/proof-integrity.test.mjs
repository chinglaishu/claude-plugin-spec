import test from 'node:test'
import assert from 'node:assert/strict'
import { extractCheckReqBlocks, hasValueAssertion, lintSource, perturbNumbers } from './proof-integrity.mjs'

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
import { layoutHash } from './viz.mjs'
import { checkReplicas } from './proof-integrity.mjs'

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
const CLAIMS = '[{&quot;label&quot;:&quot;the row&quot;,&quot;expected&quot;:&quot;Pay the electricity bill&quot;,' +
  '&quot;got&quot;:&quot;&quot;,&quot;ok&quot;:false}]'

const repFixture = (mutate = {}) => {
  const root = join(tmpdir(), 'replica-gate-' + Math.random().toString(36).slice(2))
  mkdirSync(join(root, 'todo', 'evidence'), { recursive: true })
  const lay = mutate.layout ? mutate.layout(structuredClone(RLAY)) : RLAY
  writeFileSync(join(root, 'todo', 'evidence', 'R1.b1.after.layout.json'), JSON.stringify(lay))
  // `repin` re-pins the replica to the layout the fixture just wrote — for a test about the WORDS,
  // where a mutated skeleton would otherwise also fail on the pin and prove nothing about the words
  const pin = layoutHash(mutate.repin ? lay : RLAY, null)
  const actual = REP_ROOT('actual', ACTUAL_BODY, '', pin)
  writeFileSync(join(root, 'todo', 'evidence', 'R1.b1.after.actual.html'),
    mutate.actual ? mutate.actual(actual) : actual)
  const expected = REP_ROOT('expected', ACTUAL_BODY, ' data-claims="' + CLAIMS + '"', pin)
  writeFileSync(join(root, 'todo', 'evidence', 'R1.b1.after.expected.html'),
    mutate.expected ? mutate.expected(expected) : expected)
  return root
}

test('the replica gate passes a gated pair whose pin, words and claims all still hold', () => {
  const root = repFixture()
  try {
    const rows = checkReplicas(root).sort((a, b) => a.file.localeCompare(b.file))
    assert.equal(rows.length, 2)
    assert.deepEqual(rows.map(r => r.ok), [true, true], rows.map(r => r.why).join(' | '))
    assert.equal(rows[0].screen, 'todo')
    assert.equal(rows[0].id, 'R1')
    assert.match(rows[0].file, /R1\.b1\.after\.actual\.html$/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('deleting a text node from a replica fixture fails the gate — the plan\'s own acceptance', () => {
  const root = repFixture({ actual: h => h.replace('<div class="r1">Pay the electricity bill</div>', '') })
  try {
    const rows = checkReplicas(root).filter(r => r.file.endsWith('.actual.html'))
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
    const rows = checkReplicas(root).filter(r => r.file.endsWith('.actual.html'))
    assert.equal(rows[0].ok, false)
    assert.equal(rows[0].gaps[0].kind, 'missing-text')
    assert.match(rows[0].gaps[0].what, /Outside the scene root/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the replica gate refuses one the harvest has moved past — the layout pin', () => {
  const root = repFixture({ layout: l => { l.els[1] = { ...l.els[1], w: 140 }; return l } })
  try {
    const rows = checkReplicas(root)
    assert.deepEqual(rows.map(r => r.ok), [false, false])
    assert.match(rows[0].why, /pin has moved/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('an UNGATED replica is refused — a picture nobody measured is not a proven likeness', () => {
  const root = repFixture({ actual: h => h.replace(/ data-replica-layout="[^"]*"/, '') })
  try {
    const rows = checkReplicas(root).filter(r => r.file.endsWith('.actual.html'))
    assert.equal(rows[0].ok, false)
    assert.match(rows[0].why, /not gated/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('an Expected that does not carry a failed claim\'s own value is refused', () => {
  // the BODY loses the words (the claim in data-claims still asks for them — that is the point)
  const root = repFixture({ expected: h => h.replace('<div class="r1">Pay the electricity bill</div>', '<div class="r1">Renew passport</div>') })
  try {
    const rows = checkReplicas(root).filter(r => r.file.endsWith('.expected.html'))
    assert.equal(rows[0].ok, false)
    assert.equal(rows[0].gaps[0].kind, 'missing-claim')
    assert.match(rows[0].gaps[0].what, /electricity/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the Expected is NOT geometry-gated — its content may be an older moment\'s layout', () => {
  // the rereview's deferred question: an Expected's root carries THIS moment's region while its body
  // can be a base's tree. Deleting a word the live skeleton measured is a gap on the ACTUAL only.
  const root = repFixture({ expected: h => h.replace('<h1 class="r1">All tasks</h1>', '') })
  try {
    const rows = checkReplicas(root).filter(r => r.file.endsWith('.expected.html'))
    assert.equal(rows[0].ok, true, rows[0].why)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a gap the IN-PAGE walk already found rides on the file and is reported here', () => {
  const gaps = '[{&quot;kind&quot;:&quot;missing-box&quot;,&quot;what&quot;:&quot;row&quot;,&quot;x&quot;:1,&quot;y&quot;:2,&quot;w&quot;:3,&quot;h&quot;:4}]'
  const root = repFixture({ actual: h => h.replace('data-replica-gaps="[]"', 'data-replica-gaps="' + gaps + '"') })
  try {
    const rows = checkReplicas(root).filter(r => r.file.endsWith('.actual.html'))
    assert.equal(rows[0].ok, false)
    assert.equal(rows[0].gaps[0].kind, 'missing-box')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a TRUNCATED replica is a gap — a picture that ran out of bytes cannot be a likeness', () => {
  const root = repFixture({ actual: h => h.replace('data-replica-kit', 'data-replica-truncated="1" data-replica-kit') })
  try {
    const rows = checkReplicas(root).filter(r => r.file.endsWith('.actual.html'))
    assert.equal(rows[0].ok, false)
    assert.equal(rows[0].gaps[0].kind, 'truncated')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a replica whose skeleton is gone is refused, not quietly passed', () => {
  const root = repFixture()
  try {
    rmSync(join(root, 'todo', 'evidence', 'R1.b1.after.layout.json'))
    const rows = checkReplicas(root)
    assert.deepEqual(rows.map(r => r.ok), [false, false])
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
    const rows = checkReplicas(root).filter(r => r.file.endsWith('.actual.html'))
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
    assert.equal(checkReplicas(root).filter(r => r.file.endsWith('.actual.html'))[0].ok, true)
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
    assert.equal(checkReplicas(root).filter(r => r.file.endsWith('.actual.html'))[0].ok, true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the CLI\'s node text gate never demands text back from a style/script/etc-tagged element', () => {
  const root = repFixture({
    repin: true,
    layout: l => { l.els.push({ x: 120, y: 250, w: 300, h: 20, kind: 'image', tag: 'style', text: '.wf0{animation:x 1s}' }); return l }
    // the actual body carries NOTHING matching that text — if the gate demanded it back, this would fail
  })
  try {
    assert.equal(checkReplicas(root).filter(r => r.file.endsWith('.actual.html'))[0].ok, true)
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
import { splitFacts, lintIntent } from './proof-integrity.mjs'

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
  const rows = lintIntent(prd, spec)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].beat, 1)
  assert.equal(rows[0].claims, 1, "beat 1 is proven by the best of the two tests' first blocks")
  assert.equal(rows[1].beat, 2)
  assert.equal(rows[1].claims, 1)
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
})
