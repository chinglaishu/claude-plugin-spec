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

The **Columns** view of a screen is two columns: the requirements on the left, the E2E tests that
prove them on the right. *(It is no longer what a screen opens on — Focus is the default now, R13; the
human, 2026-08-13. Columns is one of the three views, a click away on the header toggle.)* **Each
column scrolls independently** — scrolling the tests never moves the requirements, and neither scrolls
the page; both headers stay pinned. There is no wireframe column and no
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
what it proved, its step count and duration, and on a failure **the failing beat in human words**,
readable without opening anything.

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

## R6 — Two kinds of test, unit and flow — never long-and-shallow

A screen's proof comes in two kinds, both first-class. A **unit** test proves one screen — or one
component on it — displaying right and acting right in each state that matters. A **flow** test
crosses screens along a chosen path (edit on Asset Plan → assert the value → open Tenancy Schedule
→ assert it reflects, with the right number) and reads as the units it connects. Neither kind may
be a shallow walk that touches everything and proves nothing: a test may tag many requirements, but
each still needs an assertion that would fail without it (R4) — so neither kind can buy itself a
false green.

*Amended 2026-08-17 at the human's direction: this previously read "few comprehensive tests" — one
flow proving several requirements was the whole aim. The unit/flow split supersedes it:
comprehensiveness now lives in a unit test's coverage of its own screen, and flows prove the
connections between screens. The guard survives unchanged — coverage is bought by a tag plus an
assertion, never by a test merely existing.*

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

## R10 — A test opens to its full evidence, and can be run — watchably or in the background

A test row is not just a verdict. It opens to: the flow's **numbered story steps** — the author's
own sentences of what a user does and what should happen ("Edit the draft — change Unit 01-02 Net
Rent from 40,000 to 60,000"), each wearing its own pass/fail mark, and each **expanding on click to
its recorded detail**: the got-vs-expected value notes the test announced while it ran, and the
requirements that step proved. **These steps are read from the test's definition, not from the last
run** — the full list shows the moment you open a test, before it has ever run, so you can see what
it will do without trusting a green. A run overlays each step's outcome: **passed / failed /
not-reached**. A flow **runs through every step even after one fails** — it records each failure and
carries on rather than aborting at the first — so the board shows **every** part that broke (the
meta line counts them: "✕ 3 steps failed — …"), not just the first, and the recording reaches the
later steps (the ones that scroll a table into view). The test still fails; not-reached is reserved
for a step a non-flow abort genuinely never got to. A test with no story steps (only `proves` tags) falls back to one row
per requirement, rendered by **the requirement's own title**, never the bare id — nobody should have
to cross-reference "R5" to know what was proven. Setup plumbing is **not shown inline at all**. The
**complete raw record** — setup, every action and check with its mark, and the trimmed-at-cap note —
lives one click behind a **"Steps" window** (a floating popup, like the run log). A **failed step
names itself** in those same human words — marked inline, its detail open, and named on the test's
meta line (R3) — so the failure is visible without digging; the **whole run log** — the complete process output for that run, including globalSetup / seed output and the
untruncated tail, not only that case's bounded stdout (the per-case log alone was the gap that read as
"it doesn't show the whole log"); and a record **per run**, each keeping its own **recording** (its
cover the last asserted frame — the end state it proved, not the blank first frame), the time, the
duration, the commit and the verdict. A still is kept as the fallback cover when a run has no video (a
headless CLI run, or the recording was pruned). The recording stays the primary artifact and narrates
itself — and where it exists, its key moments are also surfaced as scannable **proof frames (R14)**.
Those frames are frames *of* the recording, never an independent capture, so there is still no second,
disagreeing screenshot source — only the one recording, read two ways: played, or scanned. The
recording **narrates itself from inside the
video**: while a run executes, the harness paints a **topbar into the page under test** — burned into
the recording and its cover, not overlaid by the board. The bar is **large enough to read at a
glance** — a bold title line naming the current story step (or the requirement being proven, id and
title), and beneath it the current check as **one clear claim**: its label, then its **expected and
got as two values** (not a dense stacked list — the full got-vs-expected of every check is recorded
as the test's step evidence instead). On a failing check the got reddens and the bar turns red and
names it, so the video alone explains what was being tested and which part failed. One consistent
topbar, always in the
same place — never a floating caption card in the middle of the frame. The recording is captured at
the **app's real size** (not a shrunken thumbnail), and a step that asserts on a value **scrolls
that value into view and holds** before asserting, so the frame actually shows what is being proven
rather than asking you to trust the topbar. A **failing run keeps its recording too** — the video is
the best evidence of a failure, so it is never dropped just because the test went red. Every test can
be **Run** (a real browser opens and drives the app in front of you — the watchable run) or **Run in
background** (headless — nothing to watch, it just goes). *(Renamed from Run / Watch — the human,
2026-08-13: "Run" is now the watchable one, and the headless one says what it is. "Run all" in the
detail header stays a background run — running the whole suite watchably is rarely what you want.)*
Both stay wherever a test is shown; in the **Focus** reader (R13), Run is always shown in the proof
header and Run in background folds into a **⋯ menu** with Logs and Steps.

The self-narrating topbar can also be **spoken aloud**. When voice-over is on (a Setup switch, init
R6 — **off by default, saved per project**) and the running screen has a **narration pack**
(`spec/<screen>/narration.json`, authored once with pass *and* fail lines), a single watchable run is
**paced to the narration** and its recording is **voiced**: piper synthesizes each line and it is
muxed at the beat times, the same words shown as subtitles — and the player then plays that **voiced
recording** in place of the silent one. With no pack, no voice-over, or no synthesizer present, the
recording stays **silent** — the voice is never faked (rule 3), and a screen with no pack simply
plays silent.

*Amended 2026-08-14 at the human's direction: the recording can be VOICED, not only subtitled. A
per-project Setup switch (init R6, off by default) turns it on; a single watchable run of a screen
that has a narration pack is paced to its lines and piper's synthesis is muxed onto the recording at
the beat times, and the player plays the voiced file. No pack or no synthesizer ⇒ silent, never
faked.*

*Amended 2026-08-03 at the human's direction, four times. First: a flat "80 steps" fold was
unreadable and a silent recording cannot explain a failure. Second: "proves R5" still meant nothing
without cross-referencing R5, the setup beat was repeated noise, and the narration belongs INSIDE
the video — one persistent topbar replacing both the board-side playback overlay and the centred
caption card an earlier agent painted mid-frame. Third: requirement titles alone still read as a
checklist, not a story — the inline view became the flow's numbered steps in user language with the
golden values one click away, and the topbar grew to a designed, glanceable two-line card. Fourth:
the steps must be read from the test's definition so the full plan shows before a run and a failure
never hides the rest; the recording must be full-size, must scroll the asserted value into view, and
must survive a failure. Fifth: a flow must run through ALL its steps and show EVERY failure (a
person could not tell what broke when it died at the first), and the failure must be loud — the
recording's cover frame is a red summary naming the failed steps, and the meta line counts them.*

## R11 — The guide is the manager's story: without the tool, then with it

#howitworks opens on two situations with the SAME three moments — assigning work, reviewing it, two
weeks later. Without the tool: the task lives in a chat scroll ("Done, boss!"), review is a wall of
code you approve blindly, and the same bug returns — closing on a green assertion shown beside the
screen it fails to prove. With the tool: the task is a written requirement whose meaning you confirm,
the work arrives as a recording where every asserted number is visible, and the moment a proof stops
holding the requirement flips to unproven — proven is computed from the tests, never stored. Then the
walkthrough shows it working for real (a labelled illustration asserting exact golden values held on
screen) and ends on this project's own derived next action. Click-to-advance; the mirror is the
argument; the proof is demonstrated, never described.

*Drafted 2026-08-05 transcribing design revision 3 (the manager/staff rebuild) — wording awaits the
human; reword freely, the test asserts content not phrasing.*

## R12 — The guide ends with the one next action, derived not stored

The walkthrough closes on a single next action for this project, derived from the tree on each build
(config saved, rows exist, a prd.md drafted, a prd.md without `guess`, a requirement proven) — the same
`journey()` derivation, with no six-step rail and nothing stored. A returning user opens the guide and
sees their next concrete step (for example `/kg-deep <screen>`); when everything derivable is done, the
CTA says so. There is no home-screen checklist.

*Drafted 2026-08-05 transcribing the approved onboarding walkthrough (design revision 2) — the earlier
six-step rail was cut at the human's direction; wording awaits the human, the test asserts behaviour.*

## R13 — Three views of a screen's requirements: Focus, List, Columns

The detail header carries a **three-way toggle — Focus / List / Columns** — three views of the same
requirements, storing nothing new. **Focus** is the default a screen opens on *(the human, 2026-08-13
— was Columns)*. **Columns** is the two-column view (R2). **List** is a compact index — one line per
requirement (state · id · title) — to scan and jump into Focus from. **Focus** reads **one requirement
at a time**, laid out as **two containers**: the *reading* on the left (its id and state on a meta line
above the title, then the full description, and the flow step by step with this requirement's step
highlighted) and the *evidence* on the right — a **proof header** whose top row carries the label and
the actions (**Run** always shown, and a **⋯ menu** holding **Run in background · Logs · Steps**),
then the proof line (which flow proves it and its verdict, with the commit that result ran against),
the scannable **proof-frame strip** (no label — the stills speak for themselves, the human 2026-08-13),
and the recording. A pager (prev · dots · next) moves between requirements; the toggle switches views —
**there is no in-reader Columns button**, because the toggle already is one. The header's Run all,
toggle and Close are one control family — same height, same pill radius.

The evidence is not a link to the columns but the covering test's **own row, moved in** — its controls,
its frame strip and its recording are the very wired nodes the columns show (its steps are shown on the
left as a display clone, the moved node keeping the wired original), relocated and relocated back so the
two columns are left whole. So the reader duplicates no player, and a requirement nothing tags reads
honestly unproven rather than borrowing a green.

*Drafted 2026-08-11 ("provide a less-text version — one requirement per page"); enriched 2026-08-13 to
carry the whole single-test detail; reshaped 2026-08-13 on the human's direction to two containers
(read left / verify right, the screenshots a larger horizontal strip) and a Focus/List/Columns toggle
that replaces the old in-reader Columns button. Reworked again 2026-08-13 on the human's direction:
**Focus is now the default view**, the id + state fold into the reading card (no full-width bar), the
evidence controls collapse to Run + a ⋯ menu, and the proof-frame label is dropped. Wording follows
the human's spoken decisions; the tests assert the behaviour.*

## R14 — The proof is scannable as frames, not only as video

A reviewer shouldn't have to play a video to check a proven value. Where a run captured a recording,
its **proof frames** are surfaced too — **one still per checked value**, taken from the recording at
the instant that check fired (indexed by the run's own beat log), each carrying the same
self-narrating topbar it burned in (the requirement, the got-vs-expected, red on a failure) and the
ring on the exact value asserted. They show as a **scannable strip** — in the test's evidence and in
the focus card — so a person verifies the asserted values by eye, in order, without pressing play; the
**video is reserved for what a still can't show** — motion, a sequence, a dense flow. Because the
frames are frames *of* the recording, they can never disagree with it: a run with no video simply has
no strip, never a faked or separately-captured one.

*Drafted 2026-08-12 on the human's direction and accepted the same turn: the recording is fast to
trust but slow to scan, so its key moments are pulled out as stills for eye-verification, with the
video kept for what a picture cannot carry. It amends R10's "no separate screenshot column" — the
frames are the recording indexed, not a second capture, so the one-artifact rule still holds.*
