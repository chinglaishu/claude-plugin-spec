---
name: kg-scan-conflicts
description: Scan a project for semantic CONTRADICTIONS — one fact stated two incompatible ways across docs, code and tests (a formula, an ordering, a default, a definition) — and write them as findings the viewer's Conflicts tab shows the CEO for adjudication. Use when asked to find contradictions or inconsistencies, and as step 4 of kg-init. The comparison surface is enumerated deterministically from the graph's own edges; you adjudicate a bounded candidate set and never free-hunt the tree. This skill IS the AI — the build and viewer never call a model.
---

# Finding the contradictions

One subject, two or more positions, each quoting its source. That is a finding. Everything else is not.

**Precision is the whole product here.** The decision inbox lives or dies on whether the CEO keeps
opening it (founding design §12.10), and it dies the first time they open it and find noise. **Five real
contradictions beat thirty maybes.** "No conflict found in X" is a complete, useful, correct result —
report it and stop. You are not scored on how many findings you produce.

## 1. Get the bounded surface

Everything is resolved from the project's own `kg.config.json`, so run from the project root. (If
`$CLAUDE_PLUGIN_ROOT` is empty, it is the directory two levels above this `SKILL.md` — substitute that
path rather than hunting for a guessed install directory. If the command dies with
`Cannot find package`, the plugin's dependencies were never installed: `npm install --prefix "${CLAUDE_PLUGIN_ROOT}"`.)

```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/src/scanContext.ts" --scopes
```

That lists the scannable scopes (doc `domain` values) and how many candidate pairs each has. Then take
one scope at a time:

```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/src/scanContext.ts" --scope <domain>
```

Omit `--scope` for the whole graph. You get `{ count, items: [{ pair: {kind}, a: {...}, b: {...} }] }`.
Three kinds of pair, each derived from a real edge in the graph:

| kind | comes from | what to compare |
|---|---|---|
| `doc-doc` | one doc `references` another | `a.text` vs `b.text` — both doc bodies are inline |
| `doc-code` | a doc `governs` a code path | `a.text` (doc body) vs the file at `b.path` — **you must open it**, the code side carries no text |
| `req-test` | a test `covers` a requirement | requirement `text` vs the test's source |
| `code-code` | two files declaring the same symbol | **open both** at `a.path` / `b.path` and compare what that shared symbol means in each |

**Adjudicate only these items.** Do not invent pairs the tool did not surface — that bound
(REQ-KG-CONF-02) is where precision comes from, and it is why this can run on a big repo at all.

`code-code` needs **no docs at all**, so it is the surface on a repo that has never been specced. The
pair tells you what to compare: `pair.sharedSymbols` lists the module-level names both files declare.
Go straight to those declarations — do not read both files end to end — and ask whether they mean the
same thing. The same constant with two values, the same rule with two formulas, the same enum missing a
case on one side. **This is where a bare repo's first requirements come from:** each contradiction the
CEO adjudicates is a decision that was previously implicit in whichever file the reader opened first.

A shared name is evidence, not a verdict. Two helpers may share a name and legitimately differ — one
keeping a directory's original casing while another normalises for lookup, each internally consistent
and one of them saying so in a comment. That is a naming collision, not a contradiction. **Apply the
test in §3 to code pairs exactly as strictly as to docs**, and expect to reject most of them.

`--scope` names a doc *domain*, so a scoped run is the doc surface only. Run without `--scope` to
include code pairs.

If `count` is 0, say so and stop.

## 2. Triage cheaply before reading deeply

At 100+ pairs you cannot read every governed file end to end, and you do not need to. For each item:

1. Read the doc side first. Does it make a **checkable claim** — a formula, an ordering, a threshold, a
   default, an enum, a name, a precedence rule, "always"/"never"/"only"?
2. No checkable claim → **skip it**. A doc of pure rationale cannot contradict code.
3. Yes → open the other side and look for **that specific claim**. Read the function that implements
   it, not the file.

Work `doc-doc` first (both sides are already in hand, and a parent doc left behind by a split is where
contradictions cluster), then `doc-code`, then `req-test`.

## 3. The test for a real contradiction

> **Could both statements be true at the same time, in the same situation?**
> If yes, it is not a conflict.

A contradiction needs **one subject** and **two incompatible answers**. Apply it strictly. These are
**NOT** conflicts, and reporting them is how the inbox dies:

- **A gap.** Something specified but not implemented, or implemented but not specified. Missing ≠
  contradicting — and the graph already derives `uncovered-requirement` / `unverified-doc` structurally.
- **Different scope.** Two rules that apply in different situations, even if they read alike.
- **General vs specific.** "Prices are rounded" and "prices are rounded half-up to 2dp" agree.
- **A worked example.** A doc narrating what one project did is not asserting a competing rule.
- **Stale phrasing that still means the same thing.** Renamed, reworded, same behaviour.
- **A TODO, an open question, or a `status: draft` doc.** It is not claiming to be true yet.
- **Code that is more defensive than the doc.** An extra guard is not a disagreement.

When you are unsure, **drop it**. A false positive costs the CEO's attention, which is the scarcest
thing this tool spends. If a candidate looks *nearly* real, it is not real.

## 4. Cluster — one subject, one finding

Several items about the same underlying disagreement collapse into **ONE** finding with N participants
grouped into `positions` (camps). Two docs and a code path all disagreeing about the same default is one
finding with three participants and two or three positions — never three findings. The binary case is
simply N=2; there is no special-casing.

## 5. Write the findings file

To `<artifactDir>/conflicts/<scope>.conflicts.json` — read `artifactDir` from the project's
`kg.config.json`; never assume a layout.

```json
{
  "scope": "<domain>",
  "findings": [
    {
      "subject": "which repo a node id is namespaced to",
      "category": "definition",
      "severity": "high",
      "tags": ["<domain>"],
      "why": "one line: what the disagreement actually is",
      "positions": [
        { "id": "A", "statement": "a fixed table of repo names", "heldBy": ["main:kg-core"] },
        { "id": "B", "statement": "the project's declared topology", "heldBy": ["src/config.ts"] }
      ],
      "participants": [
        { "kind": "doc",  "ref": "main:kg-core",  "span": "REQ-KG-CORE-02", "quote": "<exact text>", "positionId": "A" },
        { "kind": "code", "ref": "src/config.ts", "span": "repoOf",         "quote": "<exact code>", "positionId": "B" }
      ]
    }
  ]
}
```

The build validates every finding and **silently drops** any that fails, so honour these:

- at least **2 participants** and at least **2 positions**;
- every participant's `positionId` matches a declared position `id`;
- `kind` ∈ `doc` | `code` | `req` | `test`; `ref` and `quote` are strings;
- `ref` is the node id for doc/req/test (e.g. `main:kg-core`) and the **path** for code;
- **do not author `id` or `axis`** — the build stamps both.

**Every `quote` is exact text copied from the source, and short.** This is not decoration: it is the
entire reason the CEO can adjudicate in seconds instead of re-reading two files. A paraphrase makes the
finding unverifiable and it will be dismissed. Use `span` (a heading, a line hint, a function name) to
say where to look.

`severity`: `high` = the two sides produce different behaviour today. `med` = they will diverge as soon
as someone acts on the losing one. `low` = terminology.

## 6. Rebuild — mandatory, every time

```bash
npm run build
```

The finding does not exist in the viewer until the graph is rebuilt. Findings are a **viewer-only**
payload: no nodes, no edges, no issues, zero ratchet impact — so this can never fail a gate. Re-running a
scan is safe; a finding's id is a hash of subject + scope, so an unchanged contradiction keeps its id and
any decision already made about it survives (REQ-KG-CONF-05).

## 7. Report

Tell the CEO, briefly:

- how many pairs were on the surface, and how many you actually adjudicated;
- each finding as **one line**: subject, the two positions, severity;
- what you deliberately did **not** raise, if you rejected something a reasonable person would expect.

Then stop. **Do not resolve anything.** Choosing the canonical side is the CEO's gate — picking silently
is the exact disease this tool exists to cure. Applying their decisions afterwards is `kg-fix-conflicts`.

## Do NOT

- Free-hunt. Only the pairs `scanContext.ts` emitted for the scope.
- Re-report structural gaps (orphan / unverified / uncovered) — those are already derived.
- Author `id` or `axis`, or emit a finding with fewer than 2 participants or 2 positions.
- Paraphrase a quote.
- Pad the list. An empty findings array is a good outcome when the scope is consistent.
