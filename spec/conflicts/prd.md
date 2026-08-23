---
screen: conflicts
area: Core
title: Conflicts
route: /conflicts
---

### 1 · What a conflict is

## R1 — A conflict is one fact stated two incompatible ways

- **Given** two requirements that cannot both be true
- **When** the scan lists a conflict
- **Then** it is one fact stated two incompatible ways — never a gap, a TODO or a missing test

Not a gap, not a TODO, not a missing test. Two requirements that cannot both be true — a
nav with five items on one screen and four on another, two different defaults for the same
field. Anything looser fills the list with noise and you stop opening it.

## R2 — Both positions are shown in full, with where each came from

- **Given** an open conflict
- **When** you open the Conflicts list
- **Then** both positions show in full, side by side, each naming its screen and requirement

Side by side, each naming its screen and requirement. You are picking a winner, so you have
to be able to read both without leaving.

### 2 · Deciding, and keeping the decision

## R3 — You pick which side is canon

- **Given** an open conflict with no side chosen — Resolve disabled, nothing recorded
- **When** you pick a side
- **Then** Resolve enables, and still nothing is recorded until you press it — the tool never picks for you

The tool never picks. Choosing a side is a requirement decision, and a tool that guesses one
silently is the thing this whole product exists to stop.

## R4 — Resolving dispatches the rewrite of the losing side

- **Given** an open conflict with a side picked, a second conflict still open
- **When** you press Resolve
- **Then** the decision is recorded with the winning and losing file, the card is gone from Open — you stay there, the Settled count ticks up, a toast names it — and the Settled list offers the rewrite of the losing file
- **When** you press Undo in the Settled list
- **Then** the conflict returns to Open and you stay on Settled

Both PRD files end up agreeing: resolving records the decision and offers the rewrite of the
losing file, and the losing screen's requirements read against their tests again — a meaning
that changed shows up as unproven until a test proves the corrected text.

Resolving **keeps you on the Open list**: the settled card leaves quietly — the Settled count
ticks up and a toast names what was settled — so the next open conflict is right where you
were. Undo, from the Settled list, stays there the same way. Jumping tabs after every decision
made working through a queue of conflicts a two-click round trip each time.

*Rewritten 2026-08-03 — two changes. The old "draft and screen get revisited" consequence
described the deleted four-column board (conflict 291bf578: the human picked board R1 as canon —
there are no draft or screen stages). The stay-on-Open behaviour is at the human's direction,
replacing the old jump-to-Settled; that jump existed as feedback that the click landed, and the
toast plus the live counts now carry that.*

## R5 — Decisions survive a rescan

- **Given** a settled conflict
- **When** a rescan reorders the findings and swaps its two sides
- **Then** it stays settled — keyed by its content, not its position — and does not reappear on Open

A resolution is keyed by the content of the conflict, not its position in a list, so
rescanning does not resurrect something you already settled.
