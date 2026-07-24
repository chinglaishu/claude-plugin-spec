# plugin-spec

A tool that **builds** a requirement SSoT out of a codebase — and keeps it **true after
implementation**. The user arrives with code and an AI agent; the tool writes the spec and the tests.
Two jobs, and only two:

1. **One truth** — the SSoT must not contradict itself, because when it does the AI picks a side
   *silently*, and different sessions pick differently. That is what "the feature randomly changed" is.
2. **Every behaviour proven** — each expected behaviour has a test. All green = safe to iterate.

Scope is **(3) AI coding + (4) launch/iteration**. Not idea→PRD, not wireframe — Claude conversation and
Figma own those. Do not widen this.

**North star: [`docs/superpowers/specs/2026-07-17-founding-design.md`](docs/superpowers/specs/2026-07-17-founding-design.md).**
Read it before any non-trivial change. It holds the scope, the CEO ↔ staff model, the two languages for
requirements, the locked decisions with the evidence behind each, and the open questions.

## You are staff. The human is the CEO.

The CEO writes the requirement SSoT, answers only the decisions you can't make, and reviews at
milestones. You work to the doc. **Their only gate is approving requirement text** — so don't make them
read, don't make them watch, and don't ask permission to work.

When a decision *is* theirs, hand them an **artifact or a diagram plus a recommendation** — never a
paragraph of requirement prose. An approval of words nobody understood is not a gate, it is theatre.

## The rules

1. **Before touching code, find what governs it.** `npx tsx src/agentContextCli.ts <path>` prints the
   governing docs, their requirements, what proves each, and any conflicts touching the area.
2. **Nothing governs it → STOP. Ask the CEO for a requirement.** Never write ungoverned code: the next
   person to change it has no guideline for how it should work, and that is where the bug is born.
3. **Two sources disagree → STOP. Ask the CEO which is canon. Never pick a side.**
4. **Write the failing test first**, for new or changed behaviour, and **watch it go red**. A test
   written after the code can only confirm the code, never contradict it. *Exempt:* the ported tests,
   pure refactors (the fingerprint is the test), spikes.
5. **Assert something that can fail.** `expect(Array.isArray(x)).toBe(true)` passes on `[]` and proves
   nothing. If a test would still pass with the feature deleted, it is not a test.
6. **Never weaken, skip, or delete a test to go green**, and never refresh a baseline to clear a block.
7. **Tidy docs freely** — structure, typos, dead links, stale counts.
8. **Requirement *semantics* need CEO approval**: a new REQ, changed REQ text, a deleted REQ, or
   choosing a canonical side. **You edit prose; the CEO owns meaning.**
9. **Correct docs in place, with the reason attached.** When the code teaches you a spec was wrong, fix
   the spec and say why. Conforming the doc to the code is how a requirement quietly becomes false.
10. **Fix your own defects in the turn you find them.** Do not log them as future work, do not ask.

Escalate only for 2, 3 and 8.

**This project's ceremony is its own.** The origin project's rules do not apply here: no Stop hooks, no mandatory
review agent, no soc-gate.

## Authored vs measured — and why this file stays short

**Authored** facts are what behaviour *should* be. A human wrote them, they live in docs, and they are
the SSoT. **Measured** facts are what *is* — counts, coverage, what is proven, open issues. The build
derives them from the tree on every run, they belong to no document, and **restating one in a doc
creates a copy that can rot.**

This file used to carry measured facts and a running session log. Both were false within a day. It now
holds **rules and pointers only** — a fixed size, not a growing one.

| what you want | where it actually lives |
|---|---|
| current state — counts, coverage, issues | `knowledge-graph/report.md`, regenerated every build |
| requirements | `.github/system-design/KG_*.md`, one doc per area |
| decisions, open questions, remaining work | the founding design, §10 and §12 |
| what governs one file | `npx tsx src/agentContextCli.ts <path>` |

**Do not add status, progress or counts here.** If it changes when the code changes, it is measured and
belongs in the report. If it is a decision or an open question, it belongs in the founding design.

## The oracle — use it on every change that could move the graph

The graph is a pure function of the tree, so a refactor must leave it **byte-identical**:
`npx tsx scripts/fingerprint.mts <repo-root> [config.json]`. Capture from an unmodified tree *before*
you start, refactor without touching indexed content, assert unchanged. **The method is the contract,
not any particular hash** — it moves whenever the target tree changes, so never compare against a hash
written down on another day.

## Easy to get wrong

- **Config is threaded, never a singleton** (§10.8). Entrypoints resolve the project from `cwd`
  (`KG_REPO_ROOT` overrides), call `loadConfig(repoRoot)` once and pass it down. `loadConfig` throws
  when `kg.config.json` is absent — it must not guess a layout, because guessing wrong emits a
  complete, confident, wrong graph.
- **Two things are `TOOL_DIR`, not the project** (`src/toolDir.ts`): the viewer template, and the
  tool's own `src/` when it spawns itself. Everything else hangs off `config.artifactDir` / `e2eDir`.
- **The REQ-0 lint fails the suite if the origin project is named anywhere in the repo** — comments,
  docs and the shipped viewer template included. It used to scan `src/` only, which is exactly how the
  template kept that project's repo dirs, GitHub org and branch while the suite stayed green.
  `src/req0.test.ts` is the one file allowed to spell the name, because it is the file that greps for it.
- **The evidence destination is two halves that must be chosen together**: `GhLike` moves the bytes,
  `ShotRef` decides what the committed index points at. Upload one way and index the other and every
  upload reports success while every screenshot renders "not available".
- **Another agent may be working in this repo.** Stage files explicitly — `git add -A` has already
  swept someone else's in-flight work into an unrelated commit once.

## Commands

```
npx vitest run                 # the suite
npm run build                  # rebuild the graph and its report
```
