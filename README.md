# specboard

**A visualised spec-driven development board.**

You have a codebase and an AI agent. What you do not have is a written, *visible* statement of how each
screen is supposed to work — so when you ask the agent to change something, it reads the code, infers
the intent, and guesses. Different sessions guess differently. That is what "the feature randomly
changed" is.

This plugin puts every screen of your project on one page as a **row of four columns**:

| 1 · PRD | 2 · Draft | 3 · Screen | 4 · E2E |
|---|---|---|---|
| the requirements — the source of truth | a hi-fi, clickable wireframe | a screenshot of what got built | the test that proves it |

The whole point is **staleness**. Edit the PRD and the draft goes stale; change the draft and the
screenshot goes stale; edit anything and a green test result goes stale. **There is no status field
anywhere** — every cell is *derived* by comparing a stored approval hash against the current content
hash. You are never asked to remember what is up to date; the board works it out.

Two human gates, and only two:

- **Gate A** — PRD vs draft: *is this what I meant?*
- **Gate B** — draft vs screenshot: *did you build it?*

You approve meaning. The agent does everything else and never picks a side of a contradiction for you.

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
The plugin's skills (`kg-init`, `kg-staff`) become available the **next** time Claude Code starts.

### Set it up on your project

In a fresh Claude Code session **inside the project you want a board for**, say:

```
Use the kg-init skill to set this project up.
```

`kg-init` scaffolds specboard's tools into your repo (it never overwrites your files or copies
specboard's own screens), installs the two dev dependencies, starts the board, and points you at the
**Set up → Crawl** flow so your app's routes become the first rows. That's it — you now have a board.

> Prefer to skip the plugin entirely and scaffold by hand? Clone the repo and run the scaffolder into
> your project:
>
> ```bash
> git clone https://github.com/chinglaishu/claude-plugin-spec /tmp/specboard
> node /tmp/specboard/tools/scaffold.mjs .   # run from your project root
> npm install
> npm run board
> ```

## Using the board

```bash
npm run board          # serves on http://localhost:4173
```

Open it in a real browser over `http://localhost` (not `file://` — the gates need the server to record
a decision).

1. **Set up** (`#init`) — point the board at your app. Attach to a dev server you already have running,
   or let it start one; a two-tier app gives a **backend** command (started first and waited for) and a
   **frontend** command. Say which URL has the routes.
2. **Crawl** the app into rows. Each route becomes a screen: visited, screenshotted, and given a
   **guessed** PRD read off the page. A guess is marked as one, is never canon, and stays unapproved so
   the loop starts at gate A — you correct it, you do not inherit it.
3. **Work the queue.** Each screen waiting on you shows its two artefacts side by side and one verdict
   bar. Approve, or send it back with a sentence — every sentence is carried into the redraft.
4. **Redraft, run, and resolve** from the board itself: dispatch a wireframe rewrite, run one screen's
   test or the whole suite (streaming, cancellable, watchable), and adjudicate contradictions the
   scanner finds across your requirements.

## Contradictions are the interesting part

Open the **Conflicts** tab and **Rescan**. It reads every `prd.md` and files the contradictions — one
fact stated two incompatible ways: a count, a default, an ordering, a definition. Five real
contradictions beat thirty maybes, so it is tuned hard toward precision; "no conflict found" is a real
answer. You pick the canonical side, and resolving rewrites the losing requirement — after which every
screen downstream of it goes stale on its own. **The tool never picks.** Picking silently is the disease
this whole thing exists to cure.

## How it is built

Everything is derived from the tree — there is no database. A screen is a directory:

```
spec/<screen>/prd.md         requirements + frontmatter
spec/<screen>/draft.html     the wireframe, authored at 1280px, linking one shared design system
spec/<screen>/test.spec.ts   the Playwright test — it writes screen.png; column 3 is a byproduct of column 4
spec/<screen>/state.json     approval pins (the only mutable per-screen state)
```

`tools/spec-store.mjs` derives every cell state; `tools/build-board.mjs` renders `board.html`;
`tools/serve-board.mjs` records gate decisions and runs the jobs. The board **dogfoods itself** — its
own six screens are the rows on its own board.

## Requirements

Node 20+, and a project you are willing to have opinions about.
