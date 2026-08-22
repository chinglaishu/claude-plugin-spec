---
screen: board
area: Core
title: Board
route: /
---

*specboard's job is the one thing only it does — **requirements are the source of truth, and tests
prove them against the real app** at assertion granularity, with drift computed. The board is two
columns: the requirements, and the tests that prove them. There is **no wireframe** (R7) and **no
acceptance gate** (R8) — a requirement is canon the moment it is written, and its state is read off
its tests, never typed (R4 — Passed / Failed / Untested / Not reached since 2026-08-17). (History: an
earlier four-column, wireframe-first board with two human gates
was narrowed here across 2026-07-29/30 — the wireframe left the tool, and the last gate was removed as
a rubber-stamp. The per-requirement "Narrowed …" notes below record each step.)*

## R1 — One card per screen, not a row of cells

- **Given** a board of screens, each with its requirements and a latest test recording
- **When** you open the board's home
- **Then** exactly one card per screen appears — its name, its requirement titles and the recording's cover frame — and no requirement gets a row of its own

Every screen is one card: its name, its requirement **titles**, and the latest test **recording**
(its cover frame as the still). Requirements are never their own rows; the card is titles, and each
title's description lives one click away in the detail. There is no PRD / draft / screen / E2E column
strip — that grid mostly repeated what the two ends already said.

## R2 — A requirement and the tests that prove it are read side by side, each scrolling on its own

- **Given** a requirement and its proof shown together
- **When** you scroll the proof
- **Then** the reading stays still, and neither region scrolls the page

Wherever a requirement is opened, its **reading and its proof are shown together and scroll
independently** — scrolling the proof never moves the reading, and neither scrolls the page; the
headers stay pinned. And what sits beside the reading is the **proof itself** — the covering test's
own controls, frames and recording — never a wireframe or a built-screen mock-up: the wireframe is
not a specboard artifact at all (R7), and a test's evidence (recording, screenshot) lives inside the
test (R3, R10). This is the durable shape the detail must keep; the particular **views that deliver
it belong to R13** (Focus is the reader where it lives today).

*Reworked 2026-08-19 (the human): R2 is the view-agnostic **principle** now — proof beside the
reading, each scrolling on its own, no wireframe region — kept deliberately separate from R13, which
owns the particular views (Focus / Grid / Flow) that embody it. It previously described a dedicated
two-column "Columns" view, retired when Grid and Flow replaced it (R13); the earlier note asked
whether to fold R2 into R13, and the human chose to keep it as the standalone principle.*

## R3 — A requirement is a title that expands; a test is a title, a recording, and its tags

- **Given** a requirement showing only its title
- **When** you open it
- **Then** its full, formatted description unfolds — a List row opens into the Focus body in place

A requirement shows only its **title** until it is opened, then its full description — real
requirements are long and formatted (headings, lists, `code`, author notes), so the collapse is what
keeps them scannable: in **List** a requirement is a title row, and opening it unfolds the **Focus
body in place** — the same reader, embedded, not a navigation. A test leads with a **prominent, descriptive title**
of the flow it runs — its own name, so it says what the test is *for* — then its latest **recording**
(cover frame as the still, played on click), then the requirement ids it covers. The old worry, a
test title just repeating a requirement's, is gone: under many-to-many a test covers several
requirements, so its title names the *flow* and the tags carry the requirement link.

Everything carries a **reading hierarchy**, never bare title rows: a header wears a quiet purpose
hint; a requirement row shows a one-line **excerpt** of its body under the title (hidden once the row
is open — the full text follows); a test row shows a quiet **meta line** under its title — what it
proved, its step count and duration, and on a failure **the failing beat in human words**, readable
without opening anything.

*Amended 2026-08-03 at the human's direction: the detail page read as bare title rows — the lists
needed the title / sub-line / hint layer this adds to be scannable.*

*Reworded 2026-08-19 (the human): retired the "Left column / Right column" framing — the Columns view
is gone (R13). The anatomy is unchanged (a requirement is a title that expands to its full text; a
test leads with its flow name, then recording, then tags; both with a reading hierarchy) and now
reads in Grid rows and the Focus reader, which the tests assert.*

*Reworded 2026-08-22 (the human): Grid→List, hands-to→in-place, with the frozen mockup.*

## R4 — Requirement state is computed and assertion-backed

- **Given** a requirement whose state is computed from the tests that tag it, never typed
- **When** a tagging test passes on an assertion that would fail without the requirement
- **Then** it reads Passed, and the home card's "N / M proven" count equals the Passed rows in its detail
- **When** one tagging test fails while another passes
- **Then** it reads Failed — fail wins, a real failure is never masked by a second green
- **When** no test tags it, a flow stops before its assertion, or its text moves past its last proof
- **Then** it reads Untested, Not reached or Changed — none of them green

Each requirement reads one of **five words**, computed from the tests, never typed: **Passed** — a
test that tags this requirement passed *on an assertion that would fail without it*; **Failed** — a
test that tags it ran its assertion and it did not hold (**fail wins**: a requirement covered by one
failing and one passing test still reads Failed, so a real failure is never masked by a second green);
**Not reached** — a flow declared it would cover this requirement (`coverReqs`) but stopped before its
assertion ran; **Untested** — no test tags it at all; **Changed** — a test proved it before, but the
requirement's *text has moved since that proof*, so what was verified is no longer what it says and it
must be **re-verified**. The proof is pinned to a content hash of the wording it ran against (dated
author-notes aside); when the text drifts past that pin the requirement reads Changed rather than a
stale green. Changed is a **modifier on Passed** — a Failed, Not-reached or Untested requirement keeps
that word. "0 of 0 passing" reads green nowhere in this vocabulary — Not reached and Untested are both
honestly ungreen, never conflated with a pass.

*Narrowed 2026-07-30: this requirement previously carried a third **reworded** state tied to an
acceptance gate (R8). The gate was removed (see R8), so there is no "changed since accepted" — a
requirement is simply proven by a current test or it is not.*

*Amended 2026-08-17 (the human's decision): the binary proven/unproven becomes Passed / Failed /
Untested / Not reached — the same computed-from-tests state, named for what a reader needs.*

*Amended 2026-08-19 (the human's decision): a fifth word, **Changed**, returns — but computed, not
gated. The old "changed since accepted" above was tied to the removed acceptance gate; this one is
tied to nothing a person types — a content hash of the requirement text captured at its last passing
proof, compared to the current text. Editing a requirement's meaning after it was proven flips it to
Changed (re-verify); adding a dated provenance note does not. It claims the **藍 indigo** long reserved
for a status of its own.*

## R5 — Requirements and tests are many-to-many, by tag

- **Given** a test that tags the requirement ids it covers — qualified (asset-plan:R5) when the requirement is another screen's
- **When** you open a requirement
- **Then** its proof line shows every test that tags it, resolved by tag, wherever that test's file lives

One test can prove several requirements; one requirement can be proven by several tests. The link
lives in the **test**, which tags the requirement ids it covers — qualified (e.g. `asset-plan:R5`),
so a flow can cover another screen's requirement. A flow's file lives in the screen it **starts** on;
coverage is by tag, so a requirement lists every test that covers it, wherever that file lives.

## R6 — Two kinds of test, unit and flow — never long-and-shallow

- **Given** a screen's proof in two kinds — a unit test of one screen or component, a flow test crossing screens along a chosen path
- **When** a test of either kind tags several requirements
- **Then** each tagged requirement is proven only by an assertion that would fail without it, and a requirement no test tags stays Untested — a test merely existing buys no green

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

- **Given** a screen documented by its requirements and the tests that prove them
- **When** you open its detail
- **Then** no design chip, no design link and no embedded wireframe exist anywhere in it — requirements and proof only

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

- **Given** a requirement written in prd.md — canon the moment it is written
- **When** you open its screen's detail
- **Then** it reads straight from the header into the Focus reader — no gate bar, no accept button, nothing waiting to be accepted

There is **no gate**. A requirement is the source of truth the moment you write it — editing the PRD
*is* the change, and the assertion-backed tests prove it against the real app automatically (R4), with
no status field and no rubber-stamp. Nothing on the board waits on a human to "accept" a requirement
it would have accepted anyway.

*Narrowed 2026-07-30: this requirement previously described one human gate — accepting the
requirements. The human removed it: a decision that is always yes is ceremony, not a gate. Requirement
state is now just proven / unproven; the "does the build match the intended design?" question moves to
a separate, interactive wireframe check (planned), not a gate.*

## R9 — Search across requirement text, grouped into areas

- **Given** screens grouped into named areas
- **When** you search a term
- **Then** only cards matching a name, route, or requirement stay, and a group with no match hides

Search matches screen names, routes and the text of every requirement; a group with no matching card
hides itself rather than sitting empty. Screens are grouped into named areas, in a declared order,
never paginated — a board you page through can no longer answer "what is the state of everything".

## R10 — A test opens to its full evidence, and can be run — watchably or in the background

- **Given** a test with numbered story steps, its run records, and Run / Run in background wherever it is shown
- **When** you open the test
- **Then** its numbered story steps show from its definition — before any run — each wearing the run's passed / failed / not-reached mark
- **When** a step asserts a value while the run records
- **Then** the topbar burned into the recording names the requirement and shows the check as expected and got — red on a failure, the asserted value scrolled into view
- **When** you pick Logs from the ⋯ menu
- **Then** the whole run log opens in a floating window, not a full-screen scrim

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

- **Given** the guide at #howitworks
- **When** you open it
- **Then** two acts tell the same three moments — assigning work, reviewing it, two weeks later — first without the tool ("Done, boss!", a wall of code, the same bug back) then with it, every step a drawn scene
- **When** you click
- **Then** the walkthrough steps forward one scene and holds — it never advances on its own

#howitworks opens on two situations with the SAME three moments — assigning work, reviewing it, two
weeks later. Without the tool: the task lives in a chat scroll ("Done, boss!"), review is a wall of
code you approve blindly, and the same bug returns — closing on a green assertion shown beside the
screen it fails to prove. With the tool: the task is a written requirement, canon the instant it
exists, the work arrives as a recording where every asserted number is visible, and the moment a proof
stops holding the requirement flips to unproven — proven is computed from the tests, never stored. Then
the walkthrough shows it working for real (a labelled illustration asserting exact golden values held on
screen) and ends on this project's own derived next action. Click-to-advance; the mirror is the
argument; the proof is demonstrated, never described.

*Drafted 2026-08-05 transcribing design revision 3 (the manager/staff rebuild) — wording awaits the
human; reword freely, the test asserts content not phrasing.*

*Amended 2026-08-17 (the human's decision): dropped "whose meaning you confirm" — there is no guess
flag or confirmation step left anywhere on the board. A written requirement is canon the moment it
exists, full stop.*

## R12 — The guide ends with the one next action, derived not stored

- **Given** the walkthrough's last act, with no step rail and no checklist anywhere on home
- **When** the last act renders
- **Then** it closes on one next action derived from the tree on this build — for example /kg-deep <screen> — and when everything derivable already holds, the CTA says so

The walkthrough closes on a single next action for this project, derived from the tree on each build
(config saved, rows exist, a prd.md drafted, a requirement proven) — the same `journey()` derivation,
with no five-step rail and nothing stored. A returning user opens the guide and sees their next
concrete step (for example `/kg-deep <screen>`); when everything derivable is done, the CTA says so.
There is no home-screen checklist.

*Drafted 2026-08-05 transcribing the approved onboarding walkthrough (design revision 2) — the earlier
six-step rail was cut at the human's direction; wording awaits the human, the test asserts behaviour.*

*Amended 2026-08-17 (the human's decision): the rail's "confirm the draft" step (a prd.md without
`guess`) is gone along with the guess flag it tracked — the derivation is five steps now, not six.*

## R13 — Three views of a screen's requirements: Focus, List, Flow

- **Given** a screen's requirements
- **When** you toggle Focus / List / Flow
- **Then** the same requirements render in that view, storing nothing new

The detail header carries a toggle — **Focus / List / Flow**. **Focus** (the default) reads one
requirement at a time: the **behavior block leads** on the left (one Given, its When→Then beats),
the prose collapsed beneath it, the **drawn schematic** below (loop · stills; quiet grey when
stale); the proof sits on the right — Run + ⋯ header, proof line, then media whose **default
derives from status × beat count** (frame pair · per-beat filmstrip · red frame with
expected-vs-actual · pinned-era watermark · none) under a **stills · gif · video** toolbar that is
a client-side preference, never stored; an untested requirement reads "no proof yet · ＋ write the
failing test". **List** is one collapsed row per requirement (state · id · title · beat count ·
test kind) with a gap-summary strip above; **an open row is the Focus body itself**, in place.
**Flow** plays the authored flows: the one recording cut at proves-steps, **one chapter-thumbnail
rail as the scrubber** (click a chapter to seek, click its gif to zoom); a failing chapter wears
red and everything after reads not-reached; **＋ New flow opens the composer** (R15 family). Flow
reads like Focus: **the chapter rail on the left and the player on the right, each scrolling on
its own** (R2's principle) *(added by the human 2026-08-21)*. All three views derive; none stores.

*Drafted 2026-08-11 ("provide a less-text version — one requirement per page"); enriched 2026-08-13 to
carry the whole single-test detail; reshaped 2026-08-13 on the human's direction to two containers
(read left / verify right, the screenshots a larger horizontal strip) and a Focus/List/Columns toggle
that replaces the old in-reader Columns button. Reworked again 2026-08-13 on the human's direction:
**Focus is now the default view**, the id + state fold into the reading card (no full-width bar), the
evidence controls collapse to Run + a ⋯ menu, and the proof-frame label is dropped. Wording follows
the human's spoken decisions; the tests assert the behaviour.*

*Reworked 2026-08-18 (the human): the three views are Focus / Grid / Flow — Grid replaced the compact
List, Flow replaced the Columns view; the text follows the human's logged decision, the tests assert
the behaviour.*

*Reworded 2026-08-21 (the human): Grid became List — a list of Focus — and the views took the frozen
visual-requirements mockup as their contract.*

## R14 — The proof is scannable as frames, not only as video

- **Given** a run whose recording holds several checked values
- **When** you open the requirement's proof as stills
- **Then** one frame per checked value shows in order, cut from the recording at the instant it fired, each carrying its burned-in topbar and got-vs-expected — a failing value red
- **When** a run captured no recording
- **Then** no strip shows at all — never a separately captured picture

A reviewer shouldn't have to play a video to check a proven value. Where a run captured a recording,
its **proof frames** are surfaced too — **one still per checked value**, taken from the recording at
the instant that check fired (indexed by the run's own beat log), each carrying the same
self-narrating topbar it burned in (the requirement, the got-vs-expected, red on a failure) and the
ring on the exact value asserted. They show as the media pane's **stills** — the default for a
multi-beat pass and one toolbar click away otherwise — in the test's evidence and the focus card; so
a person verifies the asserted values by eye, in order, without pressing play; the
**video is reserved for what a still can't show** — motion, a sequence, a dense flow. Because the
frames are frames *of* the recording, they can never disagree with it: a run with no video simply has
no strip, never a faked or separately-captured one.

*Drafted 2026-08-12 on the human's direction and accepted the same turn: the recording is fast to
trust but slow to scan, so its key moments are pulled out as stills for eye-verification, with the
video kept for what a picture cannot carry. It amends R10's "no separate screenshot column" — the
frames are the recording indexed, not a second capture, so the one-artifact rule still holds.*

*Reworded 2026-08-22 (the human): the strip is the media pane's stills view — one surface, not two.*

## R15 — The board hands you a prompt; it never writes a requirement or a test itself

- **Given** a requirement or a test
- **When** you pick an action from its ⋯ menu
- **Then** a ready Claude prompt opens and is copied — the board writes no file

You are staff and the human owns meaning, so the board proposes work but never authors it. Every
requirement and every test carries a **⋯ menu** whose actions change no file: a requirement's menu
offers **reword · add a requirement · remove this requirement · add a test to cover it**; a test's
menu offers **add · edit · remove a test** (unit or flow), with a **picker for the requirements it
should cover**. Adding a test is reachable from a requirement even when nothing yet tags it — the
requirement that most needs a test is the one with none. Each action
opens a **ready prompt for Claude** — pre-loaded with the screen, the exact file
(`spec/<screen>/prd.md` or `spec/<screen>/test.spec.ts`), the requirement or test in question, and
the discipline that governs the change (**write the failing test first, tag the requirement with
`checkReq`, assert something that would fail without it, keep every asserted value visible in the
recording, and never weaken a test to go green**) — and copies it to the clipboard. You run it, read
the diff, and keep the words yours. There is no in-board editor and no silent write: the board states
the rule and hands off the work; a person, not the board, commits the meaning.

*Drafted 2026-08-18 (formalizing the human's 2026-08-17 "test-authoring is prompt-handoff" decision):
the board never writes or edits a requirement or a test — every add/edit/remove hands the human a
ready Claude prompt carrying the file, the target and the kg-e2e discipline, and copies it. Wording
awaits the human; the meaning is theirs, the tests assert the behaviour.*

*Amended 2026-08-22 (the human): "never writes a requirement or a test itself" applies to the ⋯
handoffs — scan, rewrite, and the composer's Claude path. The deterministic compose emit is the
**one** sanctioned write: `＋ Add test` composes `spec/<start>/test.spec.ts` directly, and only
from beats that already carry their own red-first proof (the D4 amendment of 2026-08-21,
CLAUDE.md rule 1's addendum). The board still writes no requirement, ever.*

*Amended 2026-08-19 (the human): **add a test** is reachable from the requirement ⋯ too, not only
from a test's menu — otherwise an Untested requirement, the one that most needs a test, has no test
menu to ask from. Opening it from a requirement pre-picks that requirement in the cover set.*

## R16 — Home leads with what the board does

- **Given** the board's home with no dismissal preference set
- **When** it renders
- **Then** a feature strip of six cards sits above the areas, each opening the live example of itself on this board

The six cards: **beats** · **proof from real runs** · **computed drift** · **the three views** ·
**compose a flow** · **honest gaps** — each a link into the live example on this board (a
requirement with beats, a proven requirement's media, a failed/changed requirement, the List view,
the composer, an untested requirement). A dismiss control hides the strip; the dismissal is a
**client-side preference, never stored in the tree**, and where no preference exists the strip
renders again.

*Added 2026-08-21 (the human) with the frozen mockup — onboarding chrome, dismissible, derives
everything and stores nothing.*
