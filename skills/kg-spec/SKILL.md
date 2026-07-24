---
name: kg-spec
description: Author or backfill product requirements as frontmatter in a system-design doc, and declare which code that doc governs, so they become REQ-* nodes in the graph. Use when the briefing halted on an ungoverned path, when a new behaviour needs a requirement before code, when the CEO has adjudicated a conflict and the winning position needs to become a requirement, or when backfilling requirements onto a doc that shows as unverified.
---

# Writing the requirement, not the code

A requirement is one testable assertion about behaviour, living in the doc that owns that behaviour.
There is no parallel registry. Two places to state a requirement is two places to disagree.

**You draft; the CEO approves.** Requirement *semantics* — a new REQ, changed REQ text, a deleted REQ,
choosing a canonical side — are the CEO's only gate. Never stamp requirement text they have not seen.
Show them the block, not an essay about the block.

## When you get here

- **The briefing halted**: `⛔ STOP — Nothing governs this path`. Something is about to be built with no
  statement of correct behaviour. This is the main entry point.
- **A conflict was resolved** and the canonical position needs to become a requirement.
- **A doc shows as `unverified-doc`** — prose describing behaviour with no `requirements:` block.

## 1. Find the owning doc

(If `$CLAUDE_PLUGIN_ROOT` is empty, it is the directory two levels above this `SKILL.md`.)

```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/src/agentContextCli.ts" <the/path/in/question>
```

The tool indexes docs under `**/.github/**/*.md`, `**/system-design/**/*.md` and `**/memories/**/*.md`.
Which existing doc owns this behaviour? If none does, create one — match the shape of the project's
existing docs; do not invent a new template.

Read `<artifactDir>/digest/<area>.md` first (`artifactDir` comes from `kg.config.json`). It lists the
REQ ids already in play, what covers each, and the open gaps — so you neither duplicate an id nor
re-prove something already proven.

## 2. Draft the requirements

```yaml
---
slug: checkout
title: Checkout
domain: <area>
governs:
  - src/checkout.ts
requirements:
  - id: REQ-CHK-01
    text: An order total is the sum of its line items.
  - id: REQ-CHK-02
    text: A voucher never takes an order total below zero.
---
```

- **`id`** is `REQ-<AREA>-<NN>`; `AREA` is a short kebab prefix for the domain, `NN` the next unused
  number in this doc.
- **`text`** is ONE testable assertion, in behaviour terms. If it contains "and", split it. If it names
  a UI state ("the button is disabled"), rewrite it as behaviour ("a second submit does not create a
  second order").
- **Write what must be TRUE, not what the code does.** A requirement derived from reading the
  implementation can only ever agree with it — and a requirement that cannot contradict the code is
  not a requirement, it is a comment.

## 3. `governs:` is the half that turns the gate on

`requirements:` states the behaviour. **`governs:` says which code that behaviour rules.** Without it
the path stays ungoverned, the briefing keeps halting, and the requirement you just wrote governs
nothing.

Targets are globs or path prefixes, relative to the doc's own repo, matched on a path boundary — so
`src/checkout` claims `src/checkout/total.ts` but never `src/checkout_old.ts`.

Claim what the doc actually rules. One doc governing all of `src/` returns every requirement for every
file, and a briefing too noisy to act on is a briefing that gets ignored.

## 4. Get approval, then stamp

Show the CEO the `requirements:` block and the `governs:` list — the actual YAML, short, in one message.
Ask once. On approval, write it into the doc's frontmatter, preserving every other field.

## 5. Rebuild and check what you created

```bash
npm run build
```

The new `REQ-*` nodes appear immediately as **uncovered** — no test proves them yet. That is correct and
expected, not a failure. Closing it is the next step, not this one.

If the requirement covers a path that was in `<artifactDir>/ungoverned-baseline.json`, it can now be
pruned out of it:

```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/src/ungovernedBaselineCli.ts" --prune
```

That is the ratchet turning the right way — the excused count falls. It can never rise, and it must
never be re-frozen to clear a halt.

## 6. Then the test, then the code

In that order. Write the failing test first (`add-test` for a unit test, `kg-e2e` for a user-facing
flow), watch it go red, then implement. A test written after the code can only confirm the code.

## Do NOT

- Stamp requirement text the CEO has not approved.
- Write a requirement by describing what the code already does.
- Add `requirements:` without `governs:` and call the path governed.
- Author a requirement for someone else's doc while they have it open — check `git status` first.
