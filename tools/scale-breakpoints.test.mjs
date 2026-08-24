// Task 14 release pass — the two-column breakpoints ride the design system's --scale.
//
// A @media query cannot read a CSS var, so the first cut hand-scaled the four breakpoints
// (1080/1080/1000/1100 × 0.8 → 864/864/800/880) — which broke the knob's one-line promise:
// changing --scale would have needed the literals recomputed by hand. build() now parses --scale
// out of spec/_design.css at emit time and computes each breakpoint from its BASE number, so the
// base stays legible in the source (`bp(1080)`) and --scale alone moves the emitted value.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseScale, scaledBp } from './build-board.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

test('parseScale reads --scale out of a css text', () => {
  assert.equal(parseScale(':root { --scale: 0.8; --s1: 4px; }'), 0.8)
  assert.equal(parseScale(':root{--scale:0.82;}'), 0.82)
  assert.equal(parseScale(':root { --scale: 1; }'), 1)
})

test('parseScale defaults to 1 when no knob exists — an unscaled design system emits base breakpoints', () => {
  assert.equal(parseScale(':root { --s1: 4px; }'), 1)
  assert.equal(parseScale(''), 1)
})

test('scaledBp computes a whole-pixel breakpoint from base × scale', () => {
  assert.equal(scaledBp(1080, 0.8), 864)
  assert.equal(scaledBp(1000, 0.8), 800)
  assert.equal(scaledBp(1100, 0.8), 880)
  // the knob's promise: 0.8 → 0.82 moves the emitted values with no other edit
  assert.equal(scaledBp(1080, 0.82), 886)
  assert.equal(scaledBp(1000, 0.82), 820)
  assert.equal(scaledBp(1100, 0.82), 902)
  assert.equal(scaledBp(1080, 1), 1080)
})

test('the real design system yields the shipped breakpoints', () => {
  const scale = parseScale(readFileSync(join(ROOT, 'spec', '_design.css'), 'utf8'))
  assert.equal(scale, 0.8)
  assert.equal(scaledBp(1080, scale), 864)
  assert.equal(scaledBp(1000, scale), 800)
  assert.equal(scaledBp(1100, scale), 880)
})
