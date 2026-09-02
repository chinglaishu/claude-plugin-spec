// A SLATE IS A GREY (2026-09-02, the lead's review of the mirror-11 demo). Blue-grey UI inks — the
// slates every design system ships (Tsumiki's sidebar icons rgb(90,99,118), its chevrons
// rgb(139,147,165)) — carry a little blue chroma, and at the old 0.10 chroma floor dyeOf called
// them CHROMATIC and painted them indigo: every quiet grey icon on the mirror lit up in --ai, the
// one hue this board reserves for the ring and the Changed state. A colour whose chroma is low
// against its lightness is a neutral; the vivid dyes (an indigo button, a red chip) sit far above
// the new floor and still land on their family.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dyeOf } from './viz.mjs'

const NEUTRAL_FG = new Set(['ink', 'ink-2', 'ink-3', 'ink-4', 'paper'])
const NEUTRAL_BG = new Set(['paper', 'canvas', 'wash', 'sumi'])

test('a blue-grey slate ink maps to the neutral ladder, never to indigo', () => {
  assert.ok(NEUTRAL_FG.has(dyeOf('90,99,118', 'fg')), 'sidebar icon slate → ' + dyeOf('90,99,118', 'fg'))
  assert.ok(NEUTRAL_FG.has(dyeOf('139,147,165', 'fg')), 'chevron slate → ' + dyeOf('139,147,165', 'fg'))
  assert.ok(NEUTRAL_FG.has(dyeOf('100,116,139', 'fg')), 'tailwind slate-500 → ' + dyeOf('100,116,139', 'fg'))
  assert.ok(NEUTRAL_BG.has(dyeOf('241,245,249', 'bg')), 'slate-100 ground → ' + dyeOf('241,245,249', 'bg'))
})

test('the vivid dyes still find their family above the raised floor', () => {
  assert.equal(dyeOf('79,70,229', 'fg'), 'ai')            // Tsumiki's indigo button / active nav
  assert.equal(dyeOf('79,70,229', 'bg'), 'ai')
  assert.equal(dyeOf('18,160,106', 'bg'), 'koke')         // the done tick's green
  assert.equal(dyeOf('220,38,38', 'fg'), 'bengara')       // an "overdue" red
  assert.equal(dyeOf('245,158,11', 'fg'), 'yamabuki')     // an amber "today"
  assert.equal(dyeOf('47,74,99', 'fg'), 'ai')             // the board's own --ai is not a slate
  // the margin the slate rule lives in: the palette's least saturated chromatic dyes stay chromatic
  assert.equal(dyeOf('188,196,168', 'bd'), 'koke-line')   // --koke-line, HSL saturation ≈ 0.19
  assert.equal(dyeOf('77,92,55', 'bg'), 'koke')           // --koke, chroma 0.145, saturation ≈ 0.25
  assert.equal(dyeOf('216,192,182', 'bd'), 'bengara-line')
})
