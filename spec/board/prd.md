---
screen: board
area: Core
title: Board
route: /
---

*Redesigned 2026-07-29 (proposed — awaiting the human's gate): specboard's job narrows to the one
thing only it does — **requirements are the source of truth, tests prove them against the real app,
and drift is computed**. The wireframe leaves the tool entirely (it was a different, already-solved
job); with it go gate B, the draft column, the redraft agent and the crawl's draft phase. The
four-column grid (PRD · draft · screen · E2E) becomes two columns (requirements ↔ the tests that
prove them), and the two human gates become **one** (accept the requirements). Old R1–R9 described
the four-column, wireframe-first board; these describe the two-column, requirements↔proof one.*

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

## R4 — Requirement state is computed and assertion-backed

Each requirement is proven, reworded (stale), or unproven — computed from stored approval hashes
against current content, never typed. **Proven** means: a test that tags this requirement passed *on
an assertion that would fail without it*. A long or cross-screen flow records pass / fail /
**not-reached** per requirement, so a flow that stops early leaves the requirements it never reached
honestly unproven — not green, and not red. "0 of 0 passing" reads green; not-reached must not.

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

## R8 — One human gate: accept the requirements

The single human decision is: *are these requirements what I meant?* Accepting a screen's
requirements is the one gate. There is no "did you build it right?" gate — that question is answered
by the assertion-backed tests running against the real app (R4), automatically, with no status field
and no human compare. Requirements changed since they were accepted read as needing re-acceptance;
that is the only thing waiting on a person.

## R9 — Search across requirement text, grouped into areas

Search matches screen names, routes and the text of every requirement; a group with no matching card
hides itself rather than sitting empty. Screens are grouped into named areas, in a declared order,
never paginated — a board you page through can no longer answer "what is the state of everything".

## R10 — A test opens to its full evidence, and can be run or watched

A test row is not just a verdict. It opens to: its **steps**, each carrying its own pass / fail /
not-reached mark, in a list that **scrolls** so fifty steps read as clearly as five; the **whole run
log** — the complete process output for that run, including globalSetup / seed output and the
untruncated tail, not only that case's bounded stdout (the per-case log alone was the gap that read as
"it doesn't show the whole log"); and a record **per run**, each keeping its own **recording** (its
cover the last asserted frame — the end state it proved, not the blank first frame), the time, the
duration, the commit and the verdict. A still screenshot is kept only as the fallback cover when a run
has no video (a headless CLI run, or the recording was pruned) — the recording is the primary
artifact, so there is no separate screenshot column. Every test can be **Run** (headless — nothing to
watch, it just goes) or **Watched** (a real browser opens and drives the app in front of you). Run and
Watch stay wherever a test is shown.
