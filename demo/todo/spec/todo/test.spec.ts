// Proving flow for Tsumiki (spec/todo/prd.md) — specboard's own teaching demo. ONE comprehensive
// flow drives the real app and proves all eight requirements, reading every asserted value off a
// cell it first brings on screen (never off storage). Five of the eight are DERIVED values (a ring,
// a roll-up, a counter, a filter badge, a date chip) — the ones that drift silently, and the reason
// this demo is worth watching.
//
// DETERMINISM. Tsumiki takes a frozen clock via ?now= (so the overdue/today chips are the same every
// run) and seeds a fixed set of tasks when its storage is empty. The flow pins the clock and clears
// storage, so it always starts from the same board.

import { test, checkReq, coverReqs, flowStep, hudNote, hudCheck, recordHold, proveVisible } from '../_base'
import { openSeededBoard, addTask, renameInPlace, addSubTaskGrowsRing, tickOneSubTask, finishContainerRollsUp,
  containerIsNotAUnit, reopenSubTaskReopensParent, walkSmartViews, readDateChips, reloadKeepsEverything } from './steps'

// Task 7 (2026-08-22): every beat below is an exported step function in ./steps.ts — the beat-function
// convention — lifted VERBATIM out of this flow (the same When, the same proveVisible/hudCheck
// assertions, the numbers now computed from the threaded state). The checkReq stays AROUND each
// call, so the proof's power is unchanged; the board's composer can now chain these beats into a
// new flow with no model involved (see the composed flow at the foot of this file).

const HOLD = recordHold()

test('Tsumiki — the full flow (R1–R8)', async ({ page }) => {
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

// ── COMPOSED FLOW: 'Add, rename, grow and roll up the container, then reload — composed' (deterministic emitter — tools/compose.mjs) ─────────────
// Every beat below is an authored step function, red-first-proven in its unit home
// (spec/<screen>/steps.ts); this file's first full run passing is the composition's validity
// (CLAUDE.md rule 1 addendum, the human 2026-08-21). No model was involved and no graph is
// stored — this is ordinary authored-test material from the moment it was written.
test('Container roll-up — composed (R1–R4, R8)', async ({ page }) => {
  await coverReqs('R1', 'R2', 'R3', 'R5', 'R4', 'R8')
  // the budget: the harness default for the fixture + each beat's declared ms (undeclared = the default)
  test.setTimeout(480000)
  // the fixture Given, once — frozen clock · storage cleared · the seed: one container (ring 1/3) + three open tasks + one done — To do 5
  const state = await openSeededBoard(page)
  // beat 1 — proves R1
  await flowStep('type "Water the plants" and press Add — a new row at the bottom, stamped added just now', async () => {
    await checkReq('R1', async () => { await addTask(page, state) })
  })
  // beat 2 — proves R2
  await flowStep('double-click the new task and retype it — the same row, stamp flipped to edited', async () => {
    await checkReq('R2', async () => { await renameInPlace(page, state) })
  })
  // beat 3 — proves R3
  await flowStep('add a sub-task to the container — the ring grows by itself, no checkbox on the parent', async () => {
    await checkReq('R3', async () => { await addSubTaskGrowsRing(page, state) })
  })
  // beat 4 — proves R5
  await flowStep('tick one sub-task — To do drops by exactly one', async () => {
    await checkReq('R5', async () => { await tickOneSubTask(page, state) })
  })
  // beat 5 — proves R4
  await flowStep('tick the container\'s last open sub-tasks — it completes itself', async () => {
    await checkReq('R4', async () => { await finishContainerRollsUp(page, state) })
  })
  // beat 6 — proves R5
  await flowStep('To do dropped by the open leaves, never by the container', async () => {
    await checkReq('R5', async () => { await containerIsNotAUnit(page, state) })
  })
  // beat 7 — proves R8
  await flowStep('reload — the rename, the ring and a completed stamp come back', async () => {
    await checkReq('R8', async () => { await reloadKeepsEverything(page, state) })
  })
})

// ── R9: a DELIBERATELY FAILING test — a live demonstration of how a FAILED requirement reads on the
// board (the human, 2026-09-02: "add a failing test case to demonstrate how a fail test case shows").
// Tsumiki hard-deletes with no undo; R9 asks for a reversible delete that keeps the To-do count. The
// app does not do it, so this test FAILS ON PURPOSE: the scenes before the delete pass and harvest
// green; the Then's three claims after it (still listed · an Undo · To do still 5) all fail and
// harvest RED frames beside the schematic's intended state. It is the one honestly ungreen row on
// this board — do NOT "fix" it green (its whole value is that it stays red).
test('R9 (demo) — a deleted task should be reversible, keeping the count — INTENTIONALLY FAILING', async ({ page }) => {
  coverReqs('R9')
  const state = await openSeededBoard(page)
  const left = page.locator('#left')
  const row = (id: string) => page.locator(`.task[data-id="${id}"]`)
  await checkReq('R9', async () => {
    await proveVisible(left, String(state.leaves), 'To do — five open leaves before the delete')
    // SHOW THE DELETE, NEVER ONLY SAY IT (the human, 2026-09-02: "the failed test case totally not
    // really delete a subtask — please show it out in visual, not just text"). The When acts on a
    // task, so the task is ringed BEFORE the action and the list is ringed AFTER it, where the row
    // used to be — a beat whose only frames are a counter is not watchable.
    await proveVisible(row('k2').locator('.ttl'), 'Pay the electricity bill', 'The open task about to be deleted — Pay the electricity bill')
    await page.locator('.task[data-id="k2"] .del').click()          // delete it (Tsumiki hard-deletes)
    // THE THEN, AS WRITTEN — every fact of it, each a SOFT claim so the beat reaches all three and
    // fails at its end (the human, 2026-09-02: "the schematic should be correct, only the proof
    // should be wrong"). Until then the scene after the click asserted "gone" and PASSED: the test
    // was documenting the app instead of proving the requirement, and the drawing, mirroring that
    // scene, showed the hard delete as if it were what R9 asks for. The three claims are the Then's
    // three facts — the task is still listed (archived, not gone), an Undo appears on it, and "To do"
    // still reads 5. Tsumiki fails all three: the row is gone, there is no Undo, the counter reads 4 —
    // three red moments on the proof, while the schematic draws the intended state from the last one
    // the app got right (the task ringed before the click), with the Undo and the 5 on it.
    await proveVisible(row('k2').locator('.ttl'), 'Pay the electricity bill',
      'Pay the electricity bill — still listed, only archived', { soft: true })
    await proveVisible(row('k2').locator('.undo'), 'Undo', 'An Undo appears on the archived task', { soft: true })
    await proveVisible(left, String(state.leaves), 'To do should still read 5 — a delete is only an archive', { soft: true })
  })
})
