// Proving flow for Tsumiki (spec/todo/prd.md) — specboard's own teaching demo. ONE comprehensive
// flow drives the real app and proves all eight requirements, reading every asserted value off a
// cell it first brings on screen (never off storage). Five of the eight are DERIVED values (a ring,
// a roll-up, a counter, a filter badge, a date chip) — the ones that drift silently, and the reason
// this demo is worth watching.
//
// DETERMINISM. Tsumiki takes a frozen clock via ?now= (so the overdue/today chips are the same every
// run) and seeds a fixed set of tasks when its storage is empty. The flow pins the clock and clears
// storage, so it always starts from the same board.

import { test, expect, checkReq, coverReqs, flowStep, proveVisible, reveal, hudCheck, hudNote, recordHold, waitForContent } from '../_base'
import { APP_BASE, FROZEN_NOW } from '../_app'

const URL = `${APP_BASE}/todo.html?now=${encodeURIComponent(FROZEN_NOW)}`
const HOLD = recordHold()

test('Tsumiki — add, edit, sub-tasks that roll up, a counter that counts leaves, filters, dates, and a reload (R1–R8)', async ({ page }) => {
  coverReqs('R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8')
  test.slow()
  test.setTimeout(300000)

  // ── selectors (the app carries data-id/data-done hooks; everything else is read as a user sees it)
  const rowById = (id: string) => page.locator(`.task[data-id="${id}"]`)
  const rowByTitle = (t: string) => page.locator('.task', { has: page.locator('.ttl', { hasText: t }) })
  const subById = (id: string) => page.locator(`.srow[data-id="${id}"]`)
  const navBtn = (v: string) => page.locator(`.nav[data-view="${v}"]`)
  const left = page.locator('#left')

  // Start from the seed under the frozen clock: load once, wipe storage, load again so the app
  // re-seeds deterministically.
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await waitForContent(rowById('k1'))

  await flowStep('Add a task', async () => {
    await reveal(page.locator('.addrow'))
    await page.locator('#nt').fill('Water the plants')
    await page.locator('.go').click()
    // R1 — the typed text lands as a new row, and its stamp reads "added just now".
    await checkReq('R1', async () => {
      const row = rowByTitle('Water the plants')
      await proveVisible(row.locator('.ttl'), 'Water the plants', 'The new task, read off the list')
      await proveVisible(row.locator('.meta'), 'added just now',
        'Its activity stamp', { match: s => /added just now/.test(s) })
    })
  })

  await flowStep('Rename it in place', async () => {
    await rowByTitle('Water the plants').locator('.ttl').dblclick()
    const edit = page.locator('.edit')
    await edit.fill('Water the office plants')
    await edit.press('Enter')
    // R2 — the row shows the new text, and the stamp flips added → edited.
    await checkReq('R2', async () => {
      const row = rowByTitle('Water the office plants')
      await proveVisible(row.locator('.ttl'), 'Water the office plants', 'The renamed task, read back off its row')
      await proveVisible(row.locator('.meta'), 'edited just now',
        'The stamp flipped to edited', { match: s => /edited just now/.test(s) })
    })
  })

  await flowStep('Open a task that has sub-tasks', async () => {
    // R3 — a container shows a derived ring, no checkbox, and the ring grows when a sub-task is added.
    await checkReq('R3', async () => {
      await proveVisible(rowById('k1').locator('.pct'), '1/3', 'The container ring — one of three done')
      await expect(rowById('k1').locator('.trow > .cb'),
        'a container has no checkbox of its own — only a ring').toHaveCount(0)
      await page.locator('#sub-k1').fill('Order name badges')
      await page.locator('#sub-k1').press('Enter')
      await proveVisible(rowById('k1').locator('.pct'), '1/4',
        'Adding a sub-task grew the ring by itself — one of four')
    })
  })

  await flowStep('Finish the sub-tasks — the parent finishes itself', async () => {
    // Seven open leaves now: three open sub-tasks of the container, plus four childless open tasks.
    await checkReq('R5', async () => {
      await proveVisible(left, '7', 'To do — seven leaves of work left')
    })
    // One sub-task done → the counter drops by exactly one.
    await subById('k1b').locator('.scb').click()
    await checkReq('R5', async () => {
      await proveVisible(left, '6', 'One sub-task done — the count drops by exactly one')
    })
    // Finish the container's remaining two open sub-tasks; the last tick rolls the parent up.
    await subById('k1c').locator('.scb').click()
    await rowById('k1').locator('.srow', { has: page.getByText('Order name badges', { exact: true }) })
      .locator('.scb').click()
    // R4 — nobody ticked the parent; it completed itself.
    await checkReq('R4', async () => {
      await proveVisible(rowById('k1').locator('.pct'), '4/4', 'Every sub-task done — the ring is full')
      await hudCheck('The container completed itself', 'true', await rowById('k1').getAttribute('data-done'))
      expect(await rowById('k1').getAttribute('data-done'),
        'the container rolled up to done on its own').toBe('true')
    })
    // R5 — completing a container of two open leaves dropped the count by two, not three: the
    // container itself is never a unit of work. (This is the assertion the broken-counter demo
    // fails; it is the LAST thing in this step, so the reopen below is its own step and still runs.)
    await checkReq('R5', async () => {
      await proveVisible(left, '4', 'The container is not a task — the count dropped by two, to four')
    })
  })

  await flowStep('Reopen a sub-task — the parent reopens', async () => {
    // Its own step on purpose: even if the counter check above fails, the flow still reopens the
    // sub-task here, so the state the reload step reads is the same whether or not R5 held.
    await subById('k1b').locator('.scb').click()
    // R4, the other direction.
    await checkReq('R4', async () => {
      await proveVisible(rowById('k1').locator('.pct'), '3/4', 'Reopen one sub-task and the parent reopens')
      expect(await rowById('k1').getAttribute('data-done'),
        'reopening a sub-task reopened the container').toBe('false')
    })
    // The count climbs back — and this reads correctly even under the broken counter, because the
    // bug only miscounts a DONE container; a reopened one is counted by its open leaves again.
    await checkReq('R5', async () => {
      await proveVisible(left, '5', 'And the count climbs back to five')
    })
  })

  await flowStep('Walk the smart views — every badge matches its list', async () => {
    // R6 — for each view, the sidebar badge equals the number of task rows the view actually shows.
    await checkReq('R6', async () => {
      for (const v of ['all', 'active', 'today', 'completed']) {
        await navBtn(v).click()
        await reveal(navBtn(v))
        const badge = ((await navBtn(v).locator('.ct').textContent()) || '').trim()
        const rows = await page.locator('.list .task').count()
        await hudCheck(`${v} — sidebar badge vs rows on screen`, badge, String(rows))
        expect(String(rows), `${v}: the badge must equal the rows the view shows`).toBe(badge)
        if (HOLD) await page.waitForTimeout(HOLD)
      }
      await navBtn('all').click()
    })
  })

  await flowStep('Read the date chips', async () => {
    // R7 — against the frozen clock, a past-due task reads overdue and a due-today task reads today.
    await checkReq('R7', async () => {
      await navBtn('all').click()
      await proveVisible(rowById('k3').locator('.chip'), 'overdue', 'Renew passport is past due — overdue')
      await proveVisible(rowById('k2').locator('.chip'), 'today', 'Pay the electricity bill is due today')
    })
  })

  await flowStep('Reload — everything comes back', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForContent(rowById('k1'))
    // R8 — the edit, the rolled-up state, and a completed stamp all survive a real reload.
    await checkReq('R8', async () => {
      await proveVisible(rowByTitle('Water the office plants').locator('.ttl'),
        'Water the office plants', 'The rename survived the reload')
      await proveVisible(rowById('k1').locator('.pct'), '3/4', 'The container came back at three of four')
      await navBtn('completed').click()
      await proveVisible(rowById('k5').locator('.meta'), 'done',
        'A completed stamp survived the reload', { match: s => /done/.test(s) })
    })
    if (HOLD) await hudNote('Every value above was read off the screen you just watched, never off storage')
  })
})
