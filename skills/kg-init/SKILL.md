---
name: kg-init
description: Use when this plugin has just been installed in a project, or when a repo has no spec board yet. Scaffolds specboard into THIS project, installs its dependencies, starts the board, and opens the Init page so the project's own screens become the first rows.
---

# Setting up the spec board on THIS project

The user arrives with a codebase and an AI agent — **nothing else**. No spec, no tests. Your job is to
get from that to a board they can consult, without demanding they write anything first. specboard
tracks one thing: a project's **requirements** and the **tests that prove them** against the real app.
Everything below serves that one job.

## 0. Scaffold specboard into this project — first, always

The tools resolve their root to the repo they live in, so to run the board on *this* project you
vendor the skeleton into it (the tools, the one design system, the test harness, the run scripts). It
never overwrites files you already have and it never copies specboard's own screens.

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/scaffold.mjs" .
```

**If `$CLAUDE_PLUGIN_ROOT` is empty**, it is the directory two levels above this `SKILL.md` — the one
containing `.claude-plugin/plugin.json` and `tools/`. Substitute that path.

## 1. Install dependencies and start the board

The scaffold added the `board`/`e2e`/`staff` scripts and the two dev deps to your `package.json`.

```bash
npm install
npm run board          # serves THIS project's board on http://localhost:4173 (empty at first)
```

Open it in the user's **real browser** over `http://localhost` — `file://` URLs do not work, and the
gate needs the server to record a decision. On a fresh project the board is empty, which is the honest
starting point, not a failure.

## 2. Point it at the app, on the Init page

Open `#init`. It asks only what cannot be guessed — how to reach the app:

- **Attach** to a dev server already running (safer — no second copy on the wrong port), or **start**
  it. A web app is often two servers: give the **backend** command and a readiness URL, then the
  **frontend** command. The crawl starts the backend first and waits for it, so no page is read before
  its API is up.
- The **frontend URL** (what has routes — this is what the crawl visits) and, optionally, which routes
  matter and a sign-in script.

All of this persists to `spec/_config.json`, which the crawl and the test harness both read.

## 3. Crawl the app → a guessed requirement doc + a proving test per screen

There is no wireframe step and no design-vs-document branch: specboard owns **neither wireframes nor
designs**. A screen is documented by its **requirements** and the **tests that prove them**, full stop.
So the crawl does exactly that, per route it finds:

The crawl drives a **real browser** over the running app one route at a time, capturing each page
(`crawl.png`) and its structure. Then, for every route not already on the board, Claude **drafts a
guessed `prd.md`**, and kg-e2e authors a **characterization `test.spec.ts`** that proves that PRD
against the running app and, as a byproduct, records the screen. A crawled row therefore lands as **a
guessed requirement doc + a passing characterization test** — one card, its requirement titles, and
the test's recording. No wireframe, because the screen already exists.

- The PRD is marked `guess: true` — a proposal read off the running app, never canon. Correct it if it
  is wrong; the **one gate** is **Accept these requirements**, which makes the PRD the source of
  truth. There is no "did you build it" gate: that question is answered by the assertion-backed tests
  running against the real app (see `kg-e2e`), automatically, with no status field and no human
  compare. The only thing waiting on a person is accepting the requirements.
- Requirements changed since they were accepted read as **reworded** — awaiting re-acceptance. That is
  the sole human decision on a row.
- `crawl.png` is the evidence the PRD and test are written from, shown in the Init found-table; the
  test writes `screen.png` only as a fallback cover for a recording with no video. Neither is a
  "built screen" to review.
- Maintenance stays spec-driven: edit the PRD and its test's proof goes stale ("run it again"); update
  the test to the corrected PRD, and a failure against the app is then a real bug surfaced.
- **Coverage is not automatic.** The crawl link-follows a couple of levels from the root, so it finds
  nav-reachable pages — but **not** entity-scoped routes with a concrete id (`/portfolio/42/scenario`)
  unless the app links to one, and **not** features reached by a *click* rather than a link (wizards,
  modals, sub-tabs behind a button). List those in **Setup → routes**, which always wins over
  discovery — otherwise the board only ever documents the top nav.
- **If the app needs a login,** give a `signIn` script in **Setup → sign-in**. The crawl runs it
  first so pages behind auth are reachable, and characterization tests reuse the session automatically
  (see `kg-e2e`). The script must **type** into fields, never `fill()` (controlled inputs submit
  empty). The login screen itself redirects away once you are in, so it can't be crawled — write it by
  hand.

### The PRD must be DETAILED — drive the screen, don't skim it

A crawl that reads the page shell writes a shallow PRD ("the workspace opens", "it has a year basis"),
and kg-e2e then writes a shallow test — a board that looks finished while proving almost nothing.
Depth comes from DRIVING the real screen, not reading it. Whether the crawler produces the first draft
or you correct it, characterize each screen with a **drive-and-discover pass** (an on-the-fly script:
authenticate, navigate, wait for data, then explore — write it, run it, read it, discard it):

- **Harvest every `data-testid`** on the page — real apps are usually instrumented with them, and they
  become the PRD's named elements and kg-e2e's most stable selectors.
- **Name every metric/tile, table (its columns), chart, and control** (buttons, toggles, selects,
  search, sliders) with its label.
- **Note read-only vs editable** state (a "locked" indicator? a separate draft/edit surface?), and any
  modal or notice that overlays the screen.
- **Probe the primary interactions** — move a control and see which number changes, open a menu and
  read its options, follow a cross-page link — and write the observed EFFECT into the PRD ("saving
  here commits the change, and another page then reflects it"), not just "there is a save button".

**PRD rubric:** a screen's PRD is under-specified if a competent tester could not, from it alone, list
every number, control and flow to check. One requirement per meaningful behaviour, each naming the
concrete elements (put their testids in a comment). Keep `guess: true` — it is still the human's to
correct — but make the guess *rich*, not a two-line summary. kg-e2e then turns that detail into a
test that asserts real data and behaviour, tagging each requirement it proves.

**For a data-driven screen, name the expected VALUES, not just the fields.** If the screen's point is
computed numbers (totals, a chart, a grid that recomputes on a filter), a PRD that says "shows a total"
is still shallow — say *which* total, for *which* input. Live data drifts, so write the PRD against a
**golden fixture** (a seeded entity with fixed inputs, targeted by a stable id) and have its test
**seed + assert exact values** (`spec/<screen>/golden.json`) rather than reading whatever is live. See
kg-e2e's "Deterministic golden data" section for the seed hook (`spec/_seed.ts` / a `seed:e2e` script)
and the `golden.json` format.

Rerunning finds new routes without touching a screen the human has already worked.

### Nothing to crawl → greenfield

An empty found-table is the **greenfield** case: no rows, and a prompt to write the first PRD by hand.
It is the zero case of the same flow, not a different mode — there is no wireframe loop and no build
gate. Write a screen's `prd.md` (frontmatter + `## R<n>` blocks), then author its proving test with
`kg-e2e`. As soon as the screen exists in the app, its test drives the
real thing exactly as a crawled one does, and the one gate is still accepting the requirements.

## 4. Find the contradictions already in the requirements

Once there are a few PRDs, open the **Conflicts** tab and **Rescan**. It reads every `prd.md` and
surfaces one-fact-stated-two-ways contradictions for the human to adjudicate. **Do not decide on the
user's behalf** — choosing a canonical side is the human's, one of the few decisions that is theirs.
Surface what you found and ask.

Then stop and report: what the board contains, how many rows are still guesses waiting to be accepted,
and any contradictions the scan found.
