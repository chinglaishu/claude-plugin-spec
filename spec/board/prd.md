---
screen: board
area: Core
title: Board
route: /
---

## R1 — One row per screen

Every screen in the project is one row. The row carries the screen's name and how many
requirements its PRD holds. Requirements are never their own rows; six requirements about
one screen would repeat the same wireframe six times down the page and colour would stop
meaning anything.

## R2 — Four cells, left to right

PRD, draft, screen, E2E — in that order, always. The order is the workflow, so the board
reads as the loop it is asking you to run.

## R3 — A cell shows its artifact, not a word for it

The draft cell renders the wireframe. The screen cell renders the screenshot. A cell that
says "done" in text has told you nothing you can check.

## R4 — Five states, and they are computed

Each cell is missing, waiting, needs-review, stale, or ok. Nothing is typed in by hand: the
state is the stored approval hash compared against the current content hash. No status field
can be forgotten because no status field exists.

Needs-review and stale are deliberately separate. Needs-review means nobody has ever said
yes to this; stale means they did, and what they approved it against has since moved. One is
a first look and the other is a re-look, and they are answered differently.

*Corrected 2026-07-26: this requirement said four states. The board was built, all six drafts
showed "stale" before anyone had seen any of them, and the word was wrong on the screen. The
code taught the spec, so the spec changed rather than the label.*

## R5 — A red cell is a button

Clicking a cell that is missing or stale dispatches the job that would fix it. The board is
where the work starts, not a report you read before going somewhere else to work.

## R6 — The header counts what is true right now

Screens total, and how many are drafted, built, and tested. Derived on every load from the
same hashes the cells use, so the summary can never disagree with the rows under it.

## R7 — Screens are grouped into named areas, never paginated

Each screen declares an area; the board renders one collapsible group per area, in a declared
order, each showing its own count of screens waiting on you. Paging is refused deliberately: a
board you page through can no longer answer "what is the state of everything", which is the
only reason to have a board rather than a list.

## R8 — Filter by whose turn it is, and search across requirement text

Three filters — everything, waiting on you, not started — plus a search that matches screen
names, routes and the text of every requirement inside them. A group with no matching rows
hides itself rather than sitting empty.
