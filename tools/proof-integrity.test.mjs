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
