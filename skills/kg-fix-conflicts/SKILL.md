---
name: kg-fix-conflicts
description: Apply the CEO's resolved contradiction decisions — for each finding they marked RESOLVED with a canonical position, rewrite every dissenting doc to match and fix every dissenting code path via a failing test first. Use after conflicts have been triaged in the viewer's Conflicts tab. Reads only real recorded decisions and never invents a canonical answer.
---

# Applying the adjudication

The CEO chose which side is canon. Your job is to make every other side agree — nothing more. You never
choose, and you never touch a finding they have not resolved.

## 1. Read the plan

From the project root. (If `$CLAUDE_PLUGIN_ROOT` is empty, it is the directory two levels above this
`SKILL.md`.)

```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/src/fixPlan.ts"
```

Prints `{ count, plans: [{ findingId, subject, scope, canonicalStatement, note, targets }] }`. Each
`target` is a participant that **dissents** from the canonical position:

- `via: "doc-edit"` — a doc, requirement or test stating the losing position. Fix by editing text.
- `via: "code-tdd"` — code whose behaviour matches the losing position. Fix by changing behaviour, which
  means a failing test first.

If `count` is 0, say there are no resolved findings to apply and stop. Open and dismissed findings are
not yours to act on.

**`note` is the CEO's instruction and it rides on top of the canonical statement.** If it narrows or
qualifies the choice, follow the note. If the note and `canonicalStatement` genuinely conflict, stop and
ask — that is a decision, not an edit.

## 2. Apply each target

### `doc-edit`

Open `ref` (at `span` if given), find the text matching `quote`, rewrite that passage so it agrees with
`canonicalStatement`. **Surgical.** Do not rewrite the file, do not restructure around it.

If the target is a **requirement's text**, that is a requirement-semantics change — the CEO already
approved it by resolving the finding, so make the edit, but keep the new text to exactly what they
chose. Do not improve it on the way past.

Say why in the doc when the correction is not self-evident. A spec quietly conformed to the code is how
a requirement becomes false without anyone noticing.

### `code-tdd`

This changes real behaviour, so it runs the full loop:

1. Check what governs the file first:
   `npx tsx "${CLAUDE_PLUGIN_ROOT}/src/agentContextCli.ts" <path>`
2. **Write a failing test that pins the canonical behaviour. Run it. Watch it go red** — for the right
   reason. A test that was green before you changed anything proves nothing about the fix.
3. Make the smallest change that turns it green.
4. Run the whole suite. **Never weaken, skip or delete a test to get there.**

If a `code-tdd` target turns out to be more than a small change, leave that finding resolved-but-applied-
partially and **say so explicitly**. Do not report it done.

## 3. Re-scan and rebuild

```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/src/scanContext.ts" --scope <scope>
npm run build
```

Re-adjudicate the scope with `kg-scan-conflicts`. The resolved finding should no longer surface — its
participants now agree. If it still does, something dissents that was not in the plan; report that
rather than editing until the scanner goes quiet.

## 4. Commit file-scoped

Stage exactly the files you edited, plus the rebuilt graph artifacts. **Never `git add -A`** — another
agent may be working in this repo, and a blanket stage has already swept in-flight work into an
unrelated commit before. Name the finding's subject in the message.

## Do NOT

- Touch an `open` or `dismissed` finding.
- Change code without a failing test first.
- Guess the canonical answer, or "improve" it. It comes from the CEO's decision.
- Re-run the scan until it goes quiet. Silence bought by editing is not agreement.
