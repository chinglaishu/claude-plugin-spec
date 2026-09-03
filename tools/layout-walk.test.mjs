// tools/layout-walk.test.mjs — the layout skeleton's walk (spec/_layout-walk.mjs), pinned where it
// went wrong on 2026-09-03 (the human, on dojostack's House View screen: "the schematic is useless —
// screenshot 1 is off focus, screenshot 2 is supposed to have a versioning component but nothing is
// shown"). Both skeletons had hit the element cap in DOCUMENT ORDER — sidebar, nav, wrapper divs —
// and never measured the ringed element, so the drawing rang empty space beside a photograph of a
// value. The walk now runs on a stub DOM here, so what it must always capture is asserted, not hoped.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { snapLayoutWalk } from '../spec/_layout-walk.mjs'

// ── a tiny DOM: enough of Element / CSSStyleDeclaration for the walk to read ────────────────────
function el (tag, rect, opts = {}) {
  const kids = opts.children || []
  const node = {
    tagName: tag.toUpperCase(),
    id: opts.id || '',
    className: opts.className || '',
    children: kids,
    childElementCount: kids.length,
    textContent: opts.text != null ? opts.text : kids.map(k => k.textContent).join(''),
    innerText: opts.text != null ? opts.text : kids.map(k => k.innerText).join(' '),
    cs: Object.assign({ opacity: '1', visibility: 'visible', color: 'rgb(2, 8, 23)', fontSize: '12px', textAlign: 'left',
      backgroundColor: 'rgba(0, 0, 0, 0)', borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px',
      borderLeftWidth: '0px', borderTopLeftRadius: '0px', paddingLeft: '0px', paddingRight: '0px', fontWeight: '400',
      fontFamily: 'Inter, sans-serif', textTransform: 'none', fontStyle: 'normal', textDecorationLine: 'none',
      direction: 'ltr', content: 'none' }, opts.cs || {}),
    getBoundingClientRect: () => ({ left: rect[0], top: rect[1], width: rect[2], height: rect[3],
      right: rect[0] + rect[2], bottom: rect[1] + rect[3], x: rect[0], y: rect[1] }),
    getAttribute: n => (opts.attrs && n in opts.attrs) ? opts.attrs[n] : null,
    hasAttribute: n => !!(opts.attrs && n in opts.attrs)
  }
  for (const k of kids) k.parentElement = node
  return node
}
const painted = { backgroundColor: 'rgb(255, 255, 255)', borderTopWidth: '1px', borderTopColor: 'rgb(226, 232, 240)' }
function env (body, hits = null) {
  return {
    window: { innerWidth: 1440, innerHeight: 900 },
    document: { body, elementsFromPoint: hits ? () => hits : undefined },
    getComputedStyle: node => node.cs || {}
  }
}
const walk = (body, ring, target = null, hits = null) =>
  snapLayoutWalk({ ring, target, env: env(body, hits) })

// A page shaped like the failing one: a deep sidebar + header of MANY nested wrapper boxes first in
// document order, then a data grid whose ringed cell sits deep and late. `n` wrappers stand before it.
function bigPage (n, { ringCell = true } = {}) {
  const wrappers = []
  for (let i = 0; i < n; i++) {
    // each a painted, sized box so the OLD walk records it — the budget-eaters the real page had
    wrappers.push(el('div', [0, 40 + (i % 40) * 20, 240, 18], { cs: painted }))
  }
  const sidebar = el('nav', [0, 0, 240, 900], { children: wrappers, cs: painted })
  const far = el('div', [1300, 100, 100, 30], { text: 'far label', cs: painted })
  const valueSpan = el('span', [744, 656, 106, 16], { text: '4.00%' })
  const cellWrap = el('div', [732, 648, 130, 32], { children: [valueSpan] })
  const cell = el('div', [732, 648, 130, 32], { children: [cellWrap], cs: painted, attrs: { role: 'gridcell' } })
  const nextCell = el('div', [862, 648, 100, 32], { children: [el('span', [874, 656, 76, 16], { text: '4.00%' })], cs: painted })
  const rowLabel = el('div', [504, 648, 200, 32], { children: [el('span', [510, 656, 60, 16], { text: 'Input' })], cs: painted })
  const row = el('div', [262, 648, 1156, 32], { children: [rowLabel, cell, nextCell], attrs: { role: 'row' } })
  // fifteen more grid rows ABOVE the ringed one, each with three painted cells, so the grid alone is big
  const rows = []
  for (let i = 0; i < 15; i++) {
    const y = 300 + i * 22
    rows.push(el('div', [262, y, 1156, 20], { attrs: { role: 'row' }, children: [
      el('div', [504, y, 200, 20], { children: [el('span', [510, y + 2, 60, 14], { text: 'Row ' + i })], cs: painted }),
      el('div', [732, y, 130, 20], { children: [el('span', [744, y + 2, 100, 14], { text: (2 + i * 0.1).toFixed(2) + '%' })], cs: painted }),
      el('div', [862, y, 100, 20], { children: [el('span', [874, y + 2, 76, 14], { text: '2.18%' })], cs: painted })
    ] }))
  }
  // eight levels of UNPAINTED wrappers between the main region and the grid, as ag-grid + app shells stack
  let grid = el('div', [262, 264, 1156, 610], { children: [...rows, row] })
  for (let d = 0; d < 8; d++) grid = el('div', [260 + d, 100 + d, 1160 - 2 * d, 776 - 2 * d], { children: [grid] })
  const main = el('main', [240, 0, 1200, 900], { children: [far, grid] })
  const body = el('body', [0, 0, 1440, 900], { children: [sidebar, main] })
  return { body, cell, valueSpan, ring: ringCell ? { x: 732, y: 648, width: 130, height: 32 } : null }
}

test('the ringed element and its words are captured even when the page has more boxes than the cap', () => {
  const p = bigPage(500)
  const L = walk(p.body, p.ring)
  const focus = L.els.filter(e => e.focus)
  assert.ok(focus.length >= 1, 'the ringed element is in the skeleton (it was measured last, past the cap, before)')
  assert.ok(focus.some(e => e.text === '4.00%'), 'and the value the ring is around is its text: ' + JSON.stringify(focus))
})

test('the ring is found from the element itself when the caller hands it over, not only from geometry', () => {
  const p = bigPage(500)
  const L = walk(p.body, p.ring, p.cell)
  assert.ok(L.els.some(e => e.focus && e.x === 732 && e.w === 130), 'the handed-over cell is the focused box')
  assert.ok(L.els.some(e => e.text === '4.00%' && e.x === 744), 'its own leaf rides in with it')
})

test('the rest of the budget is spent nearest the ring first — the ringed row\'s neighbours beat the far sidebar', () => {
  const p = bigPage(500)
  const L = walk(p.body, p.ring)
  assert.ok(L.els.some(e => e.text === 'Input'), 'the row label two cells left of the ring is captured')
  assert.ok(L.els.some(e => e.text === '4.00%' && e.x === 874), 'so is the next cell in the row')
  assert.ok(L.els.some(e => e.text === 'Row 14'), 'and the row just above it')
  const sidebarBoxes = L.els.filter(e => e.x === 0 && e.w === 240 && e.h === 18).length
  assert.ok(sidebarBoxes < 300, 'the sidebar no longer takes the whole budget (' + sidebarBoxes + ' of its 500 boxes, under 300)')
  assert.ok(L.els.length <= 360, 'the cap still holds: ' + L.els.length)
})

test('an unpainted wrapper — no background, no border, no words — is not recorded; what it wraps is', () => {
  const p = bigPage(10)
  const L = walk(p.body, p.ring)
  const wrappers = L.els.filter(e => e.kind === 'container' && !e.bg && !e.bd && !e.text && !e.focus)
  assert.deepEqual(wrappers, [], 'no invisible wrapper takes a slot the drawing never paints')
  assert.ok(L.els.some(e => e.text === 'far label'), 'a painted, worded box far from the ring is still there when the budget allows')
  assert.ok(L.els.some(e => e.kind === 'row'), 'rows keep their own kind and are recorded')
})

test('without a ring the walk still measures the page in order, painted boxes and words only', () => {
  const p = bigPage(20, { ringCell: false })
  const L = walk(p.body, null)
  assert.equal(L.ring, null)
  assert.ok(L.els.every(e => !e.focus))
  assert.ok(L.els.some(e => e.text === 'Row 3'))
})
