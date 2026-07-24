---
name: kg-draft-spec
description: Draft requirement docs FROM an existing codebase, so a project that arrived with no specs has something to correct instead of a blank page. Produces status draft docs with governs and requirements, every requirement traceable to the code it was read from. Use on a repo with no system-design docs, or for an area the graph shows as ungoverned. The output is a proposal for the CEO to correct — never canon.
---

# Drafting the spec the code never had

A blank page is why most projects never write requirements at all. This fills it — with a draft, from
the code, that the CEO edits down into truth.

## Read this before you write anything

**A requirement drafted from code cannot contradict that code.** It is a mirror. If the implementation
has a bug, the draft records the bug as intended behaviour, and the bug is now written down as a
decision. That is strictly worse than no document, because the next person reads it as settled.

So the entire value here is in what the CEO *changes*. Your job is to give them something specific
enough to disagree with — not something that sounds finished.

Three rules that follow, and none of them is optional:

1. **Every doc you write is `status: draft`.** The briefing then marks its requirements
   `⚠ UNAPPROVED DRAFT — describes what the code does, not what it should`. Ship `status: current` and
   you have laundered generated prose into canon.
2. **Never claim proof.** Do not write `covers:` linking a requirement to an existing test unless that
   test genuinely asserts that behaviour — a `covers:` edge you invented is a false claim of safety,
   and false safety is the thing this tool exists to destroy.
3. **Flag what you could not tell.** Where the code is ambiguous, or two paths disagree, say so in the
   draft rather than picking. Those are the CEO's decisions and they are the valuable ones.

## 1. Find what is ungoverned

```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/src/agentContextCli.ts" <path>
```

`<artifactDir>/ungoverned-baseline.json` lists every path nothing governs. Group it into **areas** by
directory and by what the code actually does — one draft doc per area, not per file. A doc that governs
all of `src/` returns every requirement for every file, and a briefing too noisy to act on gets ignored.

## 2. Scan for contradictions first — they are the best material

```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/src/scanContext.ts"
```

Run `kg-scan-conflicts` over the area before drafting. Where two files disagree, you have found a
decision that was never made — and a requirement written from *one* of the two sides would silently
bless whichever file you happened to read first. Draft those as an open question, not an assertion.

## 3. Read the code for behaviour, not structure

For each area, work out what an outside observer would notice: what it computes, what it refuses, what
it defaults to, what it does at a boundary. Constants, guard clauses, validation, error paths and enum
handling are where behaviour lives. A restatement of the call graph is not a requirement.

Say **what must be true**, not what the function does:

- ✅ `An order total is the sum of its line items.`
- ❌ `calculateTotal() reduces items with a sum accumulator.`

One assertion per requirement. If it contains "and", split it.

## 4. Write the draft doc

At the project's own docs location (`**/.github/**/*.md`, `**/system-design/**/*.md` — match where its
existing docs live, if any):

```yaml
---
slug: checkout
title: Checkout
domain: <area>
status: draft          # NOT current. This is the whole safety mechanism.
governs:
  - src/checkout/
requirements:
  - id: REQ-CHK-01
    text: An order total is the sum of its line items.
  - id: REQ-CHK-02
    text: A voucher never takes an order total below zero.
---

## Drafted from code, not yet approved

Read from `src/checkout/total.ts` and `src/checkout/voucher.ts` on <date>. Each requirement below
records what the implementation currently does. **Nothing here has been decided by a human.**

### Open questions for the CEO

- `REQ-CHK-02`: `voucher.ts` clamps to zero, but `refund.ts` allows a negative total on the same
  field. One of them is wrong; the code does not say which.
- Rounding is half-up in one path and half-even in another. Which is intended?
```

The open-questions section is the most valuable part of the document. Do not skip it because you found
nothing — if you genuinely found nothing ambiguous in a whole area, say that, and be suspicious of it.

**Link the new doc in from an existing one**, usually the area's index or parent. `orphan-doc` needs an
*inbound* reference, so writing `Parent: [[whatever]]` inside your new doc does not clear it — the
parent has to name the child. Miss this and every draft you write lands as an orphan.

## 4b. Expect the gate to go red, and say so before it does

A drafted doc raises `uncovered-requirement` by one per requirement and `unverified-doc` by one, and
the ratchet's `--update-baseline` **only lowers** — so there is no sanctioned way to accept the rise.
Drafting a spec therefore breaks `npm run check` until every drafted requirement has a covering test.

**Tell the CEO this before you draft, not after.** Do not reach for `--update-baseline`, and never
delete requirements to get the gate green: that is refreshing a baseline by another name.

## 5. Rebuild and hand it over

```bash
npm run build
```

Then tell the CEO, briefly:

- how many areas you drafted, and how many requirements in each;
- **the open questions**, as a short list — this is what you are actually asking them for;
- that everything is `status: draft` until they say otherwise.

**Do not promote a doc to `status: current` yourself, and do not ask for blanket approval of a whole
document.** Approval is per requirement, and it is the CEO's only gate. When they approve, `kg-spec`
stamps the agreed text and the doc graduates.

## Do NOT

- Write `status: current`.
- Invent a `covers:` link to a test that does not actually assert the behaviour.
- Resolve an ambiguity you found in the code by picking the side you read first.
- Draft requirements for an area you have not read.
- Present a draft as a finished spec. It is a proposal with the code's own bugs baked in.
