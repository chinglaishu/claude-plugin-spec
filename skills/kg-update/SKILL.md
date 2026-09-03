---
name: kg-update
description: Use when a project already has specboard scaffolded (a spec/ board and vendored tools/) and a newer specboard release should be brought in. Safely updates the vendored board code — updating untouched files, preserving files you have locally edited, and restarting the board on the new code. Use after the plugin itself is updated, or whenever a scaffolded project is running an older board than the installed plugin.
---

# Updating a scaffolded project to a new specboard release

> **Where the board lives.** A project keeps its board either **in** the app repo (the default: `spec/`,
> the vendored `tools/`, `board.html` beside the code) or **beside** it as a *sidecar* — then the app
> repo carries exactly one file, `.specboard`, whose single line is the path of the board directory
> (e.g. `../myapp_specboard`). If the repo you are in has `.specboard`, **`cd` into the directory it
> names before every command below** — `spec/`, `tools/`, `npm run …` all live there, and nothing
> specboard-related belongs in the app repo. `update.mjs`/`scaffold.mjs` follow the pointer themselves.

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

## 4. Rebuild, restart, verify — the update is not done until the live server runs new code

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
