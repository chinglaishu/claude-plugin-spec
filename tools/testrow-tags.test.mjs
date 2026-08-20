// testRow's coverage tag chips. A chip DISPLAYS the bare requirement id (data-r="R5", the pane's
// human-readable form), but a qualified cross-screen tag (`dispatch:R7` in another screen's spec)
// must stay machine-readable on the chip itself: the board R4/R6 self-check walks harvest tags
// per-pane, and a qualified id stripped to bare data-r is invisible to the OWNING screen's pane —
// the exact false positive that folded board:R4/R6=fail whenever the committed fold was current
// (2026-08-20, instance 2 of the walk flake). So every chip also carries data-q="<the original,
// possibly qualified id>": bare tags get data-q equal to data-r; qualified ones keep the qualifier.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testRow } from './build-board.mjs'

const s = { name: 'board' }
const plan = { title: 'a flow', steps: [], covers: [] }

test('a qualified tag keeps its bare display but carries the original id in data-q', () => {
  const t = { ok: true, ms: 1, reqs: { 'x:R3': 'pass' } }
  const h = testRow(s, plan, t)
  assert.match(h, /<span class="tag" data-r="R3" data-q="x:R3">R3<\/span>/)
})

test('a bare tag carries itself in data-q', () => {
  const t = { ok: true, ms: 1, reqs: { R3: 'pass' } }
  const h = testRow(s, plan, t)
  assert.match(h, /<span class="tag" data-r="R3" data-q="R3">R3<\/span>/)
})

test('tags enumerated from the source plan (a test that has not run) carry data-q too', () => {
  const h = testRow(s, { title: 'a flow', steps: [], covers: ['R1', 'dispatch:R7'] }, undefined)
  assert.match(h, /<span class="tag" data-r="R1" data-q="R1">R1<\/span>/)
  assert.match(h, /<span class="tag" data-r="R7" data-q="dispatch:R7">R7<\/span>/)
})
