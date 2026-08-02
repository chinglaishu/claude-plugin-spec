---
screen: board
area: Core
title: Board
route: /
---

*specboard's job is the one thing only it does — **requirements are the source of truth, and tests
prove them against the real app** at assertion granularity, with drift computed. The board is two
columns: the requirements, and the tests that prove them. There is **no wireframe** (R7) and **no
acceptance gate** (R8) — a requirement is canon the moment it is written, and it reads simply proven
or unproven by its tests. (History: an earlier four-column, wireframe-first board with two human gates
was narrowed here across 2026-07-29/30 — the wireframe left the tool, and the last gate was removed as
a rubber-stamp. The per-requirement "Narrowed …" notes below record each step.)*

## R1 — One card per screen, not a row of cells

Every screen is one card: its name, its requirement **titles**, and the latest test **recording**
(its cover frame as the still). Requirements are never their own rows; the card is titles, and each
title's description lives one click away in the detail. There is no PRD / draft / screen / E2E column
strip — that grid mostly repeated what the two ends already said.

## R2 — The detail is two columns, each scrolling on its own

Opening a screen shows two columns: the requirements on the left, the E2E tests that prove them on
the right. **Each column scrolls independently** — scrolling the tests never moves the requirements,
and neither scrolls the page; both headers stay pinned. There is no wireframe column and no
built-screen column: the wireframe is not a specboard artifact at all (R7), and a test's evidence
(recording, screenshot) lives inside the test (R3, R10).

## R3 — A requirement is a title that expands; a test is a title, a recording, and its tags

Left column: each requirement shows only its title until clicked, then its full description — real
requirements are long and formatted (headings, lists, `code`, author notes), so the collapse is what
keeps the column readable. Right column: each test leads with a **prominent, descriptive title** of
the flow it runs — its own name, so it says what the test is *for* — then its latest **recording**
(cover frame as the still, played on click), then the requirement ids it covers. The old worry, a
test title just repeating a requirement's, is gone: under many-to-many a test covers several
requirements, so its title names the *flow* and the tags carry the requirement link.

Both lists carry a **reading hierarchy**, never bare title rows: each pane's header wears a quiet
purpose hint; a requirement row shows a one-line **excerpt** of its body under the title (hidden once
the row is open — the full text follows); a test row shows a quiet **meta line** under its title —
its beats, step count and duration, and on a failure **the name of the beat that failed**, readable
without opening anything.

*Amended 2026-08-03 at the human's direction: the detail page read as bare title rows — the lists
needed the title / sub-line / hint layer this adds to be scannable.*

## R4 — Requirement state is computed and assertion-backed

Each requirement is **proven** or **unproven** — computed from the tests, never typed. **Proven** means:
a test that tags this requirement passed *on an assertion that would fail without it*. A long or
cross-screen flow records pass / fail / **not-reached** per requirement, so a flow that stops early
leaves the requirements it never reached honestly unproven — not green, and not red. "0 of 0 passing"
reads green; not-reached must not.

*Narrowed 2026-07-30: this requirement previously carried a third **reworded** state tied to an
acceptance gate (R8). The gate was removed (see R8), so there is no "changed since accepted" — a
requirement is simply proven by a current test or it is not.*

## R5 — Requirements and tests are many-to-many, by tag

One test can prove several requirements; one requirement can be proven by several tests. The link
lives in the **test**, which tags the requirement ids it covers — qualified (e.g. `asset-plan:R5`),
so a flow can cover another screen's requirement. A flow's file lives in the screen it **starts** on;
coverage is by tag, so a requirement lists every test that covers it, wherever that file lives.

## R6 — Few comprehensive tests — but never long-and-shallow

The aim is fewer tests each covering more (edit on Asset Plan → assert the value → open Tenancy
Schedule → assert it reflects, with the right number), not one shallow walk that touches everything
and proves nothing. A test may tag many requirements, but each still needs an assertion that would
fail without it (R4) — so "fewer tests" can never buy itself a false green.

## R7 — specboard owns neither the wireframe nor the design

Sketching or designing a screen before it exists is a real job, but a different one, and already well
served elsewhere. specboard tracks requirements and their proof — **nothing else**. It does not render,
link to, gate, or store a wireframe or a design of any kind; there is no design field, no design chip,
no external-artifact affordance anywhere. A screen is documented by its requirements and the tests that
prove them, and a screen with no artifact is not "unstarted" — it is simply defined by what it must do
and whether that is proven.

*Narrowed 2026-07-30: R7 previously carried an optional external `design:` link shown as a chip in the
detail. Removed at the human's direction — a link specboard never renders, gates, or stales is still
one more thing to carry, and the tool is meant to be minimal. The `design:` frontmatter field and the
Design chip are gone.*

## R8 — No acceptance gate: requirements are the source of truth as written

There is **no gate**. A requirement is the source of truth the moment you write it — editing the PRD
*is* the change, and the assertion-backed tests prove it against the real app automatically (R4), with
no status field and no rubber-stamp. Nothing on the board waits on a human to "accept" a requirement
it would have accepted anyway.

*Narrowed 2026-07-30: this requirement previously described one human gate — accepting the
requirements. The human removed it: a decision that is always yes is ceremony, not a gate. Requirement
state is now just proven / unproven; the "does the build match the intended design?" question moves to
a separate, interactive wireframe check (planned), not a gate.*

## R9 — Search across requirement text, grouped into areas

Search matches screen names, routes and the text of every requirement; a group with no matching card
hides itself rather than sitting empty. Screens are grouped into named areas, in a declared order,
never paginated — a board you page through can no longer answer "what is the state of everything".

## R10 — A test opens to its full evidence, and can be run or watched

A test row is not just a verdict. It opens to: its **steps**, grouped under the author's **named
beats** (`test.step` — `proves R5` and friends): each beat is one sentence-row wearing its own pass /
fail mark and folding the fine-grained actions and checks inside it, so eighty steps read as a
handful of sentences, not a flat wall; a **failed beat names itself** — it arrives open to its
failing check, marked, and is named on the test's meta line (R3) so the failure is visible without
digging; a record trimmed at the step cap **says so** rather than ending silently; the **whole run
log** — the complete process output for that run, including globalSetup / seed output and the
untruncated tail, not only that case's bounded stdout (the per-case log alone was the gap that read as
"it doesn't show the whole log"); and a record **per run**, each keeping its own **recording** (its
cover the last asserted frame — the end state it proved, not the blank first frame), the time, the
duration, the commit and the verdict. A still screenshot is kept only as the fallback cover when a run
has no video (a headless CLI run, or the recording was pruned) — the recording is the primary
artifact, so there is no separate screenshot column. While the recording **plays**, a **context bar**
on the player names the beat and action under the playhead — the video explains what it is testing as
it goes — and once the playhead passes the point of failure the bar **pins the failing beat**, so a
red run's video explains which part failed. Every test can be **Run** (headless — nothing to
watch, it just goes) or **Watched** (a real browser opens and drives the app in front of you). Run and
Watch stay wherever a test is shown.

*Amended 2026-08-03 at the human's direction: a flat "80 steps" fold was unreadable, the failure was
invisible until you dug for it, and a recording that never says what it is currently testing cannot
explain a failure.*
