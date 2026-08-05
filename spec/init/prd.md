---
screen: init
area: Setup
title: Setup
route: /init
---

<!-- reworded 2026-07-30: title Init → Setup so the screen reads the same as the "Set up" button and
     header that reach it. The stored identity (screen/route) stays "init" — only the human-facing
     name changed. Awaiting the human's confirmation (there is no accept mechanism to wire). -->


## R1 — Asks for what cannot be guessed, and nothing else

How to start the app, what URL it serves on, and which routes matter. Guessing any of these
wrong produces a complete, confident, wrong board.

## R2 — An existing app is inventoried into rows: visited, screenshotted, nothing faked

Each route becomes a row: visited and screenshotted (`crawl.png`), with **no PRD** — visibly,
honestly ungoverned. The board shows the whole app on day one as a map of what is not yet covered,
never as fake coverage.

*Corrected 2026-07-31 (the human's call): this said each route was "given a draft PRD read from what
is actually on the page", and the crawl went on to auto-author characterization tests. That drafting
was removed: a guessed requirement records the implementation's bugs as intent, and a shallow
auto-test is a false green that makes the board look finished while proving nothing. Depth is a
per-screen, human-sponsored **kg-deep** pass — study, golden fixture, a drafted PRD for the human's
gate, then a few comprehensive proving flows — run one screen at a time, most important first.*

## R3 — A drafted PRD is marked as a guess until the human accepts it

A PRD drafted on the human's behalf (a kg-deep pass's draft) carries `guess: true` — a proposal for
them to correct, never canon, and visibly different from a PRD they wrote. A guess is the one thing
on the board still waiting on a person; dropping the flag is the acceptance, and there is no other
gate.

*Corrected 2026-07-27: this said "the draft and screen cells stay unapproved so the loop starts at
gate A." That was the greenfield-only model — a screen with no wireframe has no gate A and no gate B.
Corrected again 2026-07-31: the guess's SOURCE changed — the crawl no longer drafts PRDs (see R2), so
a guess now comes from a kg-deep pass. What the human owns is unchanged: a drafted requirement is a
guess to be corrected, never canon.*

## R4 — An empty project is the same flow with nothing found

No routes, no rows, and a prompt to write the first PRD. Greenfield is the zero case of the
crawl, not a separate mode with separate code.

## R5 — Rerunning finds new screens without touching settled ones

Routes already on the board keep their PRD, their approvals and their pins.
