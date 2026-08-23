---
screen: init
area: Setup
title: Setup
route: /init
---

<!-- reworded 2026-07-30: title Init → Setup so the screen reads the same as the "Set up" button and
     header that reach it. The stored identity (screen/route) stays "init" — only the human-facing
     name changed. Awaiting the human's confirmation (there is no accept mechanism to wire). -->

### 1 · Setup — only what cannot be guessed

## R1 — Asks for what cannot be guessed, and nothing else

- **Given** Setup, asking only how to start the app, what URL it serves on, and which routes matter
- **When** you pick a start mode, enter the URL and the routes, and save
- **Then** the project config stores exactly those, and Setup reads them back when you return

How to start the app, what URL it serves on, and which routes matter. Guessing any of these
wrong produces a complete, confident, wrong board.

## R6 — Setup carries a voice-over switch: off by default, saved with the project

- **Given** Setup's voice-over switch, off by default
- **When** you tick it and save
- **Then** the project config records voice-over on, and Setup reads it back ticked when you return
- **When** piper, ffmpeg or a voice model is missing
- **Then** the switch is disabled, Setup names what is missing with a copyable Claude prompt and shell, and Re-check enables it once all three are present

A single watchable run can be **narrated aloud**, not only subtitled — so Setup has a **voice-over
switch**. It is **off by default** and **persists in the project's config** (`spec/_config.json`,
like the run pace), so the choice is **per project**, never a global setting. On, a watchable run of
a screen that has a **narration pack** produces a **voiced recording** — piper synthesis muxed at the
beat times (board R10); off, or with no pack or no synthesizer present, the recording is **silent as
before**, never faked. The switch is the only new thing Setup owns here — the voice pipeline lives
with the run and the pack lives with the screen (board R10).

The switch **knows whether it can actually voice**, and says so. Voicing needs three things present
on the machine: `ffmpeg`/`ffprobe`, a synthesizer (`piper` on PATH, or a `BOARD_SYNTH_CMD`), and a
**voice model** (`*.onnx`, looked for in `spec/_voices/` or `BOARD_PIPER_VOICES`). Until all three are
detected the switch is **disabled** — you cannot silently opt into something that can only stay silent
— and Setup shows what is missing plus a one-click way to fix it: a **copyable Claude prompt** (hand
it to the agent and it installs piper and a voice into `spec/_voices/`) and a **copyable shell**
fallback, with a **Re-check** that re-probes without restarting the board. The moment the three are
present the switch enables itself.

*Drafted 2026-08-14 on the human's direction and accepted the same turn: voice-over was asked for as
a saved, per-project toggle, default off. The pipeline (pace → render, piper → ffmpeg) already
existed for the CLI; this makes the board's own watchable run drive it.*

*Amended 2026-08-15 on the human's direction: the switch auto-detects its prerequisites and is
disabled until piper, ffmpeg and a voice model are all present, with a copyable install helper (Claude
prompt + shell) and a re-check — so "off because you chose to" is never confused with "off because it
cannot run yet".*

### 2 · The inventory crawl

## R2 — An existing app is inventoried into rows: visited, screenshotted, nothing faked

- **Given** an existing app being inventoried by the crawl
- **When** the crawl visits a route
- **Then** it becomes a row with its screenshot (crawl.png) and no PRD — honestly ungoverned, never fake coverage

Each route becomes a row: visited and screenshotted (`crawl.png`), with **no PRD** — visibly,
honestly ungoverned. The board shows the whole app on day one as a map of what is not yet covered,
never as fake coverage.

*Corrected 2026-07-31 (the human's call): this said each route was "given a draft PRD read from what
is actually on the page", and the crawl went on to auto-author characterization tests. That drafting
was removed: a guessed requirement records the implementation's bugs as intent, and a shallow
auto-test is a false green that makes the board look finished while proving nothing. Depth is a
per-screen, human-sponsored **kg-deep** pass — study, golden fixture, a drafted PRD for the human's
gate, then a few comprehensive proving flows — run one screen at a time, most important first.*

## R4 — An empty project is the same flow with nothing found

- **Given** a crawl that found no routes
- **When** you open Setup
- **Then** no rows show, and a prompt to write the first PRD appears

No routes, no rows, and a prompt to write the first PRD. Greenfield is the zero case of the
crawl, not a separate mode with separate code.

## R5 — Rerunning finds new screens without touching settled ones

- **Given** routes already on the board, with their PRDs and pins
- **When** you rerun the crawl
- **Then** a new route is marked new, and a settled route keeps its PRD and reads as already on the board

Routes already on the board keep their PRD, their approvals and their pins.

### 3 · From row to requirement

## R3 — A drafted PRD is a requirement immediately, not a guess awaiting acceptance

- **Given** a PRD drafted on the human's behalf
- **When** the board builds
- **Then** the screen is one ordinary card with its requirement titles — no guess chip, nothing waiting, no gate; its tests alone decide Untested

A PRD drafted on the human's behalf (a kg-deep pass's draft) is a requirement like any other the
instant it exists: specboard drafts it as an ordinary starting point, and the human edits or removes
it freely, exactly as they would a PRD they typed themselves. A screen with no test yet simply reads
Untested — that is the tests' business (board R4), not a person's.

*Corrected 2026-07-27: this said "the draft and screen cells stay unapproved so the loop starts at
gate A." That was the greenfield-only model — a screen with no wireframe has no gate A and no gate B.
Corrected again 2026-07-31: the draft's SOURCE changed — the crawl no longer drafts PRDs (see R2), so
a drafted requirement now comes from a kg-deep pass.*

*Amended 2026-08-17 (the human's decision): the guess flag / acceptance is removed. A drafted PRD is
canon immediately and edited/removed like any requirement — there is no draft state and nothing waits
on a person to accept it.*
