import { expect, proveVisible, MISSING, reveal, hudCheck, recordHold, waitForContent } from '../_base'
import type { Page } from '@playwright/test'
import { APP_BASE, FROZEN_NOW } from '../_app'

// Tsumiki's composable beats (the beat-function convention — kg-e2e; Task 7, 2026-08-22). Each
// exported function is ONE beat of the proving flow in ./test.spec.ts, lifted VERBATIM: it performs
// its When on the real app, asserts its Then with EXACT numbers computed from the threaded `state`
// (the seed's golden numbers, moved by each beat's arithmetic — never read off the screen and
// echoed back), and updates that state. The flow keeps its checkReq AROUND each call, so the
// proof's power is unchanged; the board's composer chains the same calls into a new flow with
// no model involved.

export type FlowState = Record<string, any>

const URL = `${APP_BASE}/todo.html?now=${encodeURIComponent(FROZEN_NOW)}`
const HOLD = recordHold()

// ── selectors (the app carries data-id/data-done hooks; everything else is read as a user sees it)
const rowById = (page: Page, id: string) => page.locator(`.task[data-id="${id}"]`)
const rowByTitle = (page: Page, t: string) => page.locator('.task', { has: page.locator('.ttl', { hasText: t }) })
const subById = (page: Page, id: string) => page.locator(`.srow[data-id="${id}"]`)
const navBtn = (page: Page, v: string) => page.locator(`.nav[data-view="${v}"]`)

// THE FIXTURE: the seed under the frozen clock — load once, wipe storage, load again so the app
// re-seeds deterministically. The golden numbers: k1 is a container with three sub-tasks, one done
// (ring 1/3, two open leaves); k2 k3 k4 are open childless tasks; k5 is done. To do = 2 + 3 = 5.
export const GIVEN = {
  fn: 'openSeededBoard',
  text: 'frozen clock · storage cleared · the seed: one container (ring 1/3) + three open tasks + one done — To do 5',
  gives: ['seeded']
}
export async function openSeededBoard (page: Page): Promise<FlowState> {
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await waitForContent(rowById(page, 'k1'))
  return { leaves: 5, ring: { done: 1, total: 3 }, container: 'k1' }
}

export const BEATS = [
  { fn: 'addTask', proves: 'R1', name: 'type "Water the plants" and press Add — a new row at the bottom, stamped added just now', needs: ['seeded'], gives: ['task'] },
  { fn: 'renameInPlace', proves: 'R2', name: 'double-click the new task and retype it — the same row, stamp flipped to edited', needs: ['task'], gives: ['renamed'] },
  { fn: 'addSubTaskGrowsRing', proves: 'R3', name: 'add a sub-task to the container — the ring grows by itself, no checkbox on the parent', needs: ['seeded'], gives: ['subtask'] },
  { fn: 'tickOneSubTask', proves: 'R5', name: 'tick one sub-task — To do drops by exactly one', needs: ['seeded'], gives: ['one-ticked'] },
  { fn: 'finishContainerRollsUp', proves: 'R4', name: 'tick the container\'s last open sub-tasks — it completes itself', needs: ['subtask', 'one-ticked'], gives: ['rolled-up'] },
  { fn: 'containerIsNotAUnit', proves: 'R5', name: 'To do dropped by the open leaves, never by the container', needs: ['rolled-up'], gives: ['counted'] },
  { fn: 'reopenSubTaskReopensParent', proves: 'R4', name: 'reopen one sub-task — the container reopens', needs: ['rolled-up'], gives: ['reopened'] },
  { fn: 'walkSmartViews', proves: 'R6', name: 'walk All / Active / Today / Completed — every badge equals its rows', needs: ['seeded'], gives: ['views'] },
  { fn: 'readDateChips', proves: 'R7', name: 'read the date chips under the frozen clock — overdue and today', needs: ['seeded'], gives: ['dates'] },
  { fn: 'reloadKeepsEverything', proves: 'R8', name: 'reload — the rename, the ring and a completed stamp come back', needs: ['renamed'], gives: ['reloaded'] }
]

// R1 — typing enables the Add button; pressing it drops a new row at the bottom, its checkbox EMPTY,
// stamped "added just now". A WATCHABLE beat (kg-e2e "a watchable beat", the human 2026-08-30 on this
// very beat) — three DISTINCT scenes, every named control in frame, the named state visibly different:
//   scene 1 — the filled Add box carrying the typed text (the action's own value, proveVisible reads it)
//   scene 2 — the Add button it names, now ENABLED (the actor of "press Add", ringed so the union
//             camera keeps it in frame — the crop that hid it is the defect this fixes)
//   scene 3 — the new row at the bottom: its checkbox EMPTY, sitting under the already-done "Buy a
//             birthday gift for Mia" so unchecked reads as a CONTRAST, stamped "added just now"
// The old beat clicked .go WITHOUT ringing it (the tight camera cropped the Add button away — "it says
// press Add but there's no Add button"), never showed the unchecked state, and spent a third scene
// re-proving the typed string on the new row's .ttl — the redundant scene removed here.
export async function addTask (page: Page, state: FlowState): Promise<void> {
  await reveal(page.locator('.addrow'))
  await page.locator('#nt').pressSequentially('Water the plants')
  // SCENE 1 — the WHEN's own value: the text now sitting in the Add box.
  await proveVisible(page.locator('#nt'), 'Water the plants', 'The task typed into the Add box', { soft: true })
  // SCENE 2 — the control the When NAMES, now enabled.
  await expect(page.locator('.go'), 'typing enabled the Add button').toBeEnabled()
  await proveVisible(page.locator('.go'), 'Add', 'The Add button, now enabled', { soft: true })
  await page.locator('.go').click()
  const row = rowByTitle(page, 'Water the plants')
  await expect(row.locator('.cb'), 'the new row is a leaf with its own checkbox').toHaveCount(1)
  // the named STATE, made assertable: the new row starts UNCHECKED (its checkbox has no .on). The
  // contrast row "Buy a birthday gift for Mia" sits done just above it, so the empty box reads as a
  // difference the watcher can see, not a claim on faith.
  await expect(row.locator('.cb'), 'the new row starts UNCHECKED — still to do').not.toHaveClass(/\bon\b/)
  // SCENE 3 — the OUTCOME: ring the new row so its empty checkbox and its "added just now" stamp are
  // both in frame (proveVisible reads the row's text for the stamp; the empty .cb sits at its left edge).
  await proveVisible(row.locator('.trow'), 'added just now',
    'The new row — its checkbox empty, stamped added just now',
    { soft: true, match: s => /added just now/.test(s) })
  state.task = 'Water the plants'
  state.leaves += 1
}

// R2 — the row shows the new text, and the stamp flips added → edited.
export async function renameInPlace (page: Page, state: FlowState): Promise<void> {
  await rowByTitle(page, state.task).locator('.ttl').dblclick()
  const edit = page.locator('.edit')
  await edit.fill('Water the office plants')
  await edit.press('Enter')
  const row = rowByTitle(page, 'Water the office plants')
  await proveVisible(row.locator('.ttl'), 'Water the office plants',
    'The renamed task, read back off its row', { soft: true })
  await proveVisible(row.locator('.meta'), 'edited just now',
    'The stamp flipped to edited', { soft: true, match: s => /edited just now/.test(s) })
  state.task = 'Water the office plants'
}

// R3 — a container shows a derived ring, no checkbox, and the ring grows when a sub-task is added.
export async function addSubTaskGrowsRing (page: Page, state: FlowState): Promise<void> {
  const k = state.container
  await proveVisible(rowById(page, k).locator('.pct'), `${state.ring.done}/${state.ring.total}`,
    'The container ring — one of three done', { soft: true })
  await expect(rowById(page, k).locator('.trow > .cb'),
    'a container has no checkbox of its own — only a ring').toHaveCount(0)
  // …and THAT absence is claimed, not left to the count: MISSING passes exactly while the parent has
  // no checkbox and fails, with the box's own state, the moment one appears on it.
  await proveVisible(rowById(page, k).locator('.trow > .cb'), MISSING,
    'The parent still has no checkbox of its own', { soft: true })
  await page.locator('#sub-' + k).fill('Order name badges')
  await page.locator('#sub-' + k).press('Enter')
  state.ring.total += 1
  state.leaves += 1
  state.sub = 'Order name badges'
  await proveVisible(rowById(page, k).locator('.pct'), `${state.ring.done}/${state.ring.total}`,
    'Adding a sub-task grew the ring by itself — one of four', { soft: true })
}

// R5 — the count reads the leaves, then one sub-task done drops it by exactly one.
export async function tickOneSubTask (page: Page, state: FlowState): Promise<void> {
  const left = page.locator('#left')
  await proveVisible(left, String(state.leaves), 'To do — ' + state.leaves + ' leaves of work left', { soft: true })
  await subById(page, 'k1b').locator('.scb').click()
  state.leaves -= 1
  state.ring.done += 1
  await proveVisible(left, String(state.leaves), 'One sub-task done — the count drops by exactly one', { soft: true })
}

// R4 — finish the container's remaining open sub-tasks; the last tick rolls the parent up —
// nobody ticked the parent; it completed itself.
export async function finishContainerRollsUp (page: Page, state: FlowState): Promise<void> {
  const k = state.container
  await subById(page, 'k1c').locator('.scb').click()
  await rowById(page, k).locator('.srow', { has: page.getByText(state.sub, { exact: true }) })
    .locator('.scb').click()
  const open = state.ring.total - state.ring.done - 2   // what was still open before these two ticks, minus them
  state.ring.done = state.ring.total
  state.leaves -= 2
  expect(open, 'the two ticks were the container\'s LAST open sub-tasks').toBe(0)
  await proveVisible(rowById(page, k).locator('.pct'), `${state.ring.total}/${state.ring.total}`,
    'Every sub-task done — the ring is full', { soft: true })
  // NOBODY TICKED THE PARENT — claimed as the absence it is: there is no checkbox on the container
  // to have ticked, so the roll-up can only have come from its own leaves.
  await proveVisible(rowById(page, k).locator('.trow > .cb'), MISSING,
    'Nobody ticked the parent — it has no box to tick', { soft: true })
  await hudCheck('The container completed itself', 'true', await rowById(page, k).getAttribute('data-done'))
  expect(await rowById(page, k).getAttribute('data-done'),
    'the container rolled up to done on its own').toBe('true')
}

// R5 — completing a container of two open leaves dropped the count by two, not three: the
// container itself is never a unit of work. (This is the assertion the broken-counter demo fails.)
export async function containerIsNotAUnit (page: Page, state: FlowState): Promise<void> {
  // BOTH FACTS OF THE THEN, EACH A SOFT CLAIM (the authored-intent lint, phase 6): "To do reads 4",
  // and "down by two, not three: the container is never a unit of work". The second is only visible
  // beside the first — the container's own ring is FULL, so it finished, and the count still moved
  // by the two open leaves alone. Soft, so a wrong count does not stop the beat before it has shown
  // the container that explains it.
  await proveVisible(page.locator('#left'), String(state.leaves),
    'The container is not a task — the count dropped by two, to ' + state.leaves, { soft: true })
  await proveVisible(rowById(page, state.container).locator('.pct'), `${state.ring.done}/${state.ring.total}`,
    'The container finished with them — and was never one of the four', { soft: true })
  // …NOT THREE: the container has no checkbox to have been counted as work in the first place, so
  // the two open leaves are the whole of the drop.
  await proveVisible(rowById(page, state.container).locator('.trow > .cb'), MISSING,
    'Never a unit of work — the container has no box of its own', { soft: true })
}

// R4, the other direction — reopening any sub-task reopens the container.
export async function reopenSubTaskReopensParent (page: Page, state: FlowState): Promise<void> {
  const k = state.container
  await subById(page, 'k1b').locator('.scb').click()
  state.ring.done -= 1
  state.leaves += 1
  await proveVisible(rowById(page, k).locator('.pct'), `${state.ring.done}/${state.ring.total}`, 'Reopen one sub-task and the parent reopens')
  expect(await rowById(page, k).getAttribute('data-done'),
    'reopening a sub-task reopened the container').toBe('false')
}

// R6 — for each view, the sidebar badge equals the number of task rows the view actually shows.
export async function walkSmartViews (page: Page, state: FlowState): Promise<void> {
  for (const v of ['all', 'active', 'today', 'completed']) {
    await navBtn(page, v).click()
    await reveal(navBtn(page, v))
    const badge = ((await navBtn(page, v).locator('.ct').textContent()) || '').trim()
    const rows = await page.locator('.list .task').count()
    await hudCheck(`${v} — sidebar badge vs rows on screen`, badge, String(rows))
    expect(String(rows), `${v}: the badge must equal the rows the view shows`).toBe(badge)
    // …and the fact the Then names, CLAIMED on the badge itself (the authored-intent lint, phase 6):
    // what it reads is the number of task rows this view actually shows. The expected value is
    // COUNTED off the list, never read off the badge, so a badge that drifted from its own view
    // fails here — photographed, on the badge.
    await proveVisible(navBtn(page, v).locator('.ct'), String(rows),
      `${v} — the badge equals the rows on screen`, { soft: true })
    // …and ONLY THAT VIEW'S TASKS SHOW: the view is the one whose button is on, and the list under
    // it is that view's own — claimed on the button the click turned on.
    await proveVisible(navBtn(page, v), v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1),
      `${v} — only this view's tasks are on screen`,
      { soft: true, match: s => s.toLowerCase().startsWith(v) })
    if (HOLD) await page.waitForTimeout(HOLD)
  }
  await navBtn(page, 'all').click()
  state.views = 4
}

// R7 — against the frozen clock, a past-due task reads overdue and a due-today task reads today.
export async function readDateChips (page: Page, state: FlowState): Promise<void> {
  await navBtn(page, 'all').click()
  await proveVisible(rowById(page, 'k3').locator('.chip'), 'overdue',
    'Renew passport is past due — overdue', { soft: true })
  await proveVisible(rowById(page, 'k2').locator('.chip'), 'today',
    'Pay the electricity bill is due today', { soft: true })
  state.dates = { overdue: 'k3', today: 'k2' }
}

// R8 — the edit, the container's ring as it stands, and a completed stamp all survive a real reload.
export async function reloadKeepsEverything (page: Page, state: FlowState): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForContent(rowById(page, 'k1'))
  await proveVisible(rowByTitle(page, state.task).locator('.ttl'),
    state.task, 'The rename survived the reload', { soft: true })
  await proveVisible(rowById(page, state.container).locator('.pct'), `${state.ring.done}/${state.ring.total}`,
    'The container came back at ' + state.ring.done + ' of ' + state.ring.total, { soft: true })
  await navBtn(page, 'completed').click()
  await proveVisible(rowById(page, 'k5').locator('.meta'), 'done',
    'A completed stamp survived the reload', { soft: true, match: s => /done/.test(s) })
  state.reloaded = true
}
