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
