---
screen: todo
area: Tsumiki
title: Tsumiki — a task tracker with sub-tasks
route: /todo.html
---

<!--
DRAFTED on the human's behalf — a starting point for what Tsumiki should mean. It is canon the moment
it is written (there is no gate, no guess flag — removed 2026-08-17); edit or remove any requirement
freely, exactly like a test.

WHY THIS SCREEN EXISTS. Tsumiki is specboard's own teaching demo: a real, usable task tracker small
enough that anyone reads its whole spec in a minute, but rich enough that testing it is meaningful.
Five of the eight requirements below read a value the app DERIVES from other state — a progress ring,
a roll-up, a counter, a filter badge, a date chip — the kind of value that drifts silently when the
code changes. Those are the ones worth proving, and the reason a save/delete-only to-do list would
teach nothing. R5 is the subtle one, and the one the "red" demo deliberately breaks.

FIXTURE. The app seeds a fixed set of tasks when its storage is empty, and takes a frozen clock via
`?now=` so the date-derived chips (R7) are deterministic. The flow clears storage and pins the clock,
so every run starts from the same board.

Requirement ids are stable forever — later passes append, never renumber.
-->

### 1 · Tasks — add and edit

## R1 — Adding a task puts it in the list

- **Given** the list, with the Add box empty and the Add button disabled
- **When** you type "Water the plants" and press the now-enabled Add button
- **Then** a new row appears at the bottom — its checkbox empty — carrying that exact text, stamped "added just now"

Typing a task enables the Add button (empty input adds nothing — the button stays disabled until there
is text); pressing it shows the text as a new row at the bottom of the list, its checkbox empty,
stamped "added just now".

<!-- Proven by a WATCHABLE beat (see kg-e2e, "a watchable beat"): the When rings the filled Add box AND
     the Add button it names; the Then rings the new row so its EMPTY checkbox is on screen beside an
     already-checked row, with the "added just now" stamp — each scene a distinct step, the redundant
     repeat of the typed text removed. Revised 2026-08-30 on the human's ask: the old beat clicked Add
     without ringing it (the tight camera cropped it away), never showed the unchecked state, and spent
     three near-identical scenes on the same string. -->

## R2 — A task can be edited in place, and the edit is stamped

- **Given** a task row stamped "added"
- **When** you double-click its title, retype it and press Enter
- **Then** the same row reads the new text in place and its stamp flips to "edited just now"

Double-clicking a task's title (or its edit icon) makes it editable; Enter saves the new text in the
same row, Escape cancels. Saving a real change records an "edited" time, replacing the "added" one.

<!-- Proven by renaming a task on screen, reading the new title back off its row, and confirming the
     meta line flipped from "added" to "edited just now". -->

### 2 · Containers and roll-up

## R3 — A task with sub-tasks is a container with a derived progress ring

- **Given** a task with three sub-tasks, one done — its ring reads 1/3 and it has no checkbox of its own
- **When** you add a sub-task
- **Then** the ring reads 1/4 by itself, and the parent still has no checkbox

Sub-tasks live inside a task. A task that has them is a container: it shows a progress ring counting
its sub-tasks (2 of 3) in place of its own checkbox, so it can never be completed by a stray click —
only its sub-tasks can be. Adding a sub-task moves the ring by itself.

<!-- Proven by opening the seeded container (ring reads a fraction), adding a sub-task on screen, and
     confirming the ring's fraction grows its denominator by one with no checkbox on the parent. -->

## R4 — Completion rolls up, both directions

- **Given** a container whose sub-tasks are all but three done
- **When** you tick its last open sub-tasks
- **Then** the container completes itself — ring 4/4, title struck through — nobody ticked the parent
- **When** you toggle one done sub-task back open
- **Then** the container reopens — ring 3/4

Completing the last open sub-task completes the container by itself; reopening any sub-task reopens
the container. The container's done-state is purely derived from its children — nobody ticks a
container by hand.

<!-- Proven inside one session: tick the container's sub-tasks until the last one, then read the
     PARENT row's done-state (ring full, title struck through) off the screen; then reopen one
     sub-task and watch the parent reopen. -->

## R5 — "To do" counts remaining leaves only

- **Given** seven open leaves — three open sub-tasks in a container plus four childless tasks — "To do" reads 7
- **When** you tick one sub-task
- **Then** To do reads 6 — down by exactly one
- **When** you tick the container's last two open sub-tasks
- **Then** To do reads 4 — down by two, not three: the container is never a unit of work

The header count is the real amount of work left: open sub-tasks, plus open tasks that have no
sub-tasks. A container is scaffolding — it is never counted as a unit of work itself, and completing
one drops the count by its open-leaf count, not by one.

<!-- Proven by reading the counter off the screen across exact transitions: completing one sub-task
     drops it by exactly one; completing a container of two open sub-tasks drops it by exactly two,
     not three (the container is not a unit). The single most drift-prone rule here. -->

### 3 · Views and dates — derived chips

## R6 — Smart views filter correctly, and the sidebar counts agree

- **Given** the seeded tasks, some done, some due today
- **When** you switch to All, Active, Today or Completed
- **Then** only that view's tasks show, and its sidebar badge equals the task rows on screen

All shows every task; Active hides done tasks; Today shows only not-done tasks due on or before
today; Completed shows only done tasks. Each view's sidebar badge equals the number of task rows that
view actually shows.

<!-- Proven by walking each view: read its sidebar badge, count the task rows on screen, and assert
     the two are equal — an on-screen count, never a read from code. -->

## R7 — A due date derives an overdue or today chip

- **Given** the list under the frozen ?now= clock
- **When** the tasks render
- **Then** "Renew passport", due two days ago, wears the red overdue chip; "Pay the electricity bill", due today, wears the today chip

A not-done task due before today wears the red "overdue" chip; a task due today wears the "today"
chip; a task due later shows its date; a done task wears no date chip.

<!-- Proven against the frozen `?now=` clock: the seeded past-due task reads "overdue" and the
     due-today task reads "today", both read off the visible chips. -->

### 4 · Persistence

## R8 — Everything survives a reload

- **Given** tasks renamed, completed and reopened on screen
- **When** you reload the page
- **Then** the renamed title, the container's 3/4 ring and a completed stamp all come back

Tasks, sub-tasks, done-states, edited titles, due dates, order, and every created / edited /
completed timestamp all come back after the page reloads — nothing lived only on screen.

<!-- Proven by reloading the real page after the edits and completions above, then reading the edited
     title, the container's rolled-up state, and a completed timestamp back off the fresh screen. -->

### 5 · A deliberately failing requirement (a demonstration)

## R9 — A deleted task is reversible: the count holds until you confirm

- **Given** the seeded list, with "To do" reading 5
- **When** you delete an open task
- **Then** the delete is a soft archive — an Undo appears and "To do" still reads 5 until the undo window passes; nothing is lost on a mis-click

Tsumiki deletes **immediately and permanently**: there is no Undo, and "To do" drops the moment a
task goes. So this requirement is **intentionally UNMET** — it exists only to show, on the board, how
a FAILING requirement reads. The schematic **mirrors what the app measured** — "To do" reading 4
after the delete, ringed — and the proof photographs the same moment with the verdict on it: the
asserted value burned **red**, "got 4 ✕" on the callout, and the requirement's chip reading
**Failed**. The drawing never shows the 5 the app did not display: a mirror that drew a value nobody
measured would be a fabricated picture beside a real photograph, so the difference a reader sees
between the two cells is exactly the verdict, and only the verdict *(corrected 2026-09-02, rule 6 —
this paragraph first claimed the drawing showed the intended 5; the human kept the honest mirror on
the lead's recommendation)*. This is the one row on this board
that is honestly ungreen on purpose. *(added 2026-09-02 on the human's ask: "add a failing test case
to demonstrate how a fail test case shows".)*

<!-- Proven-to-FAIL, on purpose: the test deletes an open leaf and asserts (proveVisible on #left)
     that "To do" still reads 5. The app hard-deletes, so it reads 4 — the assertion fails, and that
     red failing frame beside the intended schematic is the whole demonstration. Do not "fix" it green:
     its value is that it stays red. -->
