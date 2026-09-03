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

### 1 · The board's shape — one page, every screen

## R1 — One card per screen, not a row of cells

- **Given** a board of screens, each with its requirements and a latest test recording
- **When** you open the board's home
- **Then** exactly one card per screen appears — its name, its requirement titles and the recording's cover frame — and no requirement gets a row of its own

Every screen is one card: its name, its requirement **titles**, and the latest test **recording**
(its cover frame as the still). Requirements are never their own rows; the card is titles, and each
title's description lives one click away in the detail. There is no PRD / draft / screen / E2E column
strip — that grid mostly repeated what the two ends already said.

## R9 — Search across requirement text, grouped into areas

- **Given** screens grouped into named areas
- **When** you search a term
- **Then** only cards matching a name, route, or requirement stay, and a group with no match hides

Search matches screen names, routes and the text of every requirement; a group with no matching card
hides itself rather than sitting empty. Screens are grouped into named areas, in a declared order,
never paginated — a board you page through can no longer answer "what is the state of everything".

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

## R17 — Requirements sub-group within a screen

- **Given** a screen whose prd.md places `###` family headings between its requirements
- **When** the board renders that screen
- **Then** every requirement sits under its family — on the home card, in List, and in the Focus pager — and a jump-map names each family with its requirements, each dot wearing its own derived state as a hue, in the prd's order

A `### <n> · <family> — <gloss>` line groups the requirements that follow it until the next heading; a screen with no headings renders exactly as today, and requirements before the first heading sit first under no family. A family carries no state of its own: its state is its requirements' states, derived and never stored. Families are structure, not meaning — a requirement's id, text and proof are untouched by where it sits.

*Added 2026-08-23 (the human): sub-grouping modelled on the dojostack overlay catalogue's families and jump-map.*
*Amended 2026-08-25 (the human): the jump-map's dots carry each requirement's derived state by HUE alone — the shoulder ✓/✗/◈/○ glyph is dropped for a cleaner, one-row map — with the state's WORD one hover or keyboard-focus away in the dot's title. A human-approved exception to the design system's "hue never alone" for this dense navigation map; the row and card status chips keep their marks unchanged.*

### 2 · Reading a requirement and its proof — the two ends

## R2 — A requirement and the tests that prove it are read side by side, in one card that scrolls inside itself

- **Given** a requirement and its proof read together in one card
- **When** you scroll the card's story
- **Then** it scrolls inside the card, the card's header stays pinned, and the page itself never scrolls

Wherever a requirement is opened, its **reading and its proof are shown together** — and *side by
side* now means **on the row**: every beat of the behaviour lays its drawn schematic, its words and
its own harvested proof across one line, the drawing and the photograph at the same width because
comparing them is the point. The whole thing is **one card**: its story region scrolls **inside**
it, between a pinned header and a pinned footer, and the page never scrolls at all. And what sits
beside the reading is the **proof itself** — the covering test's own controls, frames and recording
— never a wireframe or a built-screen mock-up: the wireframe is not a specboard artifact at all
(R7), and a test's evidence (recording, screenshot) lives inside the test (R3, R10). This is the
durable shape the detail must keep; the particular **views that deliver it belong to R13** (Focus is
the reader where it lives today).

*Reworked 2026-08-19 (the human): R2 is the view-agnostic **principle** now — proof beside the
reading, each scrolling on its own, no wireframe region — kept deliberately separate from R13, which
owns the particular views (Focus / Grid / Flow) that embody it. It previously described a dedicated
two-column "Columns" view, retired when Grid and Flow replaced it (R13); the earlier note asked
whether to fold R2 into R13, and the human chose to keep it as the standalone principle.*

<!-- Reworded 2026-08-28 (the human's storyline redesign, in this session): the reader stopped being
     two containers with two independent scrollbars, so "scrolling the proof never moves the reading"
     described a shape that no longer exists — leaving it would have made this requirement quietly
     false (CLAUDE.md rule 6). The PRINCIPLE is intact and now stronger: the proof sits beside the
     words on every beat row, and the card scrolls internally so the story never drags the page. The
     Flow view's own left/right split, which still scrolls on two sides, is R13's sentence. -->
*Reworded 2026-08-28 (the human): "each scrolling on its own" becomes **one card that scrolls inside
itself** — the two-container reader is gone; side by side is now per beat row, and the independent
scroll it protected is the card's internal story region between its pinned header and footer.*

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

## R13 — Three views of a screen's requirements: Focus, List, Flow

- **Given** a screen's requirements
- **When** you toggle Focus / List / Flow
- **Then** the same requirements render in that view, storing nothing new

The detail header carries a toggle — **Focus / List / Flow**. **Focus** (the default) reads one
requirement at a time, as **one card read top to bottom**: the id · state · **title** lead one
header row, which also carries the reader's **one play speed** and its **play mode** (auto ↔
step, R20) *(a slim bar of their own until 2026-09-02, when the human moved them onto the title row)*,
then the requirement's **storyline — a row per beat** under
a **behavior · expected · actual** header row *(the column-order toggle this bar carried was removed
2026-08-30 with R21's rewrite — behaviour always leads; RENAMED 2026-09-03 from "behavior · schematic
· proof" by the human's Expected View decision — see R18)*. Each row carries that beat's three cells side by
side: the beat's **Given / When→Then words**, the **Expected** picture (the app's own component,
captured around the ring with the requirement's claim applied — a labelled sketch where no UI has
been harvested), and that beat's **own harvested Actual** — with the replica and the photograph aimed at the
**same region** by one shared **zoom camera** that every cell flips together, and **stepped by ONE
strip that spans them both**, one named segment per moment the beat proved *(the human, 2026-09-02:
"schematic and proof should share same stepper (as their steps must be same???)" — the walk was a
`‹ n / N ›` in the words' gutter until then, which read as two players with a control belonging to
neither)*. The header row also carries the covering
test's **actions** — the wired **▶ Run** — and ends in the card's **one ⋯**, which carries the test's
actions (run in background · logs · steps · add · edit · remove a test) and the requirement's (reword
· add · remove · the Expected picture doesn't match my app). The test's **name is not on the row**: it is
read where it is acted on — the ⋯'s edit/remove prompts, the Logs and the Steps windows. *(This
sentence read "**names the covering test** — a small pass/fail/none mark, the test's own name, then
Run" for a few hours on 2026-09-02, when the proof header first joined this row; the human asked for
that group off again the same day — "can we remove the test ✓ Tsumiki — the full flow (R1–R8)" —
because the requirement's own chip two elements to the left already says the state in words, so the
mark said it twice and a long flow title crowded the line. Both asks are recorded, rule 6.)* Where no
test covers the requirement that line reads "◌ no test yet · ＋ write the failing test"; a Changed
requirement's drift is spelled by its ◈ Changed chip. **Nothing sits beneath
the beat rows** — no proof header, no video, no prose *(the human, 2026-09-02: a proof header at the
bottom of the card "is just weird", so it joined the title row and its ⋯ merged with the row's own;
and "remove the whole thing as well" — the authored paragraph left the reader: the rows ARE the
requirement here, and the paragraph lives in prd.md and on the baked source row)*. **There is no
video in the reader**: the recording is the Flow view's, cut at proves-steps and scrubbed by its
chapter rail, and a second smaller copy of it under every requirement only pushed the rows that ARE
the proof off the screen *(the human, 2026-09-02: "remove the full flow video from focus mode" — the
band that held it went with it, filmstrip, pinned-era watermark and all; a failing run's cut frames
are read on the test's own evidence, and a failure still reads on the title row's ✗ Failed chip over the beat rows'
harvested red frames)*. **List** is one collapsed row per requirement (state · id · title ·
beat count · test kind) with a gap-summary strip above; **an open row is the Focus body itself**, in
place.
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

*Reworded 2026-08-25 (the human): the Focus reader was decluttered against a fresh mockup — the id ·
state · title lead ONE header row (the position moved to the pager); the "THE BEHAVIOR" eyebrow, the
"drawn from the text · viz@… · loops…" schematic footer and the "THE PROOF / PROVEN BY [unit|flow] /
+N more cover it" proof line are gone; the in-full link became a "Full requirement" pill; the proof
header simply names the covering test behind a pass/fail mark, and the media pane is shorter so the
behavior leads. All presentation — the requirements, tags and proof are untouched.*

*Reworded 2026-08-25 (the human, second pass): the behavior grid and the drawn schematic were two
stacked boxes saying the same thing twice; they FOLD into one **beat-paired storyboard** — each
Given / When→Then beat beside the still that draws it (phases already align 1:1 with beats: phase 0
= Given, phase i = beat i). The animated whole stays a **loop** toggle away; a requirement with no
committed drawing shows the labelled beats alone; a stale drawing greys every frame and keeps its
note (fresh text beside a wrong picture would mislead). Presentation only — nothing derived changes.*

*Reworded 2026-08-26 (the human): storyboard and loop **combine** — each beat's *still* becomes a
short, looping animation of the drawing performing *that beat's* action, so the storyboard is a list
of per-beat loops, each short and easy to read. The separate whole-sequence loop mode and the
storyboard/loop toggle are **gone** (folded in); reduced motion parks each loop at its beat as a
still. Presentation only — the committed drawing is unchanged (no re-derive), only how each row plays
it: its schematic scrubs the paused animation across that beat's own time-window and loops.*

<!-- Reworded 2026-08-28 (the human's storyline redesign, ordered and reviewed in this session). The
     sentence above described a reader that no longer exists: a left reading column and a right proof
     pane, one media pane per requirement under a stills · gif · video toolbar, a "Full requirement"
     chevron, a speed dropdown per pane, and a honesty caption over the drawing. Conforming the tests
     to the new DOM without correcting this text would have left the requirement quietly false
     (CLAUDE.md rule 6), so it is corrected here with the reason attached. The Given/When→Then block
     is deliberately untouched — the toggle it describes is unchanged, and its committed schematic is
     pinned to that text. -->
*Reworded 2026-09-02, later the same day (the human): the proof HEADER left the bottom of the card for
the TITLE ROW — mark · covering test's name · Run, and ONE ⋯ carrying the test's and the requirement's
actions together — and the authored prose beneath the rows is gone from the reader ("remove the whole
thing as well"). The play controls had joined the title row earlier that day. Presentation only;
nothing derived changes, and nothing green is claimed anywhere it was not before.*

*Reworded 2026-09-02, later still (the human, twice on the same row): "can we remove the test ✓
Tsumiki — the full flow (R1–R8)" and "add better spacing to the test title row". The TEST eyebrow,
the ✓/✗/◌ mark and the covering test's own name are OFF the row — the requirement's chip already
says the state in words, so the mark said it twice, and a long flow title crowded the line it was
said on. The test's wired **▶ Run** and the one ⋯ stay, and the test's name is read where it is acted
on (the ⋯'s edit/remove prompts, the Logs and Steps windows). The row is then spaced as three
CLUSTERS — what the requirement is (id · chip · title), how to play it (play · play speed), what to
do about it (Run · ⋯) — with a full --s6 of air opening each cluster after the title, --s2 between a
label and the control it names, and --s3 between Run and the ⋯; on a narrow reader the clusters wrap
onto their own line rather than crushing the title. Presentation only; nothing derived changes, and
the ◈ Changed chip is now the reader's only word for drift (it always spelled it; the mark that also
named it on hover went with the group).*

*Reworded 2026-09-02 (the human: "remove the full flow video from focus mode"): the proof BAND under
the rows is gone — its covering-test bar, its failure filmstrip, its pinned-era watermark and its one
full-width video. What is left beneath the beat rows is the proof HEADER's words (the covering test
behind a pass/fail/none mark, the Changed re-verify note, the honest "no proof yet · ＋ write the
failing test") and the moved test itself. The recording is the Flow view's subject. Presentation
only; nothing derived changes — and nothing green is claimed anywhere it was not before.
*(Superseded within the day, twice: that header moved up to the TITLE ROW, and then its mark and
the test's name came off it. Nothing is left beneath the beat rows now but the hidden moved test —
see the two notes above and the one below. Corrected in place, rule 6, 2026-09-02.)*

*Reworded 2026-08-28 (the human): Focus becomes a **storyline of per-beat rows** — schematic ·
behavior · proof, named by a header row, each beat's drawing and its own harvested frames framed on
the same region by one shared zoom camera. The two-container left/right reader, the per-pane
`stills · gif · video` toolbar and its stored preference, the per-pane speed dropdowns and the
"Full requirement" toggle are **gone**: one play speed and one column-order control serve the whole
reader, the prose is always shown, and what is left of the old media pane is the whole
requirement's band — the covering test, a failure's red frames, and one full-ratio video with a
per-beat jump. Presentation only; nothing derived changes.*

## R14 — The proof is scannable as frames, not only as video

- **Given** a run whose recording holds several checked values
- **When** you open the requirement's proof
- **Then** one frame per checked value shows in order, cut from the recording at the instant it fired, each carrying its burned-in callout and got-vs-expected — a failing value red
- **When** a run captured no recording
- **Then** no strip shows at all — never a separately captured picture

A reviewer shouldn't have to play a video to check a proven value. Where a run captured a recording,
its **proof frames** are surfaced too — **one still per checked value**, taken from the recording at
the instant that check fired (indexed by the run's own beat log), each carrying the same
self-narrating callout it burned in (the requirement, its When→Then, red on a failure) and the
ring on the exact value asserted. They show **where they belong**: each beat's own before/after pair
on that beat's **row** of the reader — **walked a scene at a time in step (the default), or looped in
auto**, its position read on the row's ONE stepper strip over the two pictures and the whole frame one
click away in the lightbox *(the human, 2026-09-02: the per-cell dots and counter are gone, and later
the same day the gutter's `‹ n / N ›` went with them — "schematic and proof should share same stepper
(as their steps must be same???)", so one strip across both pictures is the single readout)* — and a **run's own cut frames on that test's evidence**, one still per checked
value in order, each with its got-vs-expected and the failing one red *(the human, 2026-09-02: the
proof band that also showed a failing run's filmstrip inside the reader went with the reader's video;
a failure still marks the proof header ✗ over the beat rows' harvested red frames, so nothing there
can read green)*; so a person verifies the asserted values by eye, in order, without pressing play; the
**video is reserved for what a still can't show** — motion, a sequence, a dense flow — and it plays
in the **Flow** view, not under the requirement. Because the
frames are frames *of* the recording, they can never disagree with it: a run with no video simply has
no strip, never a faked or separately-captured one.

*Drafted 2026-08-12 on the human's direction and accepted the same turn: the recording is fast to
trust but slow to scan, so its key moments are pulled out as stills for eye-verification, with the
video kept for what a picture cannot carry. It amends R10's "no separate screenshot column" — the
frames are the recording indexed, not a second capture, so the one-artifact rule still holds.*

*Reworded 2026-08-22 (the human): the strip is the media pane's stills view — one surface, not two.*

<!-- Reworded 2026-08-28 (the human's storyline redesign, in this session): there is no media pane
     with a stills · gif · video toolbar left to be "the default for a multi-beat pass", and the
     burned-in topbar the frames carried is now a tour callout. The frames themselves are unchanged —
     still cut from the ONE recording, still never a second capture — so only WHERE they are read
     moved: onto the beat rows, plus the failure filmstrip in the band. Corrected in place with the
     reason attached (CLAUDE.md rule 6). -->
*Reworded 2026-08-28 (the human): the frames are read **per beat, on the row they prove**, with a
failing run's checked-value frames in the proof band beneath. No toolbar, no pane default — the
frames sit beside the words. The one-recording rule is untouched.*

<!-- Reworded 2026-09-02 (rule 6, with the reason attached): the human removed the reader's proof
     band ("remove the full flow video from focus mode"), and the band was where this requirement's
     failing-run filmstrip lived. Nothing about WHAT is cut changed — still one still per checked
     value, still frames OF the one recording, still red on a failure — only where a person reads
     them: the beat's harvested frames on its row, the run's cut frames on the test's own evidence.
     Conforming the tests to the new reader without correcting this sentence would have left the
     requirement claiming a surface that no longer exists. -->
*Reworded 2026-09-02 (the human): a failing run's checked-value frames are read on the **test's own
evidence**; the reader's band is gone with its video. The frames, the one-recording rule and the
red-on-failure rule are all untouched. Confirmed by the human the same day, on the lead's
recommendation, after seeing the re-harvested reader: the Focus reader stays free of the run
filmstrip — a failure is read off the beat row's own red harvested frame and the ✗ on the proof
header, and the cut frames live on the test's evidence.*

## R18 — The Expected picture is the app's own component

- **Given** a requirement whose beats were harvested with their layout skeletons
- **When** its Expected picture renders
- **Then** it is the app's OWN markup for the region the assertion ringed — captured, sanitised and committed beside the frame, re-rendered on paper at the app's own coordinates, with the requirement's claim applied to the element the check read
- **When** no UI was ever harvested for it
- **Then** it falls back to a labelled sketch drawn from the sentence, or to the labelled beats under an honest "no Expected yet" — never a guessed picture of a screen
- **When** the requirement's text moves past the harvest
- **Then** the storyline says so with its stale banner — there is no per-cell caption *(removed 2026-09-02, the human: "avoid useless things"; the ⋯ menu's "the Expected picture doesn't match my app" prompt is still the R15-pattern escape, and it still carries the picture's provenance into the prompt)*
- **When** the app moves past the picture, or the gate finds something the harvest measured that the picture does not carry
- **Then** the same stale banner says the layout moved or names the replica gap, and the proof gate refuses that picture until the screen is re-harvested — a picture that has stopped matching what the run measured is never shown as current

The Expected half of a beat row used to be a **drawing**. First an **archetype** — a house diagram
chosen from the *shape* of the sentence, true to the idea and to nothing on screen — then a
**wireframe mirror** derived from the page's own measured boxes. Both are retired for a harvested
requirement: the picture is now a **replica**, the app's own DOM. `spec/_replica.mjs` walks up from
the element `proveVisible` handed over to the smallest ancestor at least 3× the ring's area,
serialises that subtree with its computed styles, strips every script, handler and external URL, and
commits it as `spec/<screen>/evidence/<id>.b<n>.<phase>.actual.html`; the **Expected** file beside it
is the same markup with the beat's claims applied. The board renders it in an `<iframe sandbox
srcdoc>` with no `allow-*` token — no script, no network, no origin — on a paper page carrying the
app's shell plates, wearing the same ring and dim the photograph beside it wears. That is what makes
a row a **comparison** instead of an illustration: both cells are the same component at the same
moment, one as the requirement says it should be, one as the app rendered it.

On a **failing** beat the Expected shows the **intended** state — the last state the app got right,
with every failed claim applied: a wrong value corrected on the ringed element, an element the app
removed restored, one it never had drawn beside the ring — while the photograph keeps what the app
actually produced, with its red ring. The two cells are not two copies of one fact: **the Expected
and the behaviour are the truth**, the thing a human can disagree with and rewrite; the Actual is
what happened. The verdict stays the photograph's alone *(the human, 2026-09-02, on Tsumiki's
deliberately failing R9: "for the failed test case, schematic should be correct (schematic and
behaviour are truth — otherwise user should disagree this truth and update it)")*.

**The gap between the two pictures cannot open again** *(the human, 2026-09-02: "make sure the gap
between schematic and proof will not exist again")*. The replica is gated by **measurement**, at
capture: it is re-rendered in a hidden iframe in the app's own page and walked with the very walk
that measured the live page, box for box and word for word, and every miss is a **replica gap** filed
on the harvest. `npm run proof mirror` refuses a committed replica that has a gap, that was never
gated, whose pin no longer hashes the skeleton beside it, or that ran out of bytes; the storyline's
stale banner reads all four reasons. A gapped replica is still written and still shown, because a
gapped picture beats no picture — but it is never shown as current.

*Drafted 2026-08-28 on the human's behalf, transcribing the storyline redesign they ordered and
reviewed in this session — canon as written, and theirs to reword or remove like any other.
Amended 2026-08-29, then twice on 2026-09-02 (the mirror renders real text at measured sizes; the
harvest that moved past its drawing is said by the banner and refused by the gate). REPLACED
2026-09-03 by the human's Expected View decision (docs/expected-view-plan-2026-09-03.html): the
picture beside a proof is a real HTML replica of the app's own component, not a drawing of it —
Schematic is renamed **Expected**, Proof **Actual**, and the drawn ui-mirror is retired. The old text
is kept in the comment below.*

<!-- REPLACED/RENAMED 2026-09-03 (the human: Expected View plan, docs/expected-view-plan-2026-09-03.html).
     This requirement previously read "R18 — The schematic mirrors the real UI", and its beats were:

       Given a requirement whose beats were harvested with their layout skeletons
       When its schematic derives
       Then it is drawn from the app's own measured layout — the page's real structure at the viewport
         it was measured in, with the focused element's own text where a beat ringed one
       When no layout was ever harvested for it
       Then it falls back to the archetype drawing, or to the labelled beats under an honest "no
         schematic drawn yet" — never a guessed picture
       When the requirement's text moves past the drawing
       Then the storyline says so with its stale banner and renders the drawing quiet
       When the harvest's geometry moves past the drawing
       Then the same stale banner says the layout moved, and the proof gate refuses the drawing until
         it is redrawn

     The drawn wireframe was the answer to "make the schematic look like actual web as close as
     possible" (the human, 2026-09-02). It got close and stopped: a drawing of a component is a
     renderer that has to be taught every CSS rule the app already knows, and each thing it had not
     been taught was a gap only a person's eye caught. The human's answer on 2026-09-03 was to stop
     drawing and start CAPTURING. Everything the old text asserted about honesty — never a guessed
     picture, the intended state on a failure, the gate that refuses a picture the harvest has moved
     past — is carried forward above, on the replica instead of on the drawing. -->

## R19 — A beat row is a comparison: same region, same beat, one expected, one real

- **Given** a beat whose harvest recorded the focus box its assertion ringed
- **When** its row renders
- **Then** the Expected cell and the Actual cell are aimed by ONE camera at the same region of the same page, so the replica and the photograph can never frame different things
- **When** you read the words that caption them
- **Then** both sides carry that beat and no other — the replica captured at that beat's own moment and the photograph taken at it, with the row's text cell showing the sentence they are both of — while the Given row stays whole-page and uncaptioned on both sides

A row is only worth its width if the two halves are **the same view of the same moment**. The focus
rect the harvest recorded — the **union of the rings** this beat's assertions painted — sets the
row's **zoom**: one magnification for the whole beat, so the two cells can never pump against each
other. Each **scene** sets the **aim**: the camera centres on the ring that scene photographed, in
both cells at once — a single fixed frame holding rings hundreds of pixels apart could only fit them
by zooming back out until neither could be read *(amended 2026-08-30, the human: "more aggressive
zoom in on the area it's focusing"; the whole screenshot is one click away in the proof lightbox)*.
The Actual cell frames it, and the replica beside it is framed by the identical
transform — the replica stands at the app's OWN coordinates, so the two cells share one coordinate
system outright rather than one being re-expressed into the other's. **One camera aims
both** — there is no inline zoom toggle any more (the human, 2026-09-02, with the full-frame button
removed): both cells always frame the component, and the whole screenshot is the lightbox a click on
the proof opens. And the two cells
step **together**: the row's one stepper walks the beat's moments, so frame *n* of the photograph and
the replica the Expected cell is showing are the same moment — same region, same clock. The **words** are
the same beat too — and the same **sentence**: the callout burned into the RECORDING says one
line per scene (`tools/callout-text.mjs`), so mid-beat it cannot claim a Then that has not happened,
and the row's text cell reads the full beat off the prd — one language across the row *(amended
2026-08-30 with the one-sentence card, R10; the still frames stopped carrying that card on
2026-09-03, design C's "every text once" — the board's own chips beside the two cells say the
claim now, and the video keeps the burned card because a recording has no chips)*. The
**Given row is the context row**: it is about *where* the component sits, not what it says, so both
its cells stay whole-page and carry no beat and no callout.

*Drafted 2026-08-28 on the human's behalf, transcribing the storyline redesign they ordered and
reviewed in this session — canon as written, and theirs to reword or remove like any other.
Amended 2026-08-29 on the human's ask: the camera is the union of the beat's rings (so the first
scene is never cropped away), and the two cells now share one clock — the proof drives the drawing.
RENAMED 2026-09-03 by the human's Expected View decision (docs/expected-view-plan-2026-09-03.html):
"schematic cell" → **Expected cell**, "proof cell" → **Actual cell**, and "the drawing" → **the
replica** wherever it means the picture. One clause changed meaning with the picture rather than only
its name, and is called out here rather than conformed silently (rule 6): the second Then said the
drawn side was "derived from and LABELLED WITH its When → Then" — a wireframe carried the beat's
sentence in its own accessible label. A replica is the app's markup and labels nothing; the sentence
lives in the row's words cell, which is where a reader reads it. The claim the row still makes — both
sides carry that beat and no other — is unchanged.*

<!-- Proven by spec/board/test.spec.ts, "A beat row is a comparison …" — beat 1 forces a focus rect
     onto a real requirement's harvested beat (the established deterministic technique; the frames
     and layouts stay real) and asserts BOTH cells of that row are zoomed and frame the same region:
     each camera's framed rectangle is computed back out of its own transform and box, compared as a
     fraction of the page, and shown to contain the focus rect's centre. Beat 2 asserts the words
     agree across the row — the row's text cell and the drawing's own label both carrying the beat's
     When → Then as parseBehavior reads them from prd.md — and that the Given row carries the Given
     alone, unzoomed, with no zoom control at all (the full-frame toggle is gone reader-wide; the
     whole frame is the lightbox a proof click opens). -->

## R20 — The proof plays itself

- **Given** a beat whose harvest holds each value it proved and the state it left
- **When** its row renders
- **Then** the Actual cell frames the thing being proven and nothing around it — no media toolbar, no dots, no `n / N` counter — with the whole screenshot one click away in the proof lightbox; the beat's position is read and walked on ONE stepper strip spanning both pictures, one segment per moment the beat proved, each named by the assertion the run recorded
- **When** the reader opens
- **Then** it opens in **step** — each beat held on its first scene — with the reader-wide controls (the **auto ↔ step** pair and the speed) on the requirement's title row, left of its ⋯ menu
- **When** you walk a beat — its strip's `‹ ›`, a click on one of its named segments, or the ← → keys while its row is the **selected** one (visibly marked) — with ↑ ↓ selecting which When/Then and PgUp / PgDn paging the requirement
- **Then** both pictures of that row move together to that one moment, the strip painting the segment they are on, the next chevron becoming a restart `↺` at the last moment that wraps to the first — and no other beat row moves
- **When** you switch the play control to auto
- **Then** every cell plays itself on a loop at the reader's speed; the speed control is live **only in auto** — a stepped beat sets its pace by hand
- **When** the row is the Given
- **Then** its one frame stays a plain, uncaptioned still — a state, not an action

A proof cell shows the **beat happening and nothing around it** — no media toolbar, no dots, no
`n / N` counter. The beat's each-asserted-value → after is the motion; its **before frame stays in
the evidence but leaves the loop** — the state before the action is what the Given row (or the
previous beat's end) already showed (the human, 2026-08-30). A beat that proved nothing between its
ends still shows both, and there the before **is** the motion. The old `stills · gif · video` switch
was chrome asking a question nobody had; it does not come back. The camera is a **view, never a
claim**: the cell frames the focused component — the small thing being proven, not a page to hunt
in — and a **click opens the full screenshot in the lightbox**, the frame on disk untouched either
way. There is no inline zoom toggle and no per-cell chrome (the human, 2026-09-02 — "remove full
frame button and also the dots … in proof as it already did in the step on behaviour"): the **one
readout and walk** for a beat is the **stepper strip over its two pictures**.

A beat is **one ordered list of moments** — every value the test proved, in the order it proved them,
then the beat's result — and the drawing and the photograph are two **renderings of that one list**
(the human, 2026-09-02: "schematic and proof should share same stepper (as their steps must be
same???), please think about the product and really fix the problem"). So the row has **one stepper**,
sitting across both pictures because that is what it steps, and each segment is **named by the
assertion the run recorded** — never `when 1`; the last segment is the beat's **Then**, marked with
the word as well as the hue. A harvest that named nothing falls back to a generic name rather than
inventing one, and a **drawing that splits the beat into a different number of moments than the
harvest holds is parked, not stepped**, with the storyline's stale banner saying so: two clocks on one
row is the defect this replaced.

The reader opens in **step** (the human, 2026-09-02 — "default as step"): the loop was the default
before, but watching it run on its own is now the opt-in, and reading a beat one scene at a time is
the resting state. The reader-wide controls ride the requirement's **title row**, left of the ⋯ menu
(the human, 2026-09-02 — "put all these on the same row of the test title row"): the **auto ↔ step**
pair and the **speed**, which is live **only in auto**, because a stepped beat sets its own pace. The
**advance is per beat row**, never one reader-wide "next" (a requirement has several When/Then, so a
single "next" was ambiguous — and a rail of cryptic `when 1 · when 2` beads was tried and rejected,
the human 2026-08-30). Each row's **stepper strip** walks that beat; the **← → keys** walk the **selected**
row — the one you clicked, visibly marked, never every row at once (the human, 2026-09-02 — "left/
right key only apply on that particular when/then"); **↑ ↓** select which When/Then, and **PgUp /
PgDn** page to the previous / next requirement (the human, 2026-09-02 — "another shortcut to change
on different test case"). **Visibly marked** means the selected row wears an ink rule at its edge and
its two pictures read at full strength while every other beat row's **stand back** — dimmed, never
hidden, and never the WORDS (a dimmed sentence would drop under the 4.5:1 floor); and each
beat carries its **own number in a mark column beside its words** — a ringed numeral with a hairline
running down the row, the context row's mark a small hollow ring with no number. The `When¹ · Then¹`
**superscripts are gone** with it (the human, 2026-09-02: "hard to read and not intuitive"), and so
is the label column: `When` / `Then` / `Given` are the **first word of the sentence they name** (the
human, the same day: "even more easy to read"). The keyboard legend is **not in the reader at all** —
not per row, and not in its footer either (corrected in place 2026-09-02, rule 6, on the human's own
instruction: "remove the short cut key hint in this page, only mention in the setting page"; the
footer's one-line legend, which this paragraph named for a few hours, is now said **once on the
guide**, under Keyboard). The keys themselves are unchanged. Both halves of a row move on the same call a timer
would have made, so the lock-step survives the mode. Session-scoped, stored nowhere. It is a **play**
mode, never a media mode.

*Drafted 2026-08-28 on the human's behalf, transcribing the storyline redesign they ordered and
reviewed in this session — canon as written, and theirs to reword or remove like any other.
Amended 2026-08-29 on the human's ask: the loop now carries each value the beat proved between
its before and after, so the When is watchable, not inferred. Amended 2026-08-30 on the human's
ask ("enable click to go to the next small step"): the auto ↔ step play mode. Amended again
2026-08-30: the advance is a per-beat-row guided-tour stepper `‹ n / N ›` (the reader-wide "next"
and the cryptic-bead rail were both rejected); a proof-cell click is the lightbox in every mode.
Amended 2026-09-02 on the human's direct instruction: the reader opens in **step** not auto; the
auto/step + speed controls move onto the title row and the speed is auto-only; the proof cell sheds
its dots, its counter and its full-frame toggle (the gutter `‹ n / N ›` is the one readout, the
lightbox the whole frame); and the keys gain axes — ← → walk the selected beat's scenes, ↑ ↓ select
the beat, PgUp / PgDn page the requirement. Amended again 2026-09-02, same session: selection is
marked by the neighbours standing back and by a per-row numbering eyebrow, and the When/Then label
superscripts are removed as unreadable. Amended again 2026-09-02 on the human's direct instruction —
"schematic and proof should share same stepper (as their steps must be same???), please think about
the product and really fix the problem": the gutter `‹ n / N ›` is replaced by ONE stepper strip over
the two pictures whose segments are the beat's moments, each named by the assertion the run recorded;
a drawing that cannot match the harvest's moments is parked instead of free-running; and the words go
sentence-first — the eyebrow and the label column give way to a mark column and keyword-led
sentences. Amended again 2026-09-02, same session, on the human's instruction ("revise all font size
and design system, now it looks not so balance on font size and also spacing. Also remove the short
cut key hint in this page, only mention in the setting page"): the reader carries no keyboard legend
anywhere — the keys are listed once on the guide — and the reader's type is one ladder, the
requirement title the only head at --t-xl with the beat's When a step under it at --t-lg and its
Then / Given at body size.*

<!-- Proven by spec/board/test.spec.ts, "The proof plays itself …" — beat 1 asserts a harvested beat
     row's proof cell carries NO dots, NO n/N counter and NO full-frame toggle (only the row's one
     stepper strip reads/walks it, one named segment per harvested moment), that the reader opens in
     step (nothing advances on its own until auto
     is chosen), that the auto/step + speed controls sit on the title row with the speed disabled in
     step, and that ← → move only the SELECTED beat row while ↑ ↓ change the beat and PgUp/PgDn the
     requirement. Beat 2 asserts the Given row's cell is a plain uncaptioned still: one frame, no
     stepper, no dots, no caption. A last leg of the stepper test (added 2026-09-02) asserts both
     halves of the legend's move: nothing in the reader — its rows, its card, its pager footer —
     names a key, and #howview's Keyboard section lists every key the reader answers to. -->

## R21 — The reader reads behaviour first

- **Given** a requirement's storyline
- **When** it renders
- **Then** every row deals the same three cells in one order — the behaviour's words, then the drawn schematic, then the harvested proof — with the header row over the cells it names
- **When** you page on to another requirement
- **Then** it reads in that same order; there is no control to change it

The sentence you are asked to believe comes first, and the two pictures of it follow. Some read the
picture first and some the sentence, and the toggle that offered both asked that question on every
requirement and answered it nowhere — the human removed it (2026-08-30: *"just always be behaviour
first"*). One order means the header can never sit over a column it does not name, because nothing
is re-dealt: the DOM order **is** the visual order. Nothing about the order is chosen, held or
stored — there is nothing left to remember.

*Drafted 2026-08-28 on the human's behalf as "reads in your order" (the column toggle); rewritten
2026-08-30 to this fixed order on the human's direct instruction — canon as written, theirs to
reword or remove like any other.*

<!-- Proven by spec/board/test.spec.ts, "The reader reads behaviour first …" — beat 1 measures the
     fixed order on every row of a multi-beat requirement (the words lead every row), header drift
     under 2px, and asserts the retired column-order control is ABSENT (the R8 assert-the-gone
     precedent). Beat 2 pages to another requirement and asserts the same order, with nothing
     written to storage. -->

### 3 · Computed truth — state is derived, never stored

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
- **Then** its proof shows the covering test that tags it, resolved by tag — cross-screen when the tag is qualified, wherever that test's file lives

One test can prove several requirements; one requirement can be proven by several tests. The link
lives in the **test**, which tags the requirement ids it covers — qualified (e.g. `asset-plan:R5`),
so a flow can cover another screen's requirement. A flow's file lives in the screen it **starts** on;
coverage is by tag, so a requirement resolves to every test that covers it, wherever that file lives.

*Reworded 2026-08-25 (the human): the Focus proof header **names the covering test** (the primary,
under a failed status the one that failed) rather than listing "+N more cover it" on the line — the
many-to-many link is unchanged, carried by the tags and read in the List view; the header just leads
with the one test whose recording is shown. Removing the "+N more" phrase was part of the Focus
declutter the human signed off on.*

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

## R22 — The board says which screens gate CI

- **Given** the CI chooser at `spec/_ci.json`
- **When** the board is built
- **Then** every home card whose screen is in the gate wears a CI mark, and the guide names the chooser by file
- **When** the chooser changes, or is deleted
- **Then** the marks follow it — an absent chooser means every screen, exactly as the gate resolves it

The repo's CI gate runs a **user-chosen** set of screens, and the choice is a committed file —
`spec/_ci.json`, resolved by the same pure `tools/ci-select.mjs` the workflow itself runs. What is
chosen must be **visible where the choosing matters**: each home card in the gate wears a small "CI
gate" mark, derived at build time from the chooser through that same resolver, so the mark can never
disagree with what CI will actually run. The guide names the file, so "how do I add a test to CI?"
has an answer on the board itself. An unreadable chooser reads **broken** out loud rather than
silently gating nothing. Like every fact on this board, the mark is derived, never stored.

*Drafted 2026-08-30 on the human's behalf, transcribing their ask ("user need to be clear that they
can add some test for CI check, and what tests are added") — canon as written, theirs to reword or
remove like any other.*

<!-- Proven by spec/board/test.spec.ts, the CI-mark test — it reads the committed chooser
     independently, demands the marked set differ from the full set, then seeds a one-screen chooser
     → rebuild → the marks move; deletes the chooser → rebuild → every card wears the mark. -->

### 4 · What the board refuses to own

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

<!-- RESTORED 2026-09-04 (rule 5, on the coordinator's ruling). Staff narrowed this Then on
     2026-09-03 to "…; nothing is LOADED from anywhere", reasoning that the human's Expected View
     decision entails it: a beat row's Expected picture is now an `<iframe sandbox srcdoc>` holding
     the harvest's own committed replica, so an absolute "no embedded iframe" reading is no longer
     true of the board. That may well be the right wording — but it is a change to requirement
     MEANING, and meaning waits on the human. The human's own words are back, verbatim.

     THE QUESTION FOR THE HUMAN, in one line: R7 says the detail embeds no wireframe and no design.
     A beat row now embeds the app's OWN captured markup in a script-less, network-less, opaque-origin
     `srcdoc` frame — the harvest's picture, not an artifact this tool owns. Does R7's "no embedded
     wireframe" still hold as written (staff reads it as yes: a replica is neither a wireframe nor a
     design), or should the Then say so out loud?

     The test asserts the RESTORED meaning — no design chip, no design link, and no embedded
     wireframe anywhere in the detail — and keeps the frame's inertness as an EXTRA assertion beside
     it, which constrains the implementation without changing what R7 says. -->
*Narrowed 2026-07-30: R7 previously carried an optional external `design:` link shown as a chip in the
detail. Removed at the human's direction — a link specboard never renders, gates, or stales is still
one more thing to carry, and the tool is meant to be minimal. The `design:` frontmatter field and the
Design chip are gone.*

## R15 — The board hands you a prompt; it never writes a requirement or a test itself

- **Given** a requirement or a test
- **When** you pick an action from its ⋯ menu
- **Then** a ready Claude prompt opens and is copied — the board writes no file

You are staff and the human owns meaning, so the board proposes work but never authors it. Every
requirement and every test carries a **⋯ menu** whose actions change no file: a requirement's menu
offers **reword · add a requirement · remove this requirement · add a test to cover it · the
schematic doesn't match my app** *(the last added 2026-08-30 with R18's provenance caption)*; a test's
menu offers **add · edit · remove a test** (unit or flow), with a **picker for the requirements it
should cover**. Adding a test is reachable from a requirement even when nothing yet tags it — the
requirement that most needs a test is the one with none. Each action
opens a **ready prompt for Claude** — pre-loaded with the screen, the exact file
(`spec/<screen>/prd.md` or `spec/<screen>/test.spec.ts`), the requirement or test in question, and
the four lines that keep the proof honest (**tag the requirement with `checkReq`, assert something
that would fail without it, keep every asserted value visible in the recording, and never weaken a
test to go green**) — and copies it to the clipboard. *(The prompt carried a fifth line, "write the
failing test first, and watch it go red", until the human dropped it 2026-09-02: it is method, not
proof — "normal user won't get the write failing test first anyway" — and the kg-e2e skill still holds
Claude to it; the four that stay are what stop a fake green.)* You run it, read
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

### 5 · Running, and the guide

## R10 — A test opens to its full evidence, and can be run — watchably or in the background

- **Given** a test with numbered story steps, its run records, and Run / Run in background wherever it is shown
- **When** you open the test
- **Then** its numbered story steps show from its definition — before any run — each wearing the run's passed / failed / not-reached mark
- **When** a step asserts a value while the run records
- **Then** a callout burned into the recording rings the asserted element and carries the requirement's id chip beside the ONE line that scene is proving — the When while the beat is in motion, the Then once it comes to rest — reddened and naming the got value on a failure, the asserted value scrolled into view
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
video**: while a run executes, the harness paints a **product-tour callout into the page under
test** — burned into the recording and its cover, not overlaid by the board. The app dims lightly,
a **ring lands on the exact element the check reveals**, and a card **attached to that ring** carries
the requirement's **id chip and the ONE sentence the scene in front of you is proving** — the When
while the action is on screen, the Then once the beat comes to rest, in the requirement's own words,
the same words the board's storyline shows. Never the requirement title, never both lines stacked:
the card floats over the app it is pointing at, and a paragraph there hides the very thing being
proven *(amended 2026-08-30, the human: "as less text as possible", one shared rule feeding the
drawn and burned cards alike — tools/callout-text.mjs)*.
On a failing check the ring, the card and the **got value** all redden,
so the video alone explains what was being tested and which part failed; the got value shows **only
on a failure** (every check's full got-vs-expected is recorded as the test's step evidence instead).
The card is placed **below the ring first, then above, then beside it**, and **never covers the
element it points at** — the surrounding state that produces the proven value must stay readable.
The recording is captured at
the **app's real size** (not a shrunken thumbnail), and a step that asserts on a value **scrolls
that value into view and holds** before asserting, so the frame actually shows what is being proven
rather than asking you to trust the callout. A **failing run keeps its recording too** — the video is
the best evidence of a failure, so it is never dropped just because the test went red. Every test can
be **Run** (a real browser opens and drives the app in front of you — the watchable run) or **Run in
background** (headless — nothing to watch, it just goes). *(Renamed from Run / Watch — the human,
2026-08-13: "Run" is now the watchable one, and the headless one says what it is. "Run all" in the
detail header stays a background run — running the whole suite watchably is rarely what you want.)*
Both stay wherever a test is shown; in the **Focus** reader (R13), Run is always shown on the
requirement's **title row** and Run in background folds into that row's **⋯ menu** with Logs and
Steps. *(Was "in the proof header" — that header moved onto the title row and then lost everything
but its actions; corrected in place 2026-09-02, rule 6.)*

The self-narrating callout can also be **spoken aloud**. When voice-over is on (a Setup switch, init
R6 — **off by default, saved per project**) and the running screen has a **narration pack**
(`spec/<screen>/narration.json`, authored once with pass *and* fail lines), a single watchable run is
**paced to the narration** and its recording is **voiced**: piper synthesizes each line and it is
muxed at the beat times, the same words shown as subtitles — and the player then plays that **voiced
recording** in place of the silent one. With no pack, no voice-over, or no synthesizer present, the
recording stays **silent** — the voice is never faked (rule 3), and a screen with no pack simply
plays silent.

<!-- Reworded 2026-08-28 (the human's storyline redesign, ordered and reviewed in this session): the
     burned-in TOP BANNER is gone — with its step head, its requirement-chip strip and its
     expected · got claim line. What narrates the recording now is a product-tour CALLOUT anchored to
     the ringed element, carrying the beat's When→Then in the prd's own words. The old text promised
     "one consistent topbar, always in the same place — never a floating caption card", which the
     redesign deliberately reverses, so the sentence had to be corrected here rather than left to rot
     against the code (CLAUDE.md rule 6). The narration pack, the pacing and the voice-over below are
     unchanged — they key on beats, not on the surface that draws them. -->
*Reworded 2026-08-28 (the human): the narration is a **tour callout**, not a topbar — a light dim, a
ring on the asserted element, and a card attached to that ring naming the requirement and its
current When→Then. It never covers the element it points at, and the got value appears only on a
failure. Same beats, same words as the board's storyline; only the drawn surface changed.*

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
