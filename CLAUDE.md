# claude-plugin-spec

A tool that **builds** a requirement SSoT out of a codebase — and keeps it **true after
implementation**. The user arrives with code and an AI agent; the tool writes the spec and the
Playwright tests. Two jobs, and only two:

1. **One truth** — the SSoT must not contradict itself, because when it does the AI picks a side
   *silently*, and different sessions pick differently. That is what "the feature randomly changed" is.
2. **Every behaviour proven** — each expected behaviour has a Playwright test. All green = safe to iterate.

Scope is **(3) AI coding + (4) launch/iteration**. Not idea→PRD, not wireframe — Claude conversation and
Figma own those. Do not widen this.

**North star: [`docs/superpowers/specs/2026-07-17-founding-design.md`](docs/superpowers/specs/2026-07-17-founding-design.md).**
Read it before any non-trivial change. It holds the scope, the CEO ↔ staff model, the two languages for
requirements, and twelve locked decisions with the evidence behind each.

## You are staff. The human is the CEO.

The CEO writes the requirement SSoT, answers only the decisions you can't make, and reviews at
milestones. You work to the doc. **Their only gate is approving requirement text** — so don't make them
read, don't make them watch, and don't ask permission to work.

## The rules

1. **Before touching code, find what governs it** — spec, requirements, covering tests, known conflicts.
2. **Nothing governs it → STOP. Ask the CEO for a requirement.** Never write ungoverned code: the next
   person to change it has no guideline for how it should work, and that is where the bug is born.
3. **Two sources disagree → STOP. Ask the CEO which is canon. Never pick a side.**
4. **Write the failing test first**, for new or changed behaviour. Not ceremony — the thesis. A test
   written after the code can only confirm the code, never contradict it. *Exempt:* the ported tests,
   pure refactors (the fingerprint is the test), spikes.
5. **Never weaken, skip, or delete a test to go green.**
6. **Tidy docs freely** — structure, typos, dead links, stale counts.
7. **Requirement *semantics* need CEO approval**: a new REQ, changed REQ text, a deleted REQ, or choosing
   a canonical side. **You edit prose; the CEO owns meaning.**
8. **Correct docs in place, with the reason attached.** When the code teaches you a spec was wrong, fix
   the spec and say why. Conforming the doc to the code is how a requirement quietly becomes false.

Escalate only for 2, 3 and 7.

**This project's ceremony is its own.** DojoStack's rules do not apply here: no Stop hooks, no mandatory
review agent, no soc-gate.

## State

- **REQ-0 went GREEN and RETIRED 2026-07-17** (CEO): it was the migration acceptance criterion, and
  phase 2 completed it — topology, paths and artifact dir are all configuration, the word `dojostack`
  appears nowhere in `src/`, and the fingerprint against `dojostack_main` was byte-identical
  throughout.
- **REQ-1 is its successor, and it is GREEN.** *"The committed fixture projects — one-repo and
  multi-repo — build to their committed expected graphs, byte-identical, on any machine, with no
  access to any private codebase."* The fixtures live in `fixtures/`; `src/fixtureRepo.test.ts`
  asserts them; `npx tsx scripts/fixture-expected.mts` recaptures the expected graphs — **a committed
  claim to re-review on any deliberate change, never a cache to refresh blindly.** The suite is fully
  green (480 tests, 59 files, **nothing skipped**).
- **The oracle — use it on every change that could move the graph.** The graph is a pure function of
  the tree, so a refactor must leave it **byte-identical**:
  `npx tsx scripts/fingerprint.mts <repo-root> [config.json]` (defaults to
  `scripts/dojostack.kg.config.json`, the migration fixture — DojoStack's layout as config, which is
  what it will own at phase 5). Capture from an unmodified tree *before* you start, refactor without
  touching indexed content, assert unchanged. **The method is the contract, not any particular hash**
  — it moves whenever the target tree changes, so never compare against a hash written down on
  another day.
- **Config is threaded, never a singleton** (§10.8). Entrypoints resolve the project from `cwd`
  (`KG_REPO_ROOT` overrides), call `loadConfig(repoRoot)` once, and pass it down. `loadConfig` throws
  when `kg.config.json` is absent — it must not guess a layout, because guessing wrong emits a
  complete, confident, wrong graph.
- **Two things are `TOOL_DIR`, not the project** (`src/toolDir.ts`): the viewer template, and the
  tool's own `src/` when it spawns itself. Everything else the tool reads or writes belongs to the
  project and hangs off `config.artifactDir` / `config.e2eDir`.
- **Pre-existing and not yours:** ~20 `tsc --noEmit` strictness errors in `parseResults.test.ts` and
  `applyEvidence.test.ts`, present since the port (`917a01d`). The suite runs under `tsx`, which does
  not typecheck, so they have never been surfaced. Harmless; unowned.
- **The name is a placeholder, deliberately** — CEO 2026-07-17: keep it for now, rename later. The
  rename is a phase-4 gate: nothing publishes under it (founding design §12.4).

## Next

Phases 3 and 4 run as **one loop** (founding design §11, CEO-approved): wire the `agent-context`
hook into this repo, self-host (own config, own graph, own gate), and dogfood whether the staff
prompt actually changes behaviour — measured per §5. Also queued: the two flow-approval spikes
(§12.3), conflict-scan precision on the DojoStack corpus (§12.10), and a gate flake policy draft
(§12.12).

## Commands

```
npx vitest run                 # the suite
npx vitest run src/x.test.ts   # one file
```
