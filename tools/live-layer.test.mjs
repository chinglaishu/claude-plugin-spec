// tools/live-layer.test.mjs — ONE MOMENT IS THREE BEATS, and the phase is said on the stage itself.
//
// The human, on 0.48.5's live board (2026-09-07), four reports on one mechanism: "Now the expected
// column never moved"; "semi-auto is not smooth … a small step should only contain the action of
// click the Add button (instead of continue from last small step entirely)"; "the explaining text box
// in semi-auto should same as the one in step"; "be aware of the pause between each action to make
// user able to observe".
//
// Two of those were ONE bug that no string test could see. 0.48.5 marked "the film is running" with a
// `filming` class on `stage.closest('.pcbox')` — and the reader is built DETACHED and appended a
// moment later, so on the first play there was no .pcbox to find and the flag was never set.
// Measured at 100 ms on demo/todo R1: the whole first loop ran with the chip at opacity 1 over the
// burned card. So this test runs the SHIPPED liveLayer (lifted out of client.js, like
// tools/claim-mark.test.mjs lifts repSrcdoc) in a real browser, on a stage that is appended to the
// document only AFTER show() has run, against a real 3-second recording (tools/fixtures/clip-3s.webm,
// a testsrc VP8 clip), and reads the phases back exactly as the row's wiring would.
//
// The contract it pins:
//   • show(i) opens the moment on its LEAD: the row is told `approach` at once (it is what moves the
//     Expected to the start state and drops the chips' value line), the stage wears `.approach`, and
//     the film is on show but NOT yet playing — the pause the human asked for;
//   • the approach then plays to the end of its slice and STANDS DOWN: the row is told `rest`, the
//     stage drops `.approach`, the video is off and paused — the moment's own still stands;
//   • in SEMI-AUTO the moment replays after the rest (approach again); in STEP a switch stops
//     everything where it is and the row is told `rest`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { lift } from './lift-client.mjs'
import './board/stepper.js'          // registers globalThis.SBStepper — the same bytes the page runs

const CLIENT = readFileSync(new URL('./board/client.js', import.meta.url), 'utf8')
const STEPPER = readFileSync(new URL('./board/stepper.js', import.meta.url), 'utf8')
const CLIP = 'data:video/webm;base64,' + readFileSync(new URL('./fixtures/clip-3s.webm', import.meta.url)).toString('base64')

// the reader's own bytes for the layer and the two rules it reads, plus the minimum of the reader's
// state it closes over — the mode, the speed and the two broadcast registries
const HARNESS = `
  let PLAY_MODE = 'semi'; let PLAY_SPD = 1
  const MODE_W = []; const SPD_W = []
  function onSpd (node, fn) { SPD_W.push({ node, fn }) }
  function onMode (node, fn) { MODE_W.push({ node, fn }) }
  window.__setMode = function (m) { PLAY_MODE = m; for (const w of MODE_W) w.fn(m) }
  ${lift(CLIENT, 'sliceOf')}
  ${lift(CLIENT, 'livePlan')}
  ${lift(CLIENT, 'liveLayer')}
  window.__liveLayer = liveLayer
`

async function withPage (fn) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><html><body><div class="pcbox" id="box"></div></body></html>')
    await page.addScriptTag({ content: STEPPER })
    await page.addScriptTag({ content: HARNESS })
    return await fn(page)
  } finally { await browser.close() }
}

// build the layer DETACHED and show a moment BEFORE the stage is in the document — the exact order
// the reader builds a row in — then append it on the next frame
const build = (clip) => `(() => {
  window.__log = []
  const stage = document.createElement('div'); stage.className = 'fsteps'
  window.__stage = stage
  const shots = [{ slice: { from: 200, to: 1200 } }, { slice: { from: 1400, to: 2400 } }, { slice: null }]
  window.__layer = window.__liveLayer(stage, ${JSON.stringify(clip)}, shots, function (i, p) { window.__log.push(i + ':' + p) })
  window.__layer.show(0)
  window.__t0 = performance.now()
  const snap = () => ({ log: window.__log.slice(), approach: stage.classList.contains('approach'), first: window.__log[0] || null })
  const before = snap()
  requestAnimationFrame(() => document.getElementById('box').appendChild(stage))
  return before
})()`

test('show() opens on the LEAD at once — even on a stage that is not in the document yet', async () => {
  await withPage(async (page) => {
    const before = await page.evaluate(build(CLIP))
    assert.equal(before.first, '0:approach', 'the row is told the approach the instant the moment shows')
    assert.equal(before.approach, true, 'the phase is on the stage itself, not on a box it cannot find')
    // …and the film is on show but held: the lead is a pause, not a play
    const held = await page.evaluate(() => {
      const v = window.__stage.querySelector('video')
      return { on: v.classList.contains('on'), paused: v.paused }
    })
    assert.deepEqual(held, { on: true, paused: true })
  })
})

test('the approach plays to the end of its slice and STANDS DOWN: rest, no film, the still', async () => {
  await withPage(async (page) => {
    await page.evaluate(build(CLIP))
    // LEAD (700) + a 1000 ms slice: the rest must arrive inside a few seconds
    await page.waitForFunction(() => window.__log.includes('0:rest'), null, { timeout: 8000 })
    const rested = await page.evaluate(() => {
      const v = window.__stage.querySelector('video')
      return { approach: window.__stage.classList.contains('approach'), on: v.classList.contains('on'), paused: v.paused,
        t: v.currentTime, sinceShow: performance.now() - window.__t0, phase: window.__layer.phase() }
    })
    assert.equal(rested.approach, false)
    assert.equal(rested.on, false, 'the film stood down')
    assert.equal(rested.paused, true)
    assert.equal(rested.phase, 'rest')
    assert.ok(rested.t >= 1.1 && rested.t <= 1.6, 'it stopped at the end of ITS slice, not the clip: ' + rested.t)
    assert.ok(rested.sinceShow >= globalThis.SBStepper.LEAD, 'the lead was actually spent before the film ran: ' + rested.sinceShow)
  })
})

test('SEMI-AUTO replays the approach after the rest; a switch to STEP stops it dead and says rest', async () => {
  await withPage(async (page) => {
    await page.evaluate(build(CLIP))
    await page.waitForFunction(() => window.__log.filter(x => x === '0:approach').length >= 2, null, { timeout: 12000 })
    const log = await page.evaluate(() => window.__log.slice())
    assert.deepEqual(log.slice(0, 3), ['0:approach', '0:rest', '0:approach'], 'approach → rest → approach again')
    await page.evaluate(() => window.__setMode('step'))
    const still = await page.evaluate(() => {
      const v = window.__stage.querySelector('video')
      return { last: window.__log[window.__log.length - 1], approach: window.__stage.classList.contains('approach'), on: v.classList.contains('on'), paused: v.paused }
    })
    assert.deepEqual(still, { last: '0:rest', approach: false, on: false, paused: true })
    // …and nothing wakes it back up on its own
    await page.waitForTimeout(1500)
    assert.equal(await page.evaluate(() => window.__log[window.__log.length - 1]), '0:rest')
  })
})

test('a moment with no slice never approaches: it rests at once, in a playing mode too', async () => {
  await withPage(async (page) => {
    await page.evaluate(build(CLIP))
    const got = await page.evaluate(() => {
      window.__log.length = 0
      window.__layer.show(2)
      const v = window.__stage.querySelector('video')
      return { log: window.__log.slice(), approach: window.__stage.classList.contains('approach'), on: v.classList.contains('on') }
    })
    assert.deepEqual(got, { log: ['2:rest'], approach: false, on: false })
  })
})
