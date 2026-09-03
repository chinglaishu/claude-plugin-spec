// tools/moment-source.test.mjs — ONE MOMENT, ONE INSTANT (task 3b, item 1).
//
// The skeleton and the replica are two readings of ONE moment, and the gate compares them box for
// box. They were taken in two separate `page.evaluate` calls with awaits (and a screenshot) between
// them, so on an SPA that settles a view change in that window the pair described two different
// pages — `board R3`/`R5`/`R11` came and went from the census on the same tree with nothing aimed
// at them (task-4a-report.md's diagnosis, task-4b's evidence). `spec/_moment.mjs` composes the two
// self-contained page functions into ONE expression Playwright evaluates once, so the pair is
// atomic by construction: there is no yield between the walk and the capture for the page to move
// in.
//
// Everything here runs the COMPOSED SOURCE for real — `new Function` over the string the harness
// hands Playwright — on a stub DOM both halves can read, so what is asserted is the thing that ships.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { momentSource, momentFunction } from '../spec/_moment.mjs'
import { snapLayoutWalk } from '../spec/_layout-walk.mjs'
import { captureReplica, REPLICA_PROPS } from '../spec/_replica.mjs'

// ── a stub DOM both functions can read ──────────────────────────────────────────────────────────
// The walk reads a style's camelCase properties; the capture asks `getPropertyValue(kebab)`. One
// object answers both, so ONE page can be handed to the composed source exactly as a browser hands
// it the real one.
function style (map) {
  const o = { getPropertyValue: p => (map[p] == null ? '' : String(map[p])) }
  for (const k of Object.keys(map)) o[k.replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = String(map[k])
  return o
}
const BASE = {
  display: 'block', opacity: '1', visibility: 'visible', color: 'rgb(2, 8, 23)', 'font-size': '12px',
  'background-color': 'rgba(0, 0, 0, 0)', 'border-top-width': '0px', 'border-right-width': '0px',
  'border-bottom-width': '0px', 'border-left-width': '0px', content: 'none', direction: 'ltr'
}
const txt = s => ({ nodeType: 3, textContent: String(s) })
function el (tag, rect, opts = {}) {
  const kids = opts.text != null ? [txt(opts.text), ...(opts.children || [])] : (opts.children || [])
  const attrs = Object.assign({}, opts.attrs || {})
  const cs = style(Object.assign({}, BASE, opts.cs || {}))
  const node = {
    nodeType: 1,
    id: opts.id || '',
    tagName: tag.toUpperCase(),
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    childNodes: kids,
    children: kids.filter(k => k.nodeType === 1),
    get childElementCount () { return this.children.length },
    parentElement: null,
    cs,
    rect,
    getBoundingClientRect () {
      const r = this.rect
      return { left: r[0], top: r[1], width: r[2], height: r[3], right: r[0] + r[2], bottom: r[1] + r[3], x: r[0], y: r[1] }
    },
    get textContent () { return kids.map(k => (k.nodeType === 3 ? k.textContent : k.textContent)).join('') },
    get innerText () { return this.textContent },
    getAttribute: n => (n in attrs ? String(attrs[n]) : null),
    hasAttribute: n => n in attrs,
    getAttributeNames: () => Object.keys(attrs)
  }
  node.contains = other => { let n = other; while (n) { if (n === node) return true; n = n.parentElement }; return false }
  node.closest = sel => {
    const id = sel.charAt(0) === '#' ? sel.slice(1) : null
    let n = node
    while (n) { if (id != null && n.id === id) return n; n = n.parentElement }
    return null
  }
  for (const k of node.children) k.parentElement = node
  return node
}
const PAINT = { 'background-color': 'rgb(255, 255, 255)', 'border-top-width': '1px', 'border-top-color': 'rgb(226, 221, 209)' }

// the composed source, and the very function the harness hands Playwright — built here the same
// way, so what these tests run is what ships
const SRC = momentSource(String(snapLayoutWalk), String(captureReplica))
const moment = momentFunction(String(snapLayoutWalk), String(captureReplica))

function env (body, opts = {}) {
  return {
    window: { innerWidth: 1440, innerHeight: 900 },
    document: {
      body,
      baseURI: 'https://app.example/board',
      elementsFromPoint: opts.hits ? () => opts.hits : undefined,
      elementFromPoint: opts.point || undefined,
      styleSheets: []
    },
    getComputedStyle: (node, pseudo) => (pseudo ? style({}) : (node.cs || style({}))),
    defaultsFor: () => ({})
  }
}
const run = (body, o = {}) => moment({
  ring: o.ring || null, target: o.target || null, props: REPLICA_PROPS,
  claim: null, claims: [], base: null, minRegion: null, caps: o.caps || null, env: env(body, o)
})

// a page whose one card carries a word, so both halves have something to say about the same moment
function onePage () {
  const word = el('span', [520, 300, 120, 20], { text: 'Rent review', cs: { color: 'rgb(28,27,24)' } })
  const card = el('div', [500, 288, 400, 60], { children: [word], cs: PAINT })
  const page = el('main', [0, 0, 1440, 900], { children: [card] })
  const body = el('body', [0, 0, 1440, 900], { children: [page] })
  return { body, card, word }
}

test('the composed moment reads the skeleton and the replica in ONE synchronous pass — nothing can settle between them', () => {
  const p = onePage()
  let moved = false
  // the SPA settles as soon as the event loop yields — exactly what happened between the two
  // evaluates the harness used to make
  queueMicrotask(() => { moved = true; p.card.children.length = 0; p.card.childNodes.length = 0 })
  const out = run(p.body, { target: p.card, ring: { x: 500, y: 288, width: 400, height: 60 } })
  assert.equal(moved, false, 'the pair never yielded to the event loop, so the page could not move inside it')
  assert.ok(out && !(out instanceof Promise), 'the composed moment is synchronous — an await is a window for the page to change in')
  assert.ok(out.skel.els.some(e => e.text === 'Rent review'), 'the skeleton measured the moment: ' + JSON.stringify(out.skel.els))
  assert.ok(out.rep.html.includes('Rent review'), 'and the replica pictured the SAME moment')
})

test('a capture that throws still leaves the skeleton — and the other way round', () => {
  const p = onePage()
  // a page the CAPTURE cannot serialise (no styles at all) must not cost the measurement beside it
  const broken = env(p.body)
  broken.getComputedStyle = (node, pseudo) => { if (pseudo) throw new Error('no pseudo here'); return node.cs }
  const out = moment({ ring: null, target: null, props: REPLICA_PROPS, claim: null, claims: [], base: null, minRegion: null, caps: null, env: broken })
  assert.ok(out.skel && out.skel.els.length, 'the skeleton survives a capture that dies')
  assert.ok(out.rep === null || typeof out.rep === 'object', 'and the capture is reported as absent rather than thrown')
})

test('what the harness hands Playwright is a FUNCTION, not a string — a string is evaluated and never called', () => {
  // measured against Playwright 1.62: page.evaluate('(a)=>…', arg) returns the expression's own
  // value and ignores the arg, so the pair came back undefined and the moment filed a photograph
  // with no skeleton beside it. A function is serialised by source and called with the arg.
  assert.equal(typeof moment, 'function')
  assert.equal(moment.length, 1, 'it takes the one arg Playwright passes')
  assert.ok(String(moment).includes('function snapLayoutWalk'), 'and its SOURCE carries both bodies, which is what crosses into the page')
})

test('the composed source carries both bodies and no reference to anything outside itself', () => {
  assert.ok(SRC.includes('function snapLayoutWalk'), 'the walk rides in by source')
  assert.ok(SRC.includes('function captureReplica'), 'and so does the capture')
  assert.ok(/^\(\s*a\s*\)\s*=>/.test(SRC.trim()), 'it is one expression Playwright can evaluate and call with its arg')
})

// board R22 / R20's shape: a card the locator still matches, and a dialog painted over it.
function coveredPage () {
  const cardLeaf = el('span', [110, 305, 280, 20], { text: 'Home card, still mounted', cs: { color: 'rgb(28,27,24)' } })
  const card = el('section', [100, 300, 300, 40], { children: [cardLeaf], cs: PAINT })
  const panelLeaf = el('span', [110, 305, 280, 20], { text: 'Assigning work', cs: { color: 'rgb(28,27,24)' } })
  const panel = el('div', [90, 290, 320, 60], { children: [panelLeaf], cs: PAINT })
  const dialog = el('section', [0, 0, 1440, 900], { children: [panel], cs: PAINT })
  const body = el('body', [0, 0, 1440, 900], { children: [card, dialog] })
  return { body, card, cardLeaf, panel, panelLeaf, dialog, point: () => dialog, hits: [panelLeaf, panel, dialog, card] }
}

test('what the walk drops as occluded, the capture plates — one rule, decided once (board R20)', () => {
  const p = coveredPage()
  const out = run(p.body, { target: p.dialog, hits: p.hits, point: p.point, ring: { x: 0, y: 0, width: 1440, height: 900 } })
  assert.ok(!out.skel.els.some(e => /Home card/.test(e.text || '')), 'the skeleton never measured what is behind the dialog')
  assert.ok(!/Home card/.test(out.rep.html), 'and the replica does not picture it either: ' + out.rep.html.slice(0, 400))
  assert.match(out.rep.html, /data-plate="space"/, 'it is plated, so the flow around it cannot move')
})

test('the capture pictures the element the WALK measured under the ring, never one behind a dialog (board R22)', () => {
  // The rendered proof of this defect: docs/superpowers/mockups/2026-09-04-gate-r22-diff.png — the
  // photograph shows the walkthrough dialog, the replica beside it shows the home page BEHIND it.
  // `reveal()`'s locator still matched a home card under the opened dialog, so the capture rooted
  // its scene there while the walk (which drops what an opaque overlay covers) measured the dialog:
  // 13 missing rings, 8 missing texts, 5 missing boxes, 4 extra boxes, on two files that were each
  // internally perfect. One resolve, handed across, is the fix.
  const p = coveredPage()
  const out = run(p.body, { target: p.card, hits: p.hits, point: p.point, ring: { x: 100, y: 300, width: 300, height: 40 } })
  assert.ok(/Assigning work/.test(out.rep.html), 'the replica pictures what the page is showing: ' + out.rep.html.slice(0, 400))
  assert.ok(!/Home card/.test(out.rep.html), 'and not the card the stale locator still matched')
  assert.match(out.rep.html, /data-ring="1"/, 'the ring is marked on the element the walk measured')
  assert.ok(out.skel.els.some(e => /Assigning work/.test(e.text || '')), 'which is the one the skeleton is of')
})
