---
name: kg-update
description: Use when a project already has specboard scaffolded (a spec/ board and vendored tools/) and a newer specboard release should be brought in. Safely updates the vendored board code — updating untouched files, preserving files you have locally edited, and restarting the board on the new code. Use after the plugin itself is updated, or whenever a scaffolded project is running an older board than the installed plugin.
---

# Updating a scaffolded project to a new specboard release

> **Where the board lives.** THE RULE (the human, 2026-09-05: "we only store things in codebase if it's
> necessary, otherwise find a way to store somewhere else"): a project's board is the folder
> **`specboard/` inside the app repo, COMMITTED — authored files only**: `spec/<screen>/prd.md`,
> `test.spec.ts`, `steps.ts`, `narration.json`, `spec/_conflict-decisions.json`, `spec/_specboard.json`.
> The vendored `tools/`, `board.html` and `node_modules` sit in the same folder, but the folder's own
> `.gitignore` keeps them out (a byte copy of the plugin is not a second thing to commit), and
> `spec/_config.json` stays out too — it is per machine and its sign-in script may carry a credential.
> **Everything a run DERIVES lives in `~/.specboard/<projectId>/`** — the fold, the run log and the raw
> report as rows in `board.db`, and every frame, replica, skeleton, font and video as
> `blobs/<sha256>.<ext>`, gc'd by reference at each fold. Out of every git by location, not by a
> `.gitignore` line. Nothing derived is ever committed anywhere. From the app repo, **`cd specboard`**
> for every command below. (Supersedes the 2026-09-04 whole-folder ignore: that rule existed to keep
> the harvest out of the app repo, and the harvest is no longer there. A project scaffolded before this
> may still have a `/specboard/` line in the app's `.gitignore` — removing it is the owner's call, and
> an update never edits an app repo's ignore file.)
> Two exceptions you may meet: a one-line `.specboard` file naming a board kept elsewhere (cd there
> instead), or an old flat project with `spec/` at the root (stay put). `update.mjs` and `scaffold.mjs`
> find the board themselves either way.

specboard vendors its board code (`tools/`, the `spec/_*` harness, `playwright.board.ts`) **into** a
project. Updating the plugin updates only the skills — never a project's vendored copy — so a project
silently runs whatever board code it was scaffolded with until this brings it forward. It updates the
files you have not touched, and for a file you *have* edited that also changed upstream it keeps yours
and drops the new one alongside as `<file>.new` for you to merge. It never loses an edit and never
silently ships stale code.

Run this **from the project's own directory** (the scaffolded repo), not from the plugin.

## 1. Is an update even due?

```bash
#  plugin version (the target):
cat "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json" | grep '"version"'
#  project version (what it runs now), if it has a manifest:
cat spec/_specboard.json 2>/dev/null | grep '"version"'
```

If `$CLAUDE_PLUGIN_ROOT` is empty it is the directory two levels above this `SKILL.md` (the one with
`.claude-plugin/plugin.json`). If the two versions match, stop — the project is current.

## 2. Run the update

**If the project has `spec/_specboard.json`** (scaffolded by a recent specboard), just run it — the
manifest is the base-of-record:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/update.mjs" .            # add --dry-run first to see the plan
```

**If it has NO manifest** (scaffolded before manifests existed), the tool cannot tell your edits from
old code. Establish the base: find which cached release the project's files match most closely, and
pass it as `--from-dir`.

```bash
# score each cached release by how many vendored files match the project exactly; highest wins
for V in "$HOME/.claude/plugins/cache/specboard/specboard/"*/; do
  n=0
  for f in tools/serve-board.mjs tools/build-board.mjs spec/_results-reporter.mjs playwright.board.ts spec/_base.ts; do
    [ -f "$f" ] && [ -f "$V/$f" ] && cmp -s "$f" "$V/$f" && n=$((n+1))
  done
  echo "$n  $V"
done | sort -rn | head -3
```

Take the highest-scoring version dir and pass it (the update writes the manifest afterwards, so this
guessing happens only once per project):

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/update.mjs" . --from-dir "$HOME/.claude/plugins/cache/specboard/specboard/<VER>" --dry-run
node "${CLAUDE_PLUGIN_ROOT}/tools/update.mjs" . --from-dir "$HOME/.claude/plugins/cache/specboard/specboard/<VER>"
```

The tool prints what it **added / updated / left unchanged (your edits kept) / conflicted**, and exits
non-zero (2) while any conflict is unmerged.

## 3. Merge each conflict

For every `<file>.new` the tool wrote, your version is still in place and the new one sits beside it.
Merge them **by graft, not by wholesale replace**: read both, and carry your local edits onto the new
version — that is the only reason the file conflicted. Then delete the `.new`.

- Diff to see exactly what each side changed: `diff <file> <file>.new`.
- A difference that is your customization (a `baseURL`, a `signIn`, forced-headless runs, a UI tweak)
  → carry it onto the new file.
- A difference that is just the file being older than the new release → take the new version's form.
- When done: the merged content lives in `<file>`, and `rm <file>.new`.

Do not skip a conflict silently. If you cannot confidently merge one, say so and leave the `.new` in
place with a note — a half-merged board is worse than an honestly-flagged one.

## 4. Coming from 0.44.x or earlier — install the store's deps, import the harvest once, flip the ignore

Specboard **0.45.0** moved everything a run derives out of every repository and into the project's data
home, `~/.specboard/<projectId>/` (the human, 2026-09-05: "we only store things in codebase if it's
necessary, otherwise find a way to store somewhere else"). Three one-time steps, in this order, and only
when the version you came FROM is below 0.45.0.

```bash
npm install                       # the update added better-sqlite3 (the db driver) and pg; without them
                                  # the board throws "the sqlite driver needs better-sqlite3" on its first page
node tools/store-import.mjs       # moves the committed fold + every evidence file into the data home.
                                  # Idempotent, and it never deletes or edits anything in the repo.
```

The importer prints how many blobs landed, how many paths it rewrote, and every path it could not find
(a path that names no file is left exactly as written and reported — an entry that lied before lies the
same way after, visibly). Read that list before going on: a long `missing` run usually means it was run
from the wrong directory.

Then the repo stops tracking what is now in the data home. The update refreshed the board folder's own
`.gitignore` (or left a `.gitignore.new` to merge — keep every line of the new one), so:

```bash
git rm -r --cached --quiet board.html $(git ls-files | grep -E '/(evidence|viz)/|/screen\.png$|/crawl\.png$|_results(-index)?\.json$|_runs\.json$')
rm -rf spec/*/evidence spec/*/viz board.html spec/_results.json spec/_results-index.json spec/_runs.json
```

**And the board folder itself is COMMITTED now** — authored files only. If the app repo's `.gitignore`
carries a `/specboard/` line from an earlier release, removing it is what puts the project's PRDs and
tests into its history; it is the owner's decision, so raise it rather than doing it silently, and never
edit an app repo's ignore file as a side effect of an update.

## 5. Rebuild, restart, verify — the update is not done until the live server runs new code

```bash
npm run board:build          # regenerate board.html with the new renderer
```

If `tools/build-board.mjs` was itself a conflict you have not merged yet, say so — the rebuild is
running the *old* renderer until you do.

**Restart the board server.** A vendored board usually runs as a plain `node tools/serve-board.mjs`
(not `--watch`), so it will keep serving the OLD server code until restarted — the page would look
updated while the server is stale. Restart it on its own port (never assume 4173; use whatever port it
was on):

```bash
PORT=<the board's port>
SRV=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN | awk 'NR==2{print $2}')       # the LISTENER, not a client
ps -o command= -p "$SRV" | grep -q serve-board && kill "$SRV"          # only after confirming it IS the board
sleep 1
BOARD_PORT=$PORT nohup npm run board > board.log 2>&1 &                # detached under --watch, survives your shell
```

Another session may be using that board — if stopping it would interrupt visible work, say so first.

**Verify from the running server, not the files.** Confirm the live server is on the new code:

```bash
curl -s "http://localhost:$PORT/api/runs" | grep -c runningId          # 0.5.0+ answers with runningId; 0 means still old
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:$PORT/"     # 200
```

Report plainly: what updated, what still needs a merge (if anything), and that the live server is now
on the new version. If a run of yours could not restart the board, say so rather than let the user
think it is broken.
