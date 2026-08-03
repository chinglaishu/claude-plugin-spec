import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flattenSteps } from '../spec/_results-reporter.mjs'

// The step record feeds two board affordances (board R10): the beat-grouped step list, and the
// recording's context bar — which needs each step's OFFSET from the moment the video starts.
// Playwright records video per PAGE, so the `Create page` step's start is the recording's t=0.

const T0 = 1700000000000
const step = (title, category, o = {}) => ({
  title,
  category,
  startTime: new Date(T0 + (o.at ?? 0)),
  duration: o.d ?? 0,
  error: o.err,
  steps: o.steps
})

test('steps carry offsets from the video epoch — the Create page step', () => {
  const out = flattenSteps([
    step('Create page', 'pw:api', { at: 500 }),                    // noise, but it IS the epoch
    step('proves R1', 'test.step', {
      at: 1500, d: 1000, steps: [step('Click x', 'pw:api', { at: 1600, d: 100 })]
    }),
    step('Expect "toHaveCount" locator(\'.row\')', 'expect', { at: 2600, d: 50, err: { message: 'x' } })
  ])
  assert.equal(out.length, 3)                                      // the Create page step is dropped
  assert.deepEqual(out.map(s => s.t), [1000, 1100, 2100])          // offsets are from Create page
  assert.deepEqual(out.map(s => s.d), [1000, 100, 50])
  assert.equal(out[0].ok, true)
  assert.equal(out[1].depth, 1)                                    // nested under its named beat
  assert.equal(out[2].ok, false)                                   // the error marks the step failed
})

test('without a Create page step, the first kept step reads as t=0', () => {
  const out = flattenSteps([
    step('proves R1', 'test.step', { at: 4000, d: 10 }),
    step('Click y', 'pw:api', { at: 4500, d: 10 })
  ])
  assert.deepEqual(out.map(s => s.t), [0, 500])
})

test('a "note: " step records as an info line — the announced got/expected values', () => {
  const out = flattenSteps([
    step('proves R1', 'test.step', {
      at: 0,
      d: 100,
      steps: [step('note: IY1 — got 2400000 · expected 2400000', 'test.step', { at: 50, d: 5 })]
    })
  ])
  assert.equal(out.length, 2)
  assert.equal(out[1].cat, 'info')
  assert.equal(out[1].label, 'IY1 — got 2400000 · expected 2400000')
  assert.equal(out[1].depth, 1)
})

test('a record trimmed at the step cap says so instead of ending silently', () => {
  const many = Array.from({ length: 90 }, (_, i) => step('Click n' + i, 'pw:api', { at: i * 10, d: 5 }))
  const out = flattenSteps(many)
  assert.equal(out.length, 81)                                     // 80 kept + the honest marker
  assert.equal(out[80].cat, 'note')
  assert.match(out[80].label, /80/)                                // names the cap…
  assert.match(out[80].label, /10 more/)                           // …and how much it dropped
})
