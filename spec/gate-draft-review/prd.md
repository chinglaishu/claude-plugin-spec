---
screen: gate-draft-review
area: Gates
title: Gate A — draft review
route: /gate/draft/:screen
---

## R1 — PRD and wireframe, side by side

The requirement text on the left, the rendered wireframe on the right, both fully visible
without scrolling either one. The question is "is this what I meant" and it cannot be
answered by looking at one of them.

## R2 — Only the requirements that moved are highlighted

When the PRD changed since the last approval, the changed requirements are marked. You
re-read three lines, not the whole document.

## R3 — Approving pins the PRD hash

"Looks right" stores the current PRD content hash against the draft. That pin is the only
thing that later makes the draft go stale, and it is what makes staleness honest rather
than a timestamp.

## R4 — Rejecting sends a reason back

"Not what I meant" takes a sentence and dispatches a redraft with it. The sentence is the
whole value of the gate; without it the next draft is another guess.

## R5 — The gate opens by itself

It opens when the draft changes or the PRD changes. Nothing else queues it, and it does not
open when neither has moved.
