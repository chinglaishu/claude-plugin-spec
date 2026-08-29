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
