---
name: kg-init
description: Use when this plugin has just been installed in a project, or when a repo has no spec board yet. Installs the board's dependencies, starts it, and opens the Init page so the project's own screens become the first rows.
---

# Setting up the spec board

The user arrives with a codebase and an AI agent — **nothing else**. No spec, no wireframes, no tests.
Your job is to get from that to a board they can actually consult, without demanding they write anything
first. The board itself does the asking, on its `#init` page.

## 0. Install the board's dependencies — first, always

The plugin ships source, not `node_modules`. Until this runs, `npm run board` dies with a missing
`@playwright/test`.

```bash
npm install --prefix "${CLAUDE_PLUGIN_ROOT}"
```

**If `$CLAUDE_PLUGIN_ROOT` is empty**, it is the directory two levels above this `SKILL.md` — the one
containing `.claude-plugin/plugin.json` and `tools/`. Substitute that path in every command below.

## 1. Start the board

```bash
npm run board          # serves on http://localhost:4173
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

## 3. Crawl the app into rows

Crawl visits each route, screenshots it, and drafts a **guessed** `prd.md` per new route. A crawled PRD
is marked `guess: true`: it is a proposal for the CEO to correct, never canon, and its draft and screen
cells stay unapproved so the loop still starts at **gate A**. Rerunning finds new routes without
touching a screen the CEO has already worked. Nothing found is the greenfield case — the same flow, no
rows, and a prompt to write the first PRD by hand.

## 4. Find the contradictions already in the requirements

Once there are a few PRDs, open the **Conflicts** tab and **Rescan**. It reads every `prd.md` and
surfaces one-fact-stated-two-ways contradictions for the CEO to adjudicate. **Do not decide on the
user's behalf** — choosing a canonical side is the CEO's gate. Surface what you found and ask.

Then stop and report: what the board contains, how many rows are still guesses waiting to be corrected,
and any contradictions the scan found.
