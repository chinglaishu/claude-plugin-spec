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

THE RULE (the human, 2026-09-04, refined 2026-09-05 — "we only store things in codebase if it's
necessary, otherwise find a way to store somewhere else"): the board lives in **`specboard/` inside the
app repo** — one folder holding `spec/`, the vendored `tools/`, `board.html`, `playwright.board.ts` and
`node_modules`. That folder is **COMMITTED, authored files only**: the PRDs, the tests, the steps, the
narration packs, the human's conflict rulings and `spec/_specboard.json`. Its own `.gitignore` keeps the
rest out — the vendored code (a byte copy of this plugin, re-created by scaffold/update), `board.html`,
`node_modules`, the run scratch, and `spec/_config.json`, which is per machine and whose sign-in script
may carry a credential.

**Everything a run DERIVES lives outside every repo, in `~/.specboard/<projectId>/`**: the fold, the run
log and the raw report as rows in `board.db`, and every frame, replica, skeleton, font and video as
`blobs/<sha256>.<ext>`, garbage-collected by reference at each fold. So the app's history never carries
an evidence frame, a font or a 4 MB `board.html` — not because a `.gitignore` line hides them, but
because they are not there. The tools resolve their root to the folder they live in, so the board runs
from there unchanged. (This supersedes the 2026-09-04 whole-folder ignore, which existed to keep the
harvest out of the app repo; with the harvest gone to the data home, ignoring the folder only kept the
project's PRDs and tests on one disk.)

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/scaffold.mjs" .        # → ./specboard/  (re-running finds the existing board; never a second one)
```

**If `$CLAUDE_PLUGIN_ROOT` is empty**, it is the directory two levels above this `SKILL.md` — the one
containing `.claude-plugin/plugin.json` and `tools/`. Substitute that path.

Two escapes, only when asked for: `--dir <boardDir>` keeps the board somewhere else (the app repo then
gets a one-line `.specboard` pointer to it); `--flat` is the old vendored-in layout with `spec/` at the
app's root. Every other skill starts with "cd into the board" and finds it either way.

**Do not `git init` the folder and do not offer it a remote** — it is committed to the app repo, which
is already its history. If the human asks how the board is shared: the authored half travels with the
app repo like any other source, and the derived half (frames, video, the fold) is local to each machine
until a team flips the two switches in `spec/_specboard.json` — `db: "remote"` with a `SPECBOARD_DB_URL`
and `media: "cloud"` with a bucket, at which point every teammate's board and CI read one record.

## 1. Install dependencies and start the board

The scaffold wrote the board folder's `package.json` (the `board` / `board:build` / `staff` / `proof` /
`e2e` scripts, the two dev deps, and the store's own two dependencies — `better-sqlite3`, the default db
driver, and `pg`, the team's; the board server opens `board.db` through them, so `npm install` is not
optional), its `.gitignore` (the vendored code, `board.html`, scratch and secrets) and `spec/.gitignore`
(the run state and everything derived). It also wrote the project's `projectId` into
`spec/_specboard.json` — that is the name of its data home, `~/.specboard/<projectId>/`, on every machine
that checks the project out.

```bash
cd specboard
npm install
npm run board          # serves THIS project's board on its own port (printed by the scaffold; empty at first)
```

Open it in the user's **real browser** over `http://localhost` — `file://` URLs do not work. On a
fresh project the board is empty, which is the honest starting point, not a failure.

## 2. Point it at the app, on the Init page

Open `#init`. It asks only what cannot be guessed — how to reach the app:

- **Attach** to a dev server already running (safer — no second copy on the wrong port), or **start**
  it. A web app is often two servers: give the **backend** command and a readiness URL, then the
  **frontend** command. The crawl starts the backend first and waits for it, so no page is read before
  its API is up.
- The **frontend URL** (what has routes — this is what the crawl visits) and, optionally, which routes
  matter and a sign-in script.

All of this persists to `spec/_config.json`, which the crawl and the test harness both read.

## 3. Crawl the app → an honest INVENTORY: one row per screen, nothing faked

There is no wireframe step and no design-vs-document branch: specboard owns **neither wireframes nor
designs**. A screen is documented by its **requirements** and the **tests that prove them** — and the
crawl produces *neither*. It produces the **map**:

The crawl drives a **real browser** over the running app one route at a time, capturing each page
(`crawl.png`) and listing it as a **row with no PRD** — visibly, honestly uncovered. That is the
whole job. It deliberately does **not** draft requirements or tests: a requirement reverse-engineered
from the implementation records its bugs as intent, and a shallow auto-test is a false green that makes
the board *look* finished while proving nothing. Depth is a per-screen decision a human sponsors — that
is **kg-deep** (study → golden fixture → PRD draft, canon on write → unit and flow proving tests). Run
it screen by screen, most important screen first.

- A row with no PRD is the board saying "this screen exists and nothing governs it yet" — exactly
  the honest state. `crawl.png` is its evidence and its cover until a kg-deep pass replaces both
  with requirements and a recorded proving run.
- Requirement state is **proven / unproven**, computed from checkReq-tagged tests (see `kg-e2e`) —
  never typed, never stored. **Nothing waits on a person to confirm it**: a PRD drafted by kg-deep is
  canon the moment it is written, an ordinary starting point the human edits or removes freely (there
  is no gate and no guess flag).
- **Coverage is not automatic.** The crawl link-follows a couple of levels from the root, so it finds
  nav-reachable pages — but **not** entity-scoped routes with a concrete id (`/portfolio/42/scenario`)
  unless the app links to one, and **not** features reached by a *click* rather than a link (wizards,
  modals, sub-tabs behind a button). List those in **Setup → routes**, which always wins over
  discovery — and expect your most important screens to be exactly the ones the crawl cannot see;
  create their rows in the kg-deep pass.
- **If the app needs a login,** give a `signIn` script in **Setup → sign-in**. The crawl runs it
  first so pages behind auth are reachable, and the test harness reuses the session automatically
  (see `kg-e2e`). The script must **type** into fields, never `fill()` (controlled inputs submit
  empty). The login screen itself redirects away once you are in, so it can't be crawled — write it by
  hand.

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
real thing exactly as a crawled one does — its requirements read proven or unproven, with no
acceptance gate.

## 4. Find the contradictions already in the requirements

Once there are a few PRDs, open the **Conflicts** tab and **Rescan**. It reads every `prd.md` and
surfaces one-fact-stated-two-ways contradictions for the human to adjudicate. **Do not decide on the
user's behalf** — choosing a canonical side is the human's, one of the few decisions that is theirs.
Surface what you found and ask.

Then stop and report: what the board contains, how many rows the inventory found and which are still ungoverned (no PRD yet — kg-deep candidates, most important screen first),
and any contradictions the scan found.
