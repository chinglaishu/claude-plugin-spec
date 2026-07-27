---
screen: dispatch
area: Running
title: Dispatch panel
route: /run/:job
---

## R1 — One panel per job, opened by the cell you clicked

The job knows its screen and its column, so nothing has to be typed. "Draft the wireframe
for checkout-page" is the whole instruction.

## R2 — The work is visible while it runs

Claude's output streams into the panel. A button that goes quiet for two minutes gets
clicked again, and the second run fights the first.

## R3 — Finishing updates the board without a reload

The cell the job was fixing changes state in place. If a gate is now due, it opens.

## R4 — One job per screen at a time

A second dispatch for a screen already running is refused, not queued silently. Two agents
editing one wireframe is a corrupted file and a confusing diff.

## R5 — Cancel actually stops it

The process is killed, and the partial work is left in place rather than rolled back, so you
can see how far it got.
