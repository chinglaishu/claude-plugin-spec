---
screen: gate-screen-review
area: Gates
title: Gate B — screen review
route: /gate/screen/:screen
---

## R1 — Wireframe and screenshot, side by side

The approved wireframe on the left, the real screenshot on the right. This is the only
place anything checks that what got built is what was designed.

## R2 — Unchanged pixels never open the gate

The E2E run re-shoots on every pass. If the new screenshot is byte-identical to the
approved one, nothing opens. A gate that asks when nothing happened is a gate you learn to
click through without looking.

## R3 — Previous and current screenshot are both shown when it changed

Before and after, so the question is "did this change on purpose", which takes a glance.
"Does this look right" from cold takes a minute and gets a worse answer.

## R4 — Approving pins the draft hash and the screenshot hash

Both, because either one moving is a real reason to ask again.

## R5 — Rejecting names which side is wrong

Either the build missed the design, or the design was wrong. The two dispatch different
jobs, so the gate has to ask which.
