---
name: kg-e2e
description: Author a new end-to-end Playwright test that is useful by construction — the spec file and its linked case entry written together, structurally 1:1, with verifies/covers/features filled in so it cannot land as an untracked bare test. Use when adding an e2e for a new user-facing flow, or when covering a requirement that currently has no proving test. Not for unit tests — those are tagged by feature path globs.
---

# Authoring a test that proves something

A test is useful here when it (a) proves a named requirement, (b) is watchable so a human can see the
intent, and (c) is reachable in the viewer through typed edges. All three come from writing the spec and
its catalog entry as one unit.

All paths come from the project's `kg.config.json`: `e2eDir` is where the suite lives, `artifactDir`
where the graph and digests are. Read it; never assume a layout.

## 1. Find the anchor first

What does this test prove? Prefer a specific `REQ-*` id. (If `$CLAUDE_PLUGIN_ROOT` is empty, it is the
directory two levels above this `SKILL.md`.)

```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/src/agentContextCli.ts" <the/code/path>
```

Requirements shown as **NO COVERING TEST** are exactly the ones worth closing. `<artifactDir>/report.md`
lists them project-wide.

**If no requirement exists yet, stop and use `kg-spec` first.** A test with nothing to prove is a test
that can only ever assert what the code already does.

## 2. Design the steps before writing code

Draft the case entry first. Working the flow out as `action` / `expected` narration *is* the design of
the test; doing it in TypeScript first means the assertions get shaped by whatever was easy to select.

Append to `<e2eDir>/cases/<flow>.cases.yaml` (create it if the flow has none):

```yaml
- id: <FLOW>-<NN>                        # unique across cases/
  title: <one-line human summary>
  status: todo                           # a real run overwrites this; never hand-set a pass
  spec: <slug>.spec.ts                   # BARE filename
  playwrightTitle: "<exact test() title>"
  verifies: [<doc-slug>]                 # doc(s) this proves
  covers: [<REQ-*>]                      # requirement(s) — populate whenever one exists
  features: [<feature-id>]               # from the project's *.features.yaml
  exercises: [<code path>]               # optional; drives the code overlay
  parallelSafe: true                     # only if it truly shares no state
  steps:
    - action: "<what happens>"
      expected: "<what must be true after>"
      screenshot: "<slug>-01.png"
```

**At least one of `verifies` / `covers` / `features` must be present**, or the test lands untracked and
the gate flags it (REQ-KG-02). That rule exists because a bare test node proves nothing to anyone reading
the graph.

Show the CEO the case entry and get it agreed before writing the spec. It is short, it is readable, and
it is the actual design — this is the artifact worth their thirty seconds.

## 3. Write the spec

At `<e2eDir>/<slug>.spec.ts`. Two hard constraints:

- The `test("…")` title **equals** `playwrightTitle` exactly. Paste it; do not retype. The viewer's
  ▶ Run targets the test by that string.
- The step count in the spec **equals** `steps.length` in the case entry. They are 1:1 by design; a
  mismatch means the narration in the viewer describes something the test does not do.

Reuse the project's own helpers — login, navigation, page objects, any paced-step wrapper it already
has. Do not inline auth logic, and do not introduce a helper convention the project does not use.

## 4. Watch it fail, then make it pass

Run it headed first and actually watch it:

```bash
npx playwright test <e2eDir>/<slug>.spec.ts --headed
```

If the narration and what happens on screen disagree, fix one of them. **Do not silence the mismatch** —
the narration is what a human will trust later.

Then headless. Green on the first headless run is the pass criterion.

If it stays red after honest root-causing, **leave it red** and record why. Never reach for `.skip`,
`test.fixme`, or a blanket `try/catch`. A test weakened to go green is worse than no test: it reports
safety that is not there.

## 5. Record the run, then rebuild

Statuses in the graph come only from a recorded run, never from the `status:` you typed (REQ-KG-03):

```bash
npm run record:run
npm run build
```

Confirm the requirement you targeted now shows a covering test, and that no new untracked e2e appeared.

## Do NOT

- Use this for unit tests. Those are tagged by a feature's `paths:` globs — put the file where a
  registered feature claims it.
- Hand-edit a `status:` to `pass`.
- Land a case with none of `verifies` / `covers` / `features`.
- Let `steps.length` and the spec's step count drift apart.
