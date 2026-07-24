# plugin-spec

**One truth, and every behaviour proven.**

You have a codebase and an AI agent. What you do not have is a written statement of how any of it is
supposed to work — so when you ask the agent to change something, it reads the code, infers the intent,
and guesses. Different sessions guess differently. That is what "the feature randomly changed" is.

This plugin builds a requirement source-of-truth **out of the code you already have**, and then keeps it
true after implementation. Two jobs, only two:

1. **One truth** — the spec must not contradict itself, because when it does the agent picks a side
   *silently*.
2. **Every behaviour proven** — each expected behaviour has a test. All green = safe to iterate.

It does that by putting a **briefing in front of every edit**: before the agent writes to a file, it is
told what governs that file, what the requirements are, what proves each one, and what contradictions
touch the area. If nothing governs the file, it stops and asks you.

---

## Install

```bash
/plugin marketplace add chinglaishu/claude-plugin-spec
```

```bash
/plugin install plugin-spec@plugin-spec
```

Then, in the repo you want governed, run the **`kg-init`** skill:

```
Use the kg-init skill to set this project up.
```

> **If you set it up by hand, do this first.** The plugin ships source, not `node_modules`, and the
> briefing hook hides its own errors — so a plugin missing its dependencies looks installed and does
> nothing at all.
>
> ```bash
> npm install --prefix "${CLAUDE_PLUGIN_ROOT}"
> ```

## What `kg-init` does

1. **Installs the plugin's dependencies.**
2. **Writes `kg.config.json`** at your repo root — the topology, where your tests live, where artifacts
   go. The tool *refuses to guess* a layout: guessing wrong emits a complete, confident, wrong graph.
3. **Builds the first graph.** On a repo with no specs this is thin — tests and little else. That is the
   honest starting point, not a failure.
4. **Freezes the ungoverned baseline** — see below.
5. **Scans for contradictions** and reports what it found.

It will not *decide* requirements on your behalf. It will happily **draft** them from your code
(`kg-draft-spec`) so you start from something to correct — but every draft is marked unapproved until
you say otherwise. Requirement meaning is your gate, and an approval of words nobody understood is not
a gate.

## What the briefing prints

Before any edit, the agent is handed one of three answers about the file.

**Governed** — there is a written statement of correct behaviour:

```
# Governing context — src/config.ts

## Governed by
- Graph core — discovery, parsing, ids (.github/system-design/KG_CORE.md)

## Requirements — 5
- `REQ-KG-CORE-02` Every path-bearing node id is namespaced repo:bare … — proven by main:src/config.test.ts
- `REQ-KG-06` A doc's markdown sections are classified deterministically … — **NO COVERING TEST — no safety net here**

## ⚖ Conflicts touching this area — 1
- [high] how a node id's repo namespace is decided

## Before changing behaviour here
1. Change the requirement first — never the code first.
2. Make its covering test red, then green.
3. `npx vitest run` must be green before you stop.
```

Two things there matter more than the rest. **NO COVERING TEST** means nothing will catch you if this
edit is wrong. A **conflict** means two sources disagree about this area — and the agent is told not to
pick a side.

**⛔ Halt** — nothing governs the path, and it is not excused:

```
# Governing context — src/brand-new-thing.ts

## ⛔ STOP — Nothing governs this path — stop and ask the CEO for a requirement before writing code.

Do not write code here. Ask the CEO for a requirement first.
```

**⚠ Grandfathered** — nothing governs it, but it already existed when you installed:

```
## ⚠ Ungoverned — but grandfathered

No spec governs this path. The frozen baseline already records this path as ungoverned, so editing it
is legal. (§10.3)
There is no statement of correct behaviour here, so anything you change is a guess.
```

## Halt vs grandfathered — the ratchet

You cannot govern a whole existing codebase on day one, and a tool that halted you out of your own repo
on install would just get uninstalled. So:

> **Existing untouched code stays legal. New ungoverned code stops.**

`kg-init` freezes every currently-ungoverned path into
`<artifactDir>/ungoverned-baseline.json`. Those paths are **grandfathered** — editable, with a warning
that you are guessing. Anything *not* in that file and *not* governed **halts**.

The count may fall, never rise:

- The generator **refuses to overwrite** an existing baseline. Re-freezing to clear a halt is how a
  ratchet quietly stops meaning anything.
- When a path earns a requirement, prune it out — the only sanctioned way the file changes:
  ```bash
  npx tsx "${CLAUDE_PLUGIN_ROOT}/src/ungovernedBaselineCli.ts" --prune
  ```

**The file's absence is not the same as an empty file.** Absent means "this project has never been
governed" and nothing ever halts. Empty means "nothing is excused" and everything ungoverned halts.

## The skills

| skill | what it is for |
|---|---|
| `kg-init` | First run in a new repo. Config, first graph, frozen baseline, first scan. |
| `kg-staff` | The staff prompt: how to find what governs a file, and the three times to stop. |
| `kg-scan-conflicts` | Find contradictions — one fact stated two incompatible ways — and file them for you to adjudicate. |
| `kg-fix-conflicts` | Apply your adjudications: rewrite the losing docs, fix the losing code test-first. |
| `kg-spec` | Draft requirements and declare what code they govern. You approve the text. |
| `kg-draft-spec` | Bootstrap: read the code and write draft requirement docs, so a repo with no specs starts from something to correct rather than a blank page. |
| `kg-e2e` | Author an end-to-end test that proves a named requirement, spec and catalog entry together. |
| `add-test` | Guided, question-driven version of the above for someone who does not know the tooling. |

## Commands

```bash
npm run build     # rebuild the graph, report and viewer
```

```bash
npm run check     # the gate: graph matches a rebuild, and no issue kind rose above its baseline
```

```bash
npm run serve     # the viewer — decision inbox, test catalog, run buttons
```

## Contradictions are the interesting part

The scan does not grep for keywords, and it does not read your whole tree. It enumerates a **bounded**
set of candidate pairs and adjudicates only those — that bound is where the precision comes from:

| pair | comes from |
|---|---|
| doc ↔ doc | two docs that reference each other |
| doc ↔ code | a doc and the code it declares it governs |
| requirement ↔ test | a requirement and the test claiming to prove it |
| **code ↔ code** | **two files declaring the same symbol — needs no docs at all** |

That last row is the one that matters if you arrived with no specs. Two files declaring the same
constant with different values, the same rule with two formulas, the same enum missing a case on one
side — those are decisions nobody ever made, sitting in your codebase, resolved differently depending
on which file a reader opens first. Adjudicating them is how a bare repo gets its first requirements.

And if you would rather start from a draft than a blank page, the `kg-draft-spec` skill reads the code
and writes requirement docs for you. They land as `status: draft`, and the briefing marks every one of
them **UNAPPROVED DRAFT — describes what the code does, not what it should**. That warning is not
decoration: a requirement written from an implementation cannot contradict it, so if the code has a
bug, the draft records the bug as intent. The value is entirely in what you change.

A finding is one subject, two or more positions, every participant quoting the exact text it holds:

```
[high] how a node id's repo namespace is decided
  A  a fixed table baked into the tool          — .github/system-design/KG_CORE.md, REQ-KG-CORE-02
  B  the project's declared repos[] topology    — src/config.ts, src/config.test.ts
```

You pick the canonical side. `kg-fix-conflicts` then makes every other side agree — docs by editing the
text, code by writing a failing test first. **The agent never picks.** Picking silently is the disease
this whole tool exists to cure.

Five real contradictions beat thirty maybes, so the scan is tuned hard toward precision. "No conflict
found" is a real answer.

## Requirements

Node 20+, and a repo you are willing to have opinions about.
