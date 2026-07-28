---
name: kg-init
description: Use when this plugin has just been installed in a project, or when a repo has no spec board yet. Scaffolds specboard into THIS project, installs its dependencies, starts the board, and opens the Init page so the project's own screens become the first rows.
---

# Setting up the spec board on THIS project

The user arrives with a codebase and an AI agent — **nothing else**. No spec, no wireframes, no tests.
Your job is to get from that to a board they can consult, without demanding they write anything first.

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
gates need the server to record a decision. On a fresh project the board is empty, which is the honest
starting point, not a failure.

## 2. Point it at the app, on the Init page

Open `#init`. It asks only what cannot be guessed — how to reach the app:

- **Attach** to a dev server already running (safer — no second copy on the wrong port), or **start**
  it. A web app is often two servers: give the **backend** command and a readiness URL, then the
  **frontend** command. The crawl starts the backend first and waits for it, so no page is read before
  its API is up.
- The **frontend URL** (what has routes — this is what the crawl visits) and, optionally, which routes
  matter and a sign-in script.

## 3. Two flows, because a project is either finished or greenfield

A screen is in one of two modes, decided per-screen by whether it has a wireframe (`draft.html`). The
init flow picks which one a project starts in.

### Existing app → DOCUMENT mode (crawl)

Crawl visits each route and, per new route, **drafts a guessed `prd.md`**, then **authors a
characterization `test.spec.ts`** that proves that PRD against the running app and **shoots
`screen.png`**, then **runs it**. A crawled row therefore lands as **PRD (a guess) + the current
screen + a passing test, with no wireframe** — because the screen already exists, so drawing a
wireframe of it only to "build" it would be circular.

- The PRD is marked `guess: true` — a proposal read off the page, never canon. Correct it if it is
  wrong; the one gate here is **Accept these requirements**, which makes the PRD the source of truth.
  There is **no gate A and no gate B** in document mode: there is no wireframe to approve a design
  against, and column 3 is simply the current screen, proven by the test in column 4.
- `screen.png` is always the **test's byproduct**, never a copy of `crawl.png` — `crawl.png` stays the
  evidence used to write the PRD and test, shown only in the Init found-table.
- Maintenance stays spec-driven: edit the PRD and its test goes stale ("run it again"); update the
  test to the corrected PRD, and a failure against the app is then a real bug surfaced.
- **Coverage is not automatic.** The crawl link-follows a couple of levels from the root, so it finds
  nav-reachable pages — but **not** entity-scoped routes with a concrete id (`/portfolio/42/scenario`)
  unless the app links to one, and **not** features reached by a *click* rather than a link (wizards,
  modals, sub-tabs behind a button). List those in **Setup → routes**, which always wins over
  discovery — otherwise the board only ever documents the top nav.
- **If the app needs a login,** give a `signIn` script in **Setup → sign-in**. The crawl runs it
  first so pages behind auth are reachable, and document-mode tests reuse the session automatically
  (see `kg-e2e`). The script must **type** into fields, never `fill()` (controlled inputs submit
  empty). The login screen itself redirects away once you are in, so it can't be crawled — write it by
  hand.

Rerunning finds new routes without touching a screen the CEO has already worked.

### New project (or a new screen) → DESIGN mode

Nothing to crawl is the **greenfield** case: no rows, and a prompt to write the first PRD by hand. From
a PRD you run the design loop — **PRD → wireframe → build → test** — with **gate A** (draft-vs-PRD) and
**gate B** (screen-vs-draft). This is unchanged from how the board has always worked. Authoring the
test is the `kg-e2e` skill.

### Redesigning an existing (document-mode) screen

To change a finished screen, **add a `draft.html`** to it — from the board, the row's "Add a wireframe
to redesign" affordance dispatches one. That flips that one screen into design mode, and gate A and
gate B appear: you are now approving a new design and then the build against it.

## 4. Find the contradictions already in the requirements

Once there are a few PRDs, open the **Conflicts** tab and **Rescan**. It reads every `prd.md` and
surfaces one-fact-stated-two-ways contradictions for the CEO to adjudicate. **Do not decide on the
user's behalf** — choosing a canonical side is the CEO's gate. Surface what you found and ask.

Then stop and report: what the board contains, how many rows are still guesses waiting to be corrected,
and any contradictions the scan found.
