---
screen: conflicts
area: Core
title: Conflicts
route: /conflicts
---

## R1 — A conflict is one fact stated two incompatible ways

Not a gap, not a TODO, not a missing test. Two requirements that cannot both be true — a
nav with five items on one screen and four on another, two different defaults for the same
field. Anything looser fills the list with noise and you stop opening it.

## R2 — Both positions are shown in full, with where each came from

Side by side, each naming its screen and requirement. You are picking a winner, so you have
to be able to read both without leaving.

## R3 — You pick which side is canon

The tool never picks. Choosing a side is a requirement decision, and a tool that guesses one
silently is the thing this whole product exists to stop.

## R4 — Resolving dispatches the rewrite of the losing side

Both PRD files end up agreeing, and every screen downstream of the loser goes stale so its
draft and screen get revisited.

## R5 — Decisions survive a rescan

A resolution is keyed by the content of the conflict, not its position in a list, so
rescanning does not resurrect something you already settled.
