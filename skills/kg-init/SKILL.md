---
name: kg-init
description: Use when this plugin has just been installed in a project, or when a repo has no kg.config.json / no knowledge graph yet. Sets up the config, builds the first graph, and freezes the ungoverned baseline so the briefing hook does not halt on existing code.
---

# Onboarding a project

The user arrives with a codebase and an AI agent — **nothing else** (founding design §1). No spec, no
tests, no `governs:` declarations. Your job is to get from that to a graph they can actually consult,
without demanding they write anything first.

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
user touches (§10.3: *existing untouched code stays legal; new ungoverned code fails*). Write the
current ungoverned paths to `<artifactDir>/ungoverned-baseline.json`.

**Never regenerate this to make a halt go away.** It is frozen on purpose: the count may fall, never
rise. Refreshing it to clear a block is how the ratchet quietly stops meaning anything.

## 4. Find the truth already in the code

This is the part that makes the SSoT exist without asking the user to write a spec. Run the conflict
scan over the codebase (or one domain). It needs **no docs at all** to find code-vs-code
contradictions — the same rule implemented twice, a formula, an enum, a tax basis. Each adjudication
the user makes becomes a canonical position, and the SSoT accretes from there.

Then stop and report:

- what the graph contains
- how many paths are ungoverned (the baseline size)
- any contradictions the scan found

**Do not write requirements on the user's behalf.** Requirement semantics are the CEO's gate. Surface
what you found and ask.
