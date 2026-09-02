// tools/dye.test.mjs — THE DYE MAPPER (mirror-8, 2026-09-02).
//
// The harvest now records what the real screen is COLOURED (spec/_base.ts snapLayout: bg / fg / bd
// as plain "r,g,b"), and the schematic must show the chips, the primary button, the ticked box and
// the struck-through row that the grey skeleton was throwing away. But the board's rule is absolute:
// **no raw colour ever enters board.html**. So the app's colours are mapped to the nearest DESIGN
// TOKEN at derive time and the drawing emits only var(--token) — the captured rgb lives in the
// layout JSON, which is data, and never in the SVG.
//
// Two things are pinned here, and both must fail loudly:
//   1. the mapper's own reference values ARE spec/_design.css's values (read out of the file, so a
//      palette edit that moves a dye breaks this test rather than silently re-hueing every drawing);
//   2. the mapping TABLE — a purple button lands on 藍 ai, a red on 弁柄 bengara, a gold on 山吹
//      yamabuki, a green on 苔 koke, white on paper, near-black ink on ink.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dyeOf, DYES } from './viz.mjs'

// the palette, read from the ONE source (spec/_design.css :root) — never restated here
const CSS = readFileSync(new URL('../spec/_design.css', import.meta.url), 'utf8')
const PALETTE = (() => {
  const out = {}
  for (const m of CSS.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)) {
    if (!(m[1] in out)) out[m[1]] = m[2].toLowerCase()
  }
  return out
})()

test('the mapper reads the REAL palette — every reference value is spec/_design.css\'s own', () => {
  assert.ok(Object.keys(DYES).length >= 16, 'the whole dye set is carried')
  for (const [token, hex] of Object.entries(DYES)) {
    assert.equal(String(hex).toLowerCase(), PALETTE[token],
      `--${token} in the mapper (${hex}) must be spec/_design.css's own (${PALETTE[token]})`)
  }
})

test('a token maps to ITSELF — every solid dye round-trips through its own role', () => {
  for (const t of ['paper', 'canvas', 'wash', 'sumi', 'ai', 'koke', 'bengara', 'yamabuki']) {
    assert.equal(dyeOf(PALETTE[t], 'bg'), t === 'sumi' ? 'sumi' : t, 'bg: ' + t)
  }
  for (const t of ['ink', 'ink-2', 'ink-3', 'ink-4', 'paper']) {
    assert.equal(dyeOf(PALETTE[t], 'fg'), t, 'fg: ' + t)
  }
  for (const t of ['hair', 'line2', 'line3', 'koke-line', 'bengara-line', 'yamabuki-line']) {
    assert.equal(dyeOf(PALETTE[t], 'bd'), t, 'bd: ' + t)
  }
  // ai-line (#b9c4ce) and the ai/koke/bengara tints are, measured, LESS chromatic than the warm
  // neutral ladder itself — they carry ~3% chroma where --line2 carries ~8%. So they land on the
  // neutral rung nearest their lightness, which is the honest answer for a colour that grey: hue
  // cannot name a state it does not visibly have. Real app tints are far more saturated and DO
  // reach the tint tokens — pinned in the table below.
  assert.equal(dyeOf(PALETTE['ai-line'], 'bd'), 'line2', 'a near-grey blue reads as the neutral hairline')
})

test('the mapping table: hue names the family, lightness names tint vs solid', () => {
  const T = [
    // [colour, role, token, why]
    ['#ffffff', 'bg', 'paper', 'pure white is the unbleached page'],
    ['#f8f9fa', 'bg', 'paper', 'the near-white every app ships'],
    ['rgb(28,27,24)', 'fg', 'ink', 'near-black text is 墨 sumi ink'],
    ['#6c5ce7', 'bg', 'ai', 'a purple primary button → 藍 indigo, the one dye allowed to fill solid'],
    ['#2f6fed', 'bg', 'ai', 'and so does a plain blue one'],
    ['#e74c3c', 'bg', 'bengara', 'red → 弁柄 iron oxide'],
    ['#f1c40f', 'bg', 'yamabuki', 'gold → 山吹'],
    ['#2ecc71', 'bg', 'koke', 'green → 苔 moss'],
    ['#dbeafe', 'bg', 'ai-tint', 'a pale blue chip is the TINT, not the solid'],
    ['#fef3c7', 'bg', 'yamabuki-tint', 'the amber "today" chip'],
    ['#fee2e2', 'bg', 'bengara-tint', 'the red "overdue" chip'],
    ['#d1fae5', 'bg', 'koke-tint', 'the green "done" chip'],
    ['#6c757d', 'fg', 'ink-4', 'a muted grey caption stays on the neutral ladder, at its own value'],
    ['174,180,194', 'fg', 'ink-4', 'a PALE grey caption is still readable ink — paper on paper is nothing (mirror-9)'],
    ['#c9ced8', 'fg', 'ink-4', 'and so is the palest one a real app ships'],
    ['#111827', 'fg', 'ink', 'a near-black heading'],
    ['#ffffff', 'fg', 'paper', 'white text on a solid button'],
    ['#e74c3c', 'fg', 'bengara', 'a red error line keeps its family'],
    ['#d1d5db', 'bd', 'hair', 'a plain light-grey border is the lightest hairline'],
    ['#9ca3af', 'bd', 'line3', 'a darker grey border is the heaviest one'],
    ['#2f6fed', 'bd', 'ai-line', 'a blue focus border is the indigo hairline'],
    ['#ef4444', 'bd', 'bengara-line', 'a red border'],
    ['253,252,249', 'bg', 'paper', 'the capture\'s own "r,g,b" form is accepted']
  ]
  for (const [c, role, token, why] of T) {
    assert.equal(dyeOf(c, role), token, `${c} as ${role} → ${token} (${why})`)
  }
})

test('unreadable data maps to nothing — the renderer then keeps its own default', () => {
  for (const bad of [null, undefined, '', 'transparent', 'x,y,z', '#12', {}, [], 'rgba(0,0,0,0)']) {
    assert.equal(dyeOf(bad, 'bg'), null, JSON.stringify(bad))
  }
  assert.equal(dyeOf('#ffffff', 'nonsense'), null, 'an unknown role names no token')
})
