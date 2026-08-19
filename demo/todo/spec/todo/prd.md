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

## R1 — Adding a task puts it in the list

Typing a task and pressing Add (or Enter) shows it as a new row at the bottom of the list, unchecked,
carrying exactly the text that was typed. An empty input adds nothing — the Add button is disabled
until there is text.

<!-- Proven by typing a new task on the real page, then reading the new row's title off the visible
     list and confirming its meta line reads "added just now". -->

## R2 — A task can be edited in place, and the edit is stamped

Double-clicking a task's title (or its edit icon) makes it editable; Enter saves the new text in the
same row, Escape cancels. Saving a real change records an "edited" time, replacing the "added" one.

<!-- Proven by renaming a task on screen, reading the new title back off its row, and confirming the
     meta line flipped from "added" to "edited just now". -->

## R3 — A task with sub-tasks is a container with a derived progress ring

Sub-tasks live inside a task. A task that has them is a container: it shows a progress ring counting
its sub-tasks (2 of 3) in place of its own checkbox, so it can never be completed by a stray click —
only its sub-tasks can be. Adding a sub-task moves the ring by itself.

<!-- Proven by opening the seeded container (ring reads a fraction), adding a sub-task on screen, and
     confirming the ring's fraction grows its denominator by one with no checkbox on the parent. -->

## R4 — Completion rolls up, both directions

Completing the last open sub-task completes the container by itself; reopening any sub-task reopens
the container. The container's done-state is purely derived from its children — nobody ticks a
container by hand.

<!-- Proven inside one session: tick the container's sub-tasks until the last one, then read the
     PARENT row's done-state (ring full, title struck through) off the screen; then reopen one
     sub-task and watch the parent reopen. -->

## R5 — "To do" counts remaining leaves only

The header count is the real amount of work left: open sub-tasks, plus open tasks that have no
sub-tasks. A container is scaffolding — it is never counted as a unit of work itself, and completing
one drops the count by its open-leaf count, not by one.

<!-- Proven by reading the counter off the screen across exact transitions: completing one sub-task
     drops it by exactly one; completing a container of two open sub-tasks drops it by exactly two,
     not three (the container is not a unit). The single most drift-prone rule here. -->

## R6 — Smart views filter correctly, and the sidebar counts agree

All shows every task; Active hides done tasks; Today shows only not-done tasks due on or before
today; Completed shows only done tasks. Each view's sidebar badge equals the number of task rows that
view actually shows.

<!-- Proven by walking each view: read its sidebar badge, count the task rows on screen, and assert
     the two are equal — an on-screen count, never a read from code. -->

## R7 — A due date derives an overdue or today chip

A not-done task due before today wears the red "overdue" chip; a task due today wears the "today"
chip; a task due later shows its date; a done task wears no date chip.

<!-- Proven against the frozen `?now=` clock: the seeded past-due task reads "overdue" and the
     due-today task reads "today", both read off the visible chips. -->

## R8 — Everything survives a reload

Tasks, sub-tasks, done-states, edited titles, due dates, order, and every created / edited /
completed timestamp all come back after the page reloads — nothing lived only on screen.

<!-- Proven by reloading the real page after the edits and completions above, then reading the edited
     title, the container's rolled-up state, and a completed timestamp back off the fresh screen. -->
