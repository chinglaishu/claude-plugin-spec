// tools/graft.test.mjs — THE GRAFT (phase 8 A4, 2026-09-05), the rule that makes an Expected cell
// one page instead of one component floating on paper: the screen's BASE with this moment's PATCH
// standing where the same element stands in it, everything off that path faded as context.
//
// The file under test is browser code inlined verbatim into board.html (like stepper.js and
// words.js), so it is run here exactly as the page runs it — `new Function` over the real bytes,
// defining globalThis.SBGraft — and asserted on a stub node shape rather than in a browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// eslint-disable-next-line no-new-func
new Function(readFileSync(new URL('./board/graft.js', import.meta.url), 'utf8'))()

const node = (tag, kids = []) => {
  const n = {
    tag,
    children: kids,
    attrs: {},
    parentElement: null,
    setAttribute (k, v) { this.attrs[k] = String(v) },
    replaceWith (o) {
      const p = this.parentElement
      const i = p.children.indexOf(this)
      p.children[i] = o
      o.parentElement = p
    }
  }
  for (const k of kids) k.parentElement = n
  return n
}

test('graft replaces the element at the path and fades everything off the path', () => {
  const row = node('div'); const other = node('div')
  const list = node('div', [other, row])
  const aside = node('aside')
  const body = node('body', [aside, node('main', [node('h1'), list])])
  const patch = node('div')
  const r = globalThis.SBGraft.graft(body, patch, '1/1/1')
  assert.equal(r.ok, true)
  assert.equal(list.children[1], patch, 'the patch stands where the row stood')
  assert.equal(aside.attrs['data-ctx'], '1')
  assert.equal(other.attrs['data-ctx'], '1')
  assert.equal(list.attrs['data-ctx'], undefined, 'an ancestor of the graft keeps full ink')
  assert.equal(patch.attrs['data-ctx'], undefined)
})

// ONE FADE PER BRANCH (2026-09-06). The srcdoc sheet fades `data-ctx` with `opacity:.4`, and
// opacity COMPOUNDS through nesting — so marking every off-path DESCENDANT as well as its branch's
// top renders a leaf N levels down at .4^N. Measured on demo/todo R2 b1: 135 of 154 elements
// marked, the worst chain six deep ⇒ opacity .004, an Expected cell that read as blank paper beside
// an Actual photograph showing the whole task list. A subtree must fade exactly once.
test('an off-path subtree carries exactly one data-ctx — the fade cannot compound', () => {
  const leaf = node('span')
  const aside = node('aside', [node('div', [node('div', [leaf])])])
  const row = node('div')
  const body = node('body', [aside, node('main', [row])])
  const r = globalThis.SBGraft.graft(body, node('div'), '1/0')
  assert.equal(r.ok, true)
  const marked = []
  for (let n = leaf; n && n !== body; n = n.parentElement) if (n.attrs['data-ctx']) marked.push(n)
  assert.equal(marked.length, 1, 'exactly one data-ctx in a deep off-path leaf’s ancestry')
  assert.equal(marked[0], aside, 'and it is the TOPMOST off-path element of the branch')
})

test('an empty path is the whole page: nothing replaced, nothing faded', () => {
  const body = node('body', [node('div')])
  const r = globalThis.SBGraft.graft(body, node('div'), '')
  assert.equal(r.ok, true)
  assert.equal(r.why, 'whole page')
  assert.equal(body.children[0].attrs['data-ctx'], undefined)
})

test('a path the base cannot follow is refused with a reason, and the base is untouched', () => {
  const kid = node('div')
  const body = node('body', [kid])
  const r = globalThis.SBGraft.graft(body, node('div'), '0/4')
  assert.equal(r.ok, false)
  assert.match(r.why, /no element at 0\/4/)
  assert.equal(body.children[0], kid, 'nothing moved')
  assert.equal(kid.attrs['data-ctx'], undefined, 'and nothing was faded on the way out')
})

// A refusal must never leave the base half-marked: the reader falls back to today's lone-patch
// rendering on `ok:false`, and a base carrying stray fades would then be reused for the next moment
// (repFetch caches the text, but the parsed tree is per-paint — this is the belt to that braces).
test('the walk is the only thing that reads the path, and a non-numeric segment is refused too', () => {
  const body = node('body', [node('div', [node('span')])])
  assert.equal(globalThis.SBGraft.walk(body, '0/0').tag, 'span')
  assert.equal(globalThis.SBGraft.walk(body, '0/x'), null)
  assert.equal(globalThis.SBGraft.walk(body, ''), body)
  assert.equal(globalThis.SBGraft.graft(body, node('div'), '0/x').ok, false)
})

test('a missing base or patch is refused rather than throwing — the reader falls back, never blanks', () => {
  assert.equal(globalThis.SBGraft.graft(null, node('div'), '0').ok, false)
  assert.equal(globalThis.SBGraft.graft(node('body', [node('div')]), null, '0').ok, false)
})

// ── WHERE THE PAGE STANDS IN THE FRAME (2026-09-06) ──────────────────────────────────────────────
// The defect this closes, measured on demo/todo before the fix: in the Expected cell the ring sat a
// whole row ABOVE the thing it marks. A body-rooted base's markup lays out in DOCUMENT coordinates
// (the window's scroll is not baked into its flow — only a scrolled BOX's own scrollTop is), while
// `data-ring-box`, the camera's rects and the chips are all VIEWPORT coordinates of the moment on
// show. The two frames differ by exactly that moment's scroll, and the scroll was recorded NOWHERE,
// so the reader could not convert: it stood the base at the page origin (right only at scroll 0) and
// before that at the base's own region.y (right only when the two scrolls happened to agree).
// `data-replica-scroll` records it at capture; `stand` is the conversion, and it never invents a
// scroll it was not given (rule 3) — a legacy harvest keeps exactly today's answer.
test('a whole-page base stands at MINUS the moment’s scroll, so a viewport ring lands on its element', () => {
  const at = globalThis.SBGraft.stand({
    whole: true,
    region: { x: 0, y: -89, w: 1440, h: 900 },
    scroll: { x: 0, y: 89 },
    moment: { x: 0, y: 89 }
  })
  assert.deepEqual(at, { x: 0, y: -89, w: 1440, h: 900 })
  // the element the ring marks sits at document y 869; the ring was measured at viewport y 780
  assert.equal(at.y + 869, 780, 'the base’s own element renders under the ring, not 89 px below it')
})

test('the moment’s scroll is the patch’s, not the base’s — one base, two moments, two offsets', () => {
  // demo/todo R7: one beat, one base, and the page scrolled between its two moments (129 → 112)
  const base = { x: 0, y: -129, w: 1440, h: 900 }
  assert.equal(globalThis.SBGraft.stand({ whole: true, region: base, scroll: { x: 0, y: 129 }, moment: { x: 0, y: 129 } }).y, -129)
  assert.equal(globalThis.SBGraft.stand({ whole: true, region: base, scroll: { x: 0, y: 129 }, moment: { x: 0, y: 112 } }).y, -112)
  // …and R8's second moment, back at the top of the page, must not move at all
  assert.equal(globalThis.SBGraft.stand({ whole: true, region: base, scroll: { x: 0, y: 129 }, moment: { x: 0, y: 0 } }).y, 0)
})

test('an unscrolled moment stands exactly where it stands today — the zero cases do not move', () => {
  const at = globalThis.SBGraft.stand({
    whole: true, region: { x: 0, y: 0, w: 1440, h: 900 }, scroll: { x: 0, y: 0 }, moment: { x: 0, y: 0 }
  })
  assert.deepEqual(at, { x: 0, y: 0, w: 1440, h: 900 })
})

test('a harvest from before data-replica-scroll keeps today’s answer — no scroll is invented', () => {
  assert.deepEqual(
    globalThis.SBGraft.stand({ whole: true, region: { x: 0, y: -89, w: 1440, h: 900 }, scroll: null, moment: null }),
    { x: 0, y: 0, w: 1440, h: 900 }, 'a whole page still stands at the page origin')
  assert.deepEqual(
    globalThis.SBGraft.stand({ whole: false, region: { x: 271, y: 195, w: 738, h: 70 }, scroll: null, moment: null }),
    { x: 271, y: 195, w: 738, h: 70 }, 'and a lone patch still stands at its own region')
})

test('a lone cropped patch is its own moment: its region IS where it stands', () => {
  const reg = { x: 271, y: 195, w: 738, h: 70 }
  assert.deepEqual(
    globalThis.SBGraft.stand({ whole: false, region: reg, scroll: { x: 0, y: 89 }, moment: { x: 0, y: 89 } }),
    reg, 'the scene root’s own viewport rect, whatever the page was scrolled to')
  // …and a cropped scene shown at a DIFFERENT moment is carried across the difference
  assert.deepEqual(
    globalThis.SBGraft.stand({ whole: false, region: reg, scroll: { x: 0, y: 89 }, moment: { x: 0, y: 0 } }),
    { x: 271, y: 284, w: 738, h: 70 })
})

test('stand refuses to answer without a region, and the horizontal scroll counts too', () => {
  assert.equal(globalThis.SBGraft.stand({ whole: true, region: null, scroll: { x: 0, y: 0 }, moment: { x: 0, y: 0 } }), null)
  assert.deepEqual(
    globalThis.SBGraft.stand({ whole: true, region: { x: 0, y: 0, w: 1440, h: 900 }, scroll: { x: 40, y: 10 }, moment: { x: 40, y: 10 } }),
    { x: -40, y: -10, w: 1440, h: 900 })
})
