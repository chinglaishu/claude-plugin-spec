# claude-plugin-spec

A tool that keeps a spec **true after implementation**. Two jobs, and only two:

1. **One truth** — the SSoT must not contradict itself, because when it does the AI picks a side
   *silently*, and different sessions pick differently. That is what "the feature randomly changed" is.
2. **Every behaviour proven** — each expected behaviour has a Playwright test. All green = safe to iterate.

Scope is **(3) AI coding + (4) launch/iteration**. Not idea→PRD, not wireframe — Claude conversation and
Figma own those. Do not widen this.

**North star: [`docs/superpowers/specs/2026-07-17-founding-design.md`](docs/superpowers/specs/2026-07-17-founding-design.md).**
Read it before any non-trivial change. It holds the scope, the CEO ↔ staff model, the two languages for
requirements, and ten locked decisions with the evidence behind each.

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

- **REQ-0 is RED** and is the acceptance criterion for phase 2: *"given any repo root supplied as
  configuration, the tool builds a byte-identical graph to the one DojoStack's in-tree copy produces —
  knowing nothing about DojoStack."* `npx vitest run src/req0.test.ts` names every file still failing it.
- **Phase 2.1 is half done.** `src/config.ts` owns the topology; nothing consumes it yet. Next: delete the
  four shadow copies (`repo.ts`, `gitDates.ts`, `sources.ts`, `serve.ts`) and thread it through the six
  parsers.
- **The oracle — use it on every phase-2 step.** The graph is a pure function of the tree, so a config
  refactor must leave it **byte-identical**. `npx tsx scripts/fingerprint.mts <repo-root>`. Capture from
  an unmodified tree *before* you start, refactor without touching indexed content, assert unchanged.
  **The method is the contract, not any particular hash** — it moves whenever the target tree changes, so
  never compare against a hash written down on another day.
- **Known-failing, not yours to be surprised by:** 3 serve tests (`serve.ts` reads the graph from
  `join(__dirname, "..")` — the tool assumes it lives inside the project it measures; phase 2's problem)
  and `req0.test.ts` (the intentional RED).
- **The name is a placeholder** — see the founding design §12.4.

## Commands

```
npx vitest run                 # the suite
npx vitest run src/x.test.ts   # one file
```
