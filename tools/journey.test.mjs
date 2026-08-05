import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveJourney } from './journey.mjs'
import { journeyRail } from './build-board.mjs'

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

// the RENDERER — the half a live board can never show us here. specboard's own journey is complete,
// so `cur`, the action line and the J_ACT lookup have no state on this tree to render from; the E2E
// can only ever see the folded, all-done rail. These drive a MID-journey shape straight through
// journeyRail, which is the same function the build calls (tools/prd-render.test.mjs does the same
// for renderBody). Without them the whole point of the rail — telling you the one next thing — ships
// unproven.
const midJourney = () => deriveJourney({
  configSaved: true, crawledAt: '2026-08-05', screens: [S(true, ['unproven'])]
})

test('render: the current step carries cur and the not-yet steps carry neither', () => {
  const html = journeyRail(midJourney())
  assert.match(html, /class="jstep done" data-id="deepen"/)
  assert.match(html, /class="jstep cur" data-id="confirm"/)
  assert.match(html, /class="jstep" data-id="prove"/)
})

test('render: the current step shows its action, and only it does', () => {
  // the deepen step names its command; the confirm step has none, so it falls back to the board's
  // own wording for that action — either way the CURRENT step is the only one carrying a .jact
  const deepenCurrent = deriveJourney({ configSaved: true, crawledAt: '2026-08-05', screens: [] })
  assert.match(journeyRail(deepenCurrent), /<span class="jact">\/kg-deep &lt;screen&gt;<\/span>/)
  assert.equal((journeyRail(deepenCurrent).match(/class="jact"/g) || []).length, 1)
  // and the step with no cmd of its own still names an action — it falls back to the board control
  // that performs it, so the one next thing is never blank. It rides the CUR step, not a done one.
  const steps = journeyRail(midJourney()).split('<li ').slice(1)
  const cur = steps.find(s => s.startsWith('class="jstep cur"'))
  assert.match(cur, /<span class="jact">.+<\/span>/)
  assert.equal(steps.filter(s => s.includes('class="jact"')).length, 1)
})

test('render: every step draws its mono fact caption, and a mark that is not hue alone', () => {
  const html = journeyRail(midJourney())
  assert.equal((html.match(/class="jfact"/g) || []).length, 6)
  assert.match(html, /<span class="mark"><\/span><span class="jn">1</)      // done · filled
  assert.match(html, /<span class="mark h"><\/span><span class="jn">5</)    // current · half
  assert.match(html, /<span class="mark o"><\/span><span class="jn">6</)    // not yet · hollow
})

test('render: a finished journey renders the rail hidden, an unfinished one open', () => {
  const done = deriveJourney({ configSaved: true, crawledAt: null, screens: [S(false, ['proven'])] })
  assert.match(journeyRail(done), /<div id="jrail" hidden>/)
  assert.match(journeyRail(midJourney()), /<div id="jrail">/)
})
