// tools/expected-performs.test.mjs — THE EXPECTED PERFORMS THE WHEN (2026-09-07 evening).
//
// The human, on R1's first moment: "why i still only see the actual moving/actioning on the input
// box for actual, but it's still in the expected?" A page-wide fade is not what a person watching
// the Actual TYPE expects to see beside it. The moment's replica carries the ringed element with the
// expected value in it and the start page carries the same element empty, so while the film runs
// the Expected's ringed element is typed into at the harness's own pace (client.js repPerform).
//
// Lifted out of client.js and run in a real browser on two miniature documents shaped exactly like
// the demo's: a start page whose input is an empty control showing its placeholder (`data-ph`), and
// a moment whose ringed control carries "Water the plants".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { lift } from './lift-client.mjs'

const CLIENT = readFileSync(new URL('./board/client.js', import.meta.url), 'utf8')
const HARNESS = 'var TYPE_MS = 55\n' + lift(CLIENT, 'repPerform') + '\nwindow.__perform = repPerform'

// the START page, as repSrcdoc stands it: the base's body-rooted `.rep` inside #sbstand; the scene
// root at path 0/1 (a header, then the add row) with the control at inner path 0/0
const START = '<div id="sbstand"><div class="rep b0"><div class="b1"><div class="bx">header</div>' +
  '<div class="b2"><label class="b3"><span class="b4" data-control="input" data-ph="1">Add a task and press Enter…</span></label>' +
  '<button class="b5">Add</button></div></div></div></div>'
const moment = (text, extra = '') =>
  '<div class="rep m0" data-replica-ns="m" data-replica-path="0/1"><label class="m3">' +
  '<span class="m4" data-control="input" data-ring="1"' + extra + '>' + text + '</span></label><button class="m5">Add</button></div>'

async function withPage (fn) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><html><body>' + START + '</body></html>')
    await page.addScriptTag({ content: HARNESS })
    return await fn(page)
  } finally { await browser.close() }
}
const box = (page) => page.evaluate(() => {
  const el = document.querySelector('#sbstand [data-control="input"]')
  return { ph: el.hasAttribute('data-ph'), text: el.textContent }
})

test('typing: the start page’s empty control fills with the moment’s text, one character at a time', async () => {
  await withPage(async (page) => {
    const r = await page.evaluate((m) => { const h = window.__perform(document, m, 1000, 1); return { ok: h.ok, kind: h.kind, step: h.step, count: h.count, why: h.why } }, moment('Water the plants'))
    assert.equal(r.ok, true, r.why)
    assert.equal(r.kind, 'type')
    assert.equal(r.count, 16)
    assert.ok(r.step >= 50 && r.step <= 55, 'the harness’s pace, 55 ms a key, fitted to the film: ' + r.step)
    // the placeholder is gone the instant the typing starts, and nothing invented stands in the box
    assert.deepEqual(await box(page), { ph: false, text: '' })
    await page.waitForTimeout(r.step * 5 + 30)
    const mid = await box(page)
    assert.ok(mid.text.length >= 4 && mid.text.length <= 7 && 'Water the plants'.startsWith(mid.text), 'part way: ' + JSON.stringify(mid))
    await page.waitForTimeout(r.step * 12)
    assert.deepEqual(await box(page), { ph: false, text: 'Water the plants' })
  })
})

test('the pace is rated by the reader’s speed, and never runs past the film', async () => {
  await withPage(async (page) => {
    const fast = await page.evaluate((m) => window.__perform(document, m, 5000, 4).step, moment('Water the plants'))
    assert.ok(Math.abs(fast - 55 / 4) < 0.01, 'at 4× a key lands every 13.75 ms: ' + fast)
    const short = await page.evaluate((m) => window.__perform(document, m, 200, 1).step, moment('Water the plants'))
    assert.ok(short < 55 && short * 16 <= 200, 'a 200 ms film fits its 16 keys inside itself: ' + short)
  })
})

test('a clearing is one cut at the film’s midpoint, the placeholder back with it', async () => {
  await withPage(async (page) => {
    await page.evaluate(() => { const el = document.querySelector('#sbstand [data-control="input"]'); el.removeAttribute('data-ph'); el.textContent = 'Water the plants' })
    const r = await page.evaluate((m) => { const h = window.__perform(document, m, 600, 1); return { ok: h.ok, kind: h.kind } }, moment('Add a task and press Enter…', ' data-ph="1"'))
    assert.deepEqual(r, { ok: true, kind: 'clear' })
    await page.waitForTimeout(150)
    assert.equal((await box(page)).text, 'Water the plants', 'still full before the midpoint')
    await page.waitForTimeout(250)
    assert.deepEqual(await box(page), { ph: true, text: 'Add a task and press Enter…' })
  })
})

test('text that does not change is not performed — the fade stands in', async () => {
  await withPage(async (page) => {
    await page.evaluate(() => { const el = document.querySelector('#sbstand [data-control="input"]'); el.removeAttribute('data-ph'); el.textContent = 'Add' })
    const r = await page.evaluate((m) => window.__perform(document, m, 600, 1), moment('Add'))
    assert.equal(r.ok, false)
    assert.match(r.why, /does not change/)
  })
})

test('unrelated texts are refused — nothing is typed that the requirement did not say', async () => {
  await withPage(async (page) => {
    await page.evaluate(() => { const el = document.querySelector('#sbstand [data-control="input"]'); el.removeAttribute('data-ph'); el.textContent = 'Buy milk' })
    const r = await page.evaluate((m) => window.__perform(document, m, 600, 1), moment('Water the plants'))
    assert.equal(r.ok, false)
    assert.match(r.why, /unrelated/)
  })
})

test('cancel stops the typing where it is', async () => {
  await withPage(async (page) => {
    await page.evaluate((m) => { window.__h = window.__perform(document, m, 2000, 1) }, moment('Water the plants'))
    await page.waitForTimeout(200)
    await page.evaluate(() => window.__h.cancel())
    const a = await box(page); await page.waitForTimeout(400); const b = await box(page)
    assert.equal(a.text, b.text, 'nothing moved after cancel')
    assert.ok(a.text.length > 0 && a.text.length < 16, 'it was mid-way: ' + JSON.stringify(a))
  })
})
