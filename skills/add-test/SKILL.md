---
name: add-test
description: Guided, question-driven flow to register an end-to-end test in the graph — picks the case id, asks which docs and requirements it proves, writes the case entry, and scaffolds the spec file if it does not exist yet. Use when someone says "add a test", "register my test", or wants a test to show up in the viewer with a Run button. The friendly counterpart to kg-e2e; ask, do not lecture.
---

# Add a test — guided

Someone wants their test to show up in the graph. They may or may not have written the Playwright code
yet, and they may not know what a case entry or a requirement id is.

**Persona: a friendly senior test engineer.** Plain language. Never use "case yaml", "requirement",
"covers" or "verifies" without a one-line explanation the first time. Offer choices rather than asking
for free text — every id, filename, doc and requirement can be picked from what is already in the graph.

If they typed a description after the command, use it and only ask for what is still missing.

## 1. Read the project before asking anything

Read `kg.config.json` for `e2eDir` and `artifactDir`, then the graph at
`<artifactDir>/knowledge-graph.json`. From it derive — do not assume:

- the **areas**: the features in the project's `*.features.yaml`, and the existing `<e2eDir>/cases/*.cases.yaml` files;
- the **id prefixes** already in use, and the highest number for each;
- candidate **docs** and **requirements** to link.

There is no fixed list of areas. A project's areas are whatever it registered.

## 2. One form, three questions

Use **AskUserQuestion**, batched into a single form:

1. **Which area is this test for?** — options from the areas you just derived.
2. **Does the test code already exist?** — "Yes, I've written it" / "No, scaffold me a starter".
3. **In plain English, what does this test prove?** — free text.

## 3. Find or scaffold the spec

**If it exists:** list the spec files for that area and pull the real `test("…")` titles out of them.
Offer the titles as options, plus "none of these — I'll paste it". Note which file each came from.

```bash
grep -ohE 'test\("[^"]+"' <e2eDir>/*.spec.ts | sed 's/test("//'
```

**If it does not:** suggest a title and a filename, confirm both, then write:

```ts
import { test, expect } from "@playwright/test";

test("<the agreed title>", async ({ page }) => {
  // TODO: implement — the linked case entry says what this must prove.
  throw new Error("Not implemented — see the linked case for the intent");
});
```

The `throw` is deliberate and worth explaining to them in one sentence: a stub that silently passes
reports safety that does not exist, which is worse than no test at all.

## 4. Pick the id yourself

Take the area's prefix, find the highest existing number, add one. **Announce it, do not ask:**
"I'll register this as `CHK-5`."

## 5. A small optional form

Use **AskUserQuestion** again:

1. **Which spec doc does this prove?** — offer the handful of docs whose title or body best matches
   their description, plus "none". (In graph terms this is `verifies`; say it as "which written spec
   your test proves is working".)
2. **Which requirement does it cover?** — the `REQ-*` ids those docs specify, plus "none" and "paste
   one". (Say it as "the specific behaviour we've committed to".) Prefer one currently showing as
   uncovered — that is a real gap being closed.
3. **Add step-by-step details?** — "skip" or "yes, I'll describe the flow". If yes, take their
   description and normalise it into 2–4 `{action, expected, screenshot}` steps.

## 6. Write the entry and rebuild

Append to `<e2eDir>/cases/<area>.cases.yaml` — **append, preserving everything already there**:

```yaml
- id: <PREFIX-N>
  title: <one-line summary from their description>
  status: todo
  spec: <spec filename>
  playwrightTitle: "<exact test() title>"
  verifies: [<doc ids>]
  covers: [<REQ ids>]
  steps:
    - action: <…>
      expected: <…>
      screenshot: <lowercased-id>-01.png
```

Omit any list that is empty — do not emit `verifies: []`. Omit `steps:` entirely if they skipped it.
Leave `status: todo`; only a recorded run may set a pass.

Then rebuild once, at the end — not after every step:

```bash
npm run build
```

If it fails, it is almost always YAML indentation. Read the error, fix it, tell them what it was.

## 7. Tell them what happened, and what is still theirs

Plainly, no jargon:

- the id you registered, and where to see it (`npm run serve`, then the test catalog);
- that the ▶ Run button drives the real browser, if the test is real;
- if you scaffolded a stub: the file to open and the `throw` line to replace — it fails loudly on
  purpose;
- the exact `git add` command for the files that changed. **They commit, not you.**

## Do NOT

- Rebuild the graph more than once.
- Ask for free text where a picker will do.
- Commit anything, or stage with `git add -A`.
- Set a `status:` other than `todo`.
- Lecture. One sentence of explanation, then move on.
