---
screen: init
area: Setup
title: Init
route: /init
---

## R1 — Asks for what cannot be guessed, and nothing else

How to start the app, what URL it serves on, and which routes matter. Guessing any of these
wrong produces a complete, confident, wrong board.

## R2 — An existing app is crawled into rows

Each route becomes a screen: visited, screenshotted, and given a draft PRD read from what
is actually on the page. The board is populated on day one instead of empty.

## R3 — A crawled PRD is marked as a guess

It is a proposal for you to correct, never canon, and it is visibly different from a PRD you
wrote. A crawled screen lands in document mode — the guessed PRD, the current screen, and a test
that proves it, with no wireframe — so the one gate here is accepting the requirements as canon,
not a draft review.

*Corrected 2026-07-27: this said "the draft and screen cells stay unapproved so the loop starts at
gate A." That was the greenfield-only model. An existing screen already exists, so it is documented
(PRD + current screen + test), and a screen with no wireframe has no gate A and no gate B. The code
grew a second mode and the spec had to follow; the meaning the CEO owns — a crawl is a guess to be
corrected, never canon — is unchanged.*

## R4 — An empty project is the same flow with nothing found

No routes, no rows, and a prompt to write the first PRD. Greenfield is the zero case of the
crawl, not a separate mode with separate code.

## R5 — Rerunning finds new screens without touching settled ones

Routes already on the board keep their PRD, their approvals and their pins.
