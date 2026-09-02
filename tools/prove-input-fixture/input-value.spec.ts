// The fixture behind tools/prove-input.test.mjs. A form control's VALUE is not its textContent —
// an <input> carrying "Water the plants" has no text at all — so proveVisible could not be pointed
// at the one thing a "you type X" When names, and the action of a requirement went unproven and
// unphotographed (the human, 2026-08-29, on the Tsumiki demo's R1).
import { test, expect, proveVisible } from '../../spec/_base'

const PAGE = '<body style="font:16px system-ui;padding:24px">' +
  '<input id="nt" value="Water the plants" style="width:320px;padding:8px">' +
  '<textarea id="note" style="width:320px">two lines</textarea>' +
  '<p id="ttl">Water the plants</p></body>'

test('an input is proven by the value it CARRIES, and so is a textarea', async ({ page }) => {
  await page.setContent(PAGE)
  await proveVisible(page.locator('#nt'), 'Water the plants', 'The task typed into the box')
  await proveVisible(page.locator('#note'), 'two lines', 'The note typed into the textarea')
  await proveVisible(page.locator('#ttl'), 'Water the plants', 'And ordinary text still reads as text')
})

test('it is still a CHECK — a wrong expected value throws, whatever the element is', async ({ page }) => {
  await page.setContent(PAGE)
  let threw = ''
  try {
    await proveVisible(page.locator('#nt'), 'Water the plant', 'deliberately wrong')
  } catch (err) {
    threw = String((err as Error).message || err)
  }
  expect(threw, 'a wrong value must fail the check').toContain('Water the plant')
})

// A SOFT CLAIM (2026-09-02): a Then with several facts must photograph EVERY one of them even when
// the first is wrong — the beat runs to its end and the `proves` step fails once, with the whole
// list. The human, on the demo's R9: "the schematic should be correct, only the proof should be
// wrong" — which needs the proof to show every fact the requirement states, not stop at the first.
// The test is EXPECTED to fail (the aggregate surfaces the two red claims); the marker file proves
// the third claim was still reached, and the node test reads it.
import { writeFileSync } from 'node:fs'
import { checkReq, MISSING } from '../../spec/_base'
// where the node test asked for the marker (an env var — the transpiled spec's own URL is not its
// source dir); a bare run of this config writes nothing
const SOFT_MARK = process.env.SOFT_MARK || ''

test('soft claims run every value of a beat and fail it at the end — never at the first wrong one', async ({ page }) => {
  test.fail()
  await page.setContent(PAGE)
  await checkReq('R1', async () => {
    await proveVisible(page.locator('#nt'), 'Water the plant', 'first — deliberately wrong', { soft: true })
    await proveVisible(page.locator('#nope'), 'Undo', 'second — nothing there at all', { soft: true })
    await proveVisible(page.locator('#ttl'), 'Water the plants', 'third — right, and still reached', { soft: true })
    if (SOFT_MARK) writeFileSync(SOFT_MARK, 'reached the third claim; a missing element reads ' + MISSING)
  })
})
