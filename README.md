# specboard

**A visualised spec-driven development board.**

You have a codebase and an AI agent. What you don't have is a written, *visible* statement of how each
screen is supposed to work — so when you ask the agent to change something, it reads the code, infers
the intent, and guesses. Different sessions guess differently. That is what "the feature randomly
changed" is.

specboard puts every screen of a project on one page as two ends, not a pipeline:

| 1 · Requirements | 2 · E2E tests |
|---|---|
| the source of truth | the proof, run against the real app |

The point is **drift**, computed and never stored. A requirement is **proven** only while a test that
*tags* it passed on an assertion that would fail without it; with no passing assertion it reads
**unproven** — honestly ungreen. Edit a requirement and its proof goes stale on the spot; delete the
assertion that proved it and the green honestly disappears. There is no status field anywhere.

**There is no gate.** Two things wait on a person: confirming a drafted guess (dropping its `guess:`
flag), and picking the canonical side of a conflict. Everything else is proven or unproven by the
tests, no human in the loop. specboard owns neither the wireframe nor the design — it tracks
requirements and their proof, nothing else.

---

## Install

**Requirements:** [Claude Code](https://claude.com/claude-code) and Node 20+.

specboard is a Claude Code plugin, published as a marketplace-of-one from this repo. Install it in two
steps: add the marketplace, then install the plugin.

### In Claude Code (the `/plugin` slash command)

Type these into the Claude Code chat prompt — the terminal `claude` REPL, the desktop or web app, or an
IDE extension (not a shell):

```
/plugin marketplace add chinglaishu/claude-plugin-spec
```
```
/plugin install specboard@specboard
```

### From a plain terminal (the `claude plugin` CLI)

Equivalent, if you'd rather stay in a shell:

```bash
claude plugin marketplace add chinglaishu/claude-plugin-spec
claude plugin install specboard@specboard
```

Either way you can check it landed with `claude plugin list` — you want `specboard@specboard ✔ enabled`.
The plugin's skills become available the **next** time Claude Code starts.

### Set it up on your project

In a fresh Claude Code session **inside the project you want a board for**, say:

```
Use the kg-init skill to set this project up.
```

`kg-init` scaffolds specboard's tools into your repo (it never overwrites your files or copies
specboard's own screens), installs the two dev dependencies, starts the board, and opens **Setup** so
your app's routes become the first rows — visited and screenshotted, honestly left with no PRD until a
human sponsors depth on them.

> Prefer to skip the plugin and scaffold by hand? Clone the repo and run the scaffolder into your
> project:
>
> ```bash
> git clone https://github.com/chinglaishu/claude-plugin-spec /tmp/specboard
> node /tmp/specboard/tools/scaffold.mjs .   # run from your project root
> npm install
> npm run board
> ```

## Using the board

```bash
npm run board          # serve on http://localhost:4173
npm run e2e            # the E2E suite
npm run board:build    # rebuild board.html only
npm run test:tools     # the pure-function unit tests
```

`BOARD_PORT=5000 npm run board` moves the board's own port — set it when the default **4173 collides**
(e.g. specboard's own dev board is already on 4173 while you work on a vendored copy elsewhere).
`BOARD_URL=http://host:port` drives an already-running site instead and starts/stops nothing.

Open the board in a real browser over `http://localhost` — `file://` URLs do not work.

## The five skills

specboard's method is five Claude Code skills:

1. **kg-init** — scaffold the board into a project and inventory its screens. A real browser visits
   every route it can reach and leaves each one a row with no PRD — visibly, honestly ungoverned. It
   never drafts requirements or tests; that is a separate, deeper job.
2. **kg-deep** — take ONE screen from a bare row to deep, human-confirmed requirements proven by
   unit and flow E2E tests: study the real screen, seed deterministic golden data, draft the PRD
   for the human to confirm, then author the proving tests. Run it screen by screen, most important
   first — this is what makes a row *true*.
3. **kg-e2e** — author the E2E test that proves a screen's requirements, tagging each one it covers
   with `checkReq`/`coverReqs` and asserting something that would fail without it. Used standalone, or
   from inside a kg-deep pass.
4. **kg-staff** — run **before** changing any screen or the code behind it: what governs the screen,
   the times to stop and ask the human, and the order a change must happen in.
5. **kg-update** — bring a scaffolded project's vendored board up to a newer specboard release without
   clobbering local edits; updated files land clean, edited files are kept with the new version dropped
   beside them as `<file>.new` to merge.

## Contradictions

Open the **Conflicts** tab and **Rescan**. It reads every `prd.md` and files one-fact-stated-two-ways
contradictions for a human to adjudicate — a count, a default, an ordering, a definition stated two
incompatible ways. **The tool never picks a side.** Resolving one rewrites the losing requirement, and
every screen downstream of it goes stale on its own.

---

The full doctrine, architecture, and the traps that have already cost hours live in `CLAUDE.md`.
