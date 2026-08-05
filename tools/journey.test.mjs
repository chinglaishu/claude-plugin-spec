import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveJourney } from './journey.mjs'

const S = (guess, states) => ({ guess, reqs: states.map(state => ({ state })) })

test('fresh scaffold: nothing saved → point-at-your-app is current', () => {
  const { steps, folded } = deriveJourney({ configSaved: false, crawledAt: null, screens: [] })
  assert.equal(steps.length, 6)
  assert.equal(steps[0].done, true)                 // you are looking at the board
  assert.equal(steps[1].current, true)
  assert.equal(folded, false)
})

test('crawled but nothing deep → deepen is current and names kg-deep', () => {
  const { steps } = deriveJourney({ configSaved: true, crawledAt: '2026-08-05', screens: [] })
  assert.equal(steps[2].done, true)
  assert.equal(steps[3].current, true)
  assert.match(steps[3].cmd, /kg-deep/)
})

test('a confirmed prd with nothing proven → watch-the-proof is current', () => {
  const { steps, folded } = deriveJourney({ configSaved: true, crawledAt: null, screens: [S(false, ['unproven'])] })
  assert.equal(steps[4].done, true)
  assert.equal(steps[5].current, true)
  assert.equal(folded, false)
})

test('a guess still flagged → confirm-the-draft is current', () => {
  const { steps } = deriveJourney({ configSaved: true, crawledAt: '2026-08-05', screens: [S(true, ['unproven'])] })
  assert.equal(steps[3].done, true)
  assert.equal(steps[4].current, true)
})

test('the rail is a map, not a turnstile: a later fact holds regardless', () => {
  const { steps } = deriveJourney({ configSaved: false, crawledAt: null, screens: [S(false, ['proven'])] })
  assert.equal(steps[1].current, true)              // config still first incomplete
  assert.equal(steps[5].done, true)
})

test('anything proven folds the rail', () => {
  const { folded } = deriveJourney({ configSaved: true, crawledAt: null, screens: [S(false, ['proven'])] })
  assert.equal(folded, true)
})
