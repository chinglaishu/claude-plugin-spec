---
name: kg-init
description: Use when this plugin has just been installed in a project, or when a repo has no kg.config.json / no knowledge graph yet. Sets up the config, builds the first graph, and freezes the ungoverned baseline so the briefing hook does not halt on existing code.
---

# Onboarding a project

The user arrives with a codebase and an AI agent — **nothing else** (founding design §1). No spec, no
tests, no `governs:` declarations. Your job is to get from that to a graph they can actually consult,
without demanding they write anything first.

## 0. Install the plugin's own dependencies — first, always

The plugin ships source, not `node_modules`. Until this runs, every entrypoint dies with
`Cannot find package 'micromatch'` — and the briefing hook swallows the error, so the plugin looks
installed and silently does nothing.

```bash
npm install --prefix "${CLAUDE_PLUGIN_ROOT}"
```

**If `$CLAUDE_PLUGIN_ROOT` is empty**, it is the directory two levels above this `SKILL.md` — the one
containing `.claude-plugin/plugin.json` and `src/`. Substitute that path in this and every later
command; do not go hunting for the plugin under a guessed install directory.

Confirm it worked before going further:

```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/src/agentContextCli.ts" README.md
```

Anything other than a `Cannot find package` crash means you are good.

## 1. Declare the topology

Write `kg.config.json` at the workspace root. The tool **refuses to guess a layout**, because guessing
wrong emits a complete, confident, wrong graph.

Single repo (the common case):

```json
{
  "repos": [{ "name": "main", "subdir": "" }],
  "e2eDir": "e2e",
  "artifactDir": "knowledge-graph",
  "unitTestGlobs": ["src/**/*.test.ts"]
}
```

Multi-repo: one entry per repo, exactly one with `subdir: ""`. Set `unitTestGlobs` to wherever their
tests actually live — look, do not assume. Add `exclude` for any committed fixture or sample project,
or its docs get indexed as the host project's own knowledge.

## 2. Build the first graph

```bash
npm run build
```

Expect it to be thin. A repo with no `.github/system-design/` docs produces a graph of tests and
little else — that is the honest starting point, not a failure.

## 3. Freeze the baseline

Everything currently ungoverned must be recorded as legal, or the briefing halts on every file the
user touches (§10.3: *existing untouched code stays legal; new ungoverned code fails*).

```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/src/ungovernedBaselineCli.ts"
```

That writes `<artifactDir>/ungoverned-baseline.json` — a plain JSON array of the paths nothing governs
today. Commit it. From here a **new** ungoverned path halts the briefing while every existing one stays
legal.

Until this file exists the pack sees no baseline, reads the project as never-governed, and grandfathers
everything forever — so the gate never engages at all.

**Never regenerate this to make a halt go away.** It is frozen on purpose: the count may fall, never
rise, and the command refuses to overwrite an existing baseline for exactly that reason. Once a path
earns a requirement, `--prune` drops it — the ratchet turning the right way.

## 4. Find the truth already in the code

This is the part that makes the SSoT exist without asking the user to write a spec. Run the
**`kg-scan-conflicts`** skill. Each adjudication the user makes becomes a canonical position, and the
SSoT accretes from there.

```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/src/scanContext.ts" --scopes
```

On a repo with no docs the doc-anchored surface is empty, and the **code↔code** surface is not: pairs
come from files declaring the same symbol, so the scan finds the same rule implemented twice with two
different answers. That is where the first requirements come from — each contradiction the user
adjudicates is a decision that was previously implicit in whichever file the reader happened to open.

Run it **without** `--scope` on a bare repo; `--scope` narrows to a doc domain, which does not exist yet.

Then stop and report:

- what the graph contains
- how many paths are ungoverned (the baseline size)
- any contradictions the scan found

**Do not DECIDE requirements on the user's behalf.** Requirement semantics are the CEO's gate. Surface
what you found and ask.

If they would rather start from a draft than a blank page, offer `kg-draft-spec`: it reads the code and
proposes requirement docs as `status: draft`, which the briefing marks as unapproved. Drafting is not
deciding — a requirement read off an implementation cannot contradict it, so it is a starting point to
correct, never an answer.
