// Proving flow for Tsumiki (spec/todo/prd.md) — specboard's own teaching demo. ONE comprehensive
// flow drives the real app and proves all eight requirements, reading every asserted value off a
// cell it first brings on screen (never off storage). Five of the eight are DERIVED values (a ring,
// a roll-up, a counter, a filter badge, a date chip) — the ones that drift silently, and the reason
// this demo is worth watching.
//
// DETERMINISM. Tsumiki takes a frozen clock via ?now= (so the overdue/today chips are the same every
// run) and seeds a fixed set of tasks when its storage is empty. The flow pins the clock and clears
// storage, so it always starts from the same board.

import { test, checkReq, coverReqs, flowStep, hudNote, recordHold, proveVisible } from '../_base'
import { openSeededBoard, addTask, renameInPlace, addSubTaskGrowsRing, tickOneSubTask, finishContainerRollsUp,
  containerIsNotAUnit, reopenSubTaskReopensParent, walkSmartViews, readDateChips, reloadKeepsEverything } from './steps'

// Task 7 (2026-08-22): every beat below is an exported step function in ./steps.ts — the beat-function
// convention — lifted VERBATIM out of this flow (the same When, the same proveVisible/hudCheck
// assertions, the numbers now computed from the threaded state). The checkReq stays AROUND each
// call, so the proof's power is unchanged; the board's composer can now chain these beats into a
// new flow with no model involved (see the composed flow at the foot of this file).

const HOLD = recordHold()

test('Tsumiki — add, edit, sub-tasks that roll up, a counter that counts leaves, filters, dates, and a reload (R1–R8)', async ({ page }) => {
  coverReqs('R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8')
  test.slow()
  test.setTimeout(300000)

  // Start from the seed under the frozen clock: load once, wipe storage, load again so the app
  // re-seeds deterministically.
  const state = await openSeededBoard(page)

  await flowStep('Add a task', async () => {
    // R1 — the typed text lands as a new row, and its stamp reads "added just now".
    await checkReq('R1', async () => { await addTask(page, state) })
  })

  await flowStep('Rename it in place', async () => {
    // R2 — the row shows the new text, and the stamp flips added → edited.
    await checkReq('R2', async () => { await renameInPlace(page, state) })
  })

  await flowStep('Open a task that has sub-tasks', async () => {
    // R3 — a container shows a derived ring, no checkbox, and the ring grows when a sub-task is added.
    await checkReq('R3', async () => { await addSubTaskGrowsRing(page, state) })
  })

  await flowStep('Finish the sub-tasks — the parent finishes itself', async () => {
    // Seven open leaves now: three open sub-tasks of the container, plus four childless open tasks.
    // One sub-task done → the counter drops by exactly one.
    await checkReq('R5', async () => { await tickOneSubTask(page, state) })
    // Finish the container's remaining two open sub-tasks; the last tick rolls the parent up.
    // R4 — nobody ticked the parent; it completed itself.
    await checkReq('R4', async () => { await finishContainerRollsUp(page, state) })
    // R5 — completing a container of two open leaves dropped the count by two, not three: the
    // container itself is never a unit of work. (This is the assertion the broken-counter demo
    // fails; it is the LAST thing in this step, so the reopen below is its own step and still runs.)
    await checkReq('R5', async () => { await containerIsNotAUnit(page, state) })
  })

  await flowStep('Reopen a sub-task — the parent reopens', async () => {
    // Its own step on purpose: even if the counter check above fails, the flow still reopens the
    // sub-task here, so the state the reload step reads is the same whether or not R5 held.
    // R4, the other direction.
    await checkReq('R4', async () => { await reopenSubTaskReopensParent(page, state) })
    // The count climbs back — and this reads correctly even under the broken counter, because the
    // bug only miscounts a DONE container; a reopened one is counted by its open leaves again.
    await checkReq('R5', async () => {
      await proveVisible(page.locator('#left'), String(state.leaves), 'And the count climbs back to ' + state.leaves)
    })
  })

  await flowStep('Walk the smart views — every badge matches its list', async () => {
    // R6 — for each view, the sidebar badge equals the number of task rows the view actually shows.
    await checkReq('R6', async () => { await walkSmartViews(page, state) })
  })

  await flowStep('Read the date chips', async () => {
    // R7 — against the frozen clock, a past-due task reads overdue and a due-today task reads today.
    await checkReq('R7', async () => { await readDateChips(page, state) })
  })

  await flowStep('Reload — everything comes back', async () => {
    // R8 — the edit, the rolled-up state, and a completed stamp all survive a real reload.
    await checkReq('R8', async () => { await reloadKeepsEverything(page, state) })
    if (HOLD) await hudNote('Every value above was read off the screen you just watched, never off storage')
  })
})
