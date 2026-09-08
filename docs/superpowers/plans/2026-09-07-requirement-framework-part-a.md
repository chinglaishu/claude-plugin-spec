# Requirement framework — Part A (the screen side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the five fixed buckets — ① The main thing's life · ② Every derived number · ③ Every view & chip · ④ Survival · ⑤ The mistake path — the grouping of every screen's requirements, with authored source stamps (DOC·CODE), four example slots (happy·boundary·absence·mistake), question cards (`## Q<n>`), and a per-card derived state (agreed → conflict → gap → mismatch), all rendered on the board and dogfooded on `spec/board` and `demo/todo`.

**Architecture:** Extend the tiny `parsePrd` (spec-store.mjs) to recognise bucket lines, question cards, slot tags and `**Sources**` / `**Not needed**` lines — additively, so a prd with no bucket lines parses byte-for-byte as today. A new pure module `tools/cards.mjs` owns the fixed-five grouping, the slot/gap/state derivation and the screen counter; it is unit-tested directly. `tools/build-board.mjs` + `tools/board/client.js` render the buckets, stamps, slots, badges, question cards and counter. The board and demo prds are walked into buckets with red-first board/demo tests. **No new status field, no gate, no draft/guess flag.**

**Tech Stack:** Node ESM, `node:test` for pure unit tests, Playwright (`playwright.board.ts`) for the board/demo E2E. Design system: `spec/_design.css` (Japanese dye tokens; hue never alone; WCAG AA).

## Global Constraints

- **Backward compatibility (hard gate):** `tools/prd-families.test.mjs` must stay green **byte-for-byte** — a prd with no bucket lines parses identically (same `reqs` bodies, same `families`, same hashes). Run it after every parser change.
- **Never fake a green (CLAUDE.md rule 3):** a requirement with no passing assertion reads unproven; do not weaken/skip/delete a test to go green. `demo/todo` R9 is INTENTIONALLY failing — never fix it green.
- **The human owns meaning (CLAUDE.md rule 5):** a question card is a question, NOT a requirement — walking todo into buckets and adding question cards must NOT change any requirement's meaning. Board R17 is amended (the human accepted the meaning; you draft the words with the reason attached, rule 6).
- **Design system is non-negotiable:** no raw hex, no size off the scale, hue never alone (every chip also has a mark), WCAG AA. `--yamabuki` ALREADY EXISTS and already means "in-flight / not-reached / waiting" (spec/_design.css line 72). Assigning it to **gap/question** is a reassignment that needs the human's sign-off. **Until the human answers, render gap and question with muted ink (`--mute`) + a distinct mark, NOT yamabuki.** This is the first question in the report.
- **Stage explicitly:** `git add <paths>` only, never `git add -A` (another agent may be in this tree).
- **Never edit `board.html` by hand** (generated); `build()`'s `new Function()` guard must stay. `node --check tools/board/client.js` after editing client.js.
- **Wait for the fold** ("N drawing(s) written" / reporter fold line) after "N passed" before gating/committing a board run. Board runs on a FREE port via `BOARD_PORT`, never 4173, never `--reporter`, never `-g`.

**Bucket decision table (the tool owns these names + default glosses — copy verbatim):**

| key | name | default gloss |
|---|---|---|
| ① | The main thing's life | create it, change it, finish it, remove it — the screen's main noun |
| ② | Every derived number | anything the app computes: counts, rings, roll-ups, effective rates |
| ③ | Every view & chip | each view shows the right rows, every badge and chip agrees |
| ④ | Survival | what outlives a reload, a sign-out, a publish, a navigation |
| ⑤ | The mistake path | the slip is safe: undo, confirm, refuse, nothing lost |

**Slot names (all four needed unless declared not needed):** `happy` · `boundary` · `absence` · `mistake`.

---

## File Structure

- `tools/spec-store.mjs` — `parsePrd` extended (buckets, questions, slots, sources, not-needed). The one door already; additive fields only.
- `tools/behavior.mjs` — `parseBehavior` extended to carry each beat's slot tags and keep the `{tag}` out of the printed sentence. New `stripSlotTags`.
- `tools/cards.mjs` — NEW, pure. The fixed-five grouping (`BUCKETS`, `bucketGroups`), slot/gap logic (`neededSlots`, `filledSlots`, `cardGaps`), state derivation (`cardState`), conflict-side lookup (`conflictReqIds`), screen counter (`screenCounter`).
- `tools/prd-buckets.test.mjs` — NEW. Parser + grammar unit tests.
- `tools/cards.test.mjs` — NEW. Derivation unit tests.
- `tools/prd-families.test.mjs` — unchanged assertions; extended only with NEW cases that a bucketed prd still yields the right families.
- `tools/build-board.mjs` — bucket rows on the home card + List; stamp strip, slots, state badge on rule cards; question cards; screen-head counter. Focus jump-map grouped by bucket.
- `tools/board/client.js` — Focus pager jump-map grouped by bucket; List gap-summary.
- `spec/_design.css` — new classes for stamps/slots/badges/counter (muted-ink gap/question until sign-off).
- `spec/board/prd.md` — bucket lines added (dogfood); R17 amended; 4 new board requirements.
- `spec/board/test.spec.ts` + `spec/board/steps.ts` — 4 new red-first board beats.
- `demo/todo/spec/todo/prd.md` — walked into five buckets; slot tags on beats; question cards added.
- CLAUDE.md · `skills/kg-deep/SKILL.md` · `skills/kg-e2e/SKILL.md` — one paragraph / step edits.

---

## Task 1: prd grammar — buckets, questions, slot tags, sources, not-needed

**Files:**
- Modify: `tools/behavior.mjs` (add `stripSlotTags`, extend `parseBehavior` beats with `slots`)
- Modify: `tools/spec-store.mjs:206-236` (`parsePrd`)
- Test: `tools/prd-buckets.test.mjs` (new), `tools/prd-families.test.mjs` (add cases, keep old green)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `parseBehavior(body)` → `{ given, beats:[{ when, then, slots:string[] }] }` (slots = explicit `{tag}`s parsed off the When line; `[]` when untagged). The `when` text no longer contains the trailing `{tag}` group.
  - `stripSlotTags(text)` → text with a trailing run of `{happy|boundary|absence|mistake}` tokens removed.
  - `parsePrd(text)` → `{ fm, reqs, families, buckets }` where:
    - `buckets: [{ key:'①'..'⑤', gloss:string }]` — the bucket lines seen, in prd order (the fixed-five grouping is cards.mjs's job).
    - each `req` gains: `kind:'rule'|'question'`, `bucket:'①'|null`, `slots:{ filled:string[] }` (tags across its beats; untagged beat contributes `'happy'`), `sources:{ doc:string|null, code:string|null }|null`, `notNeeded:{ [slot]:reason }` (may be `{}`).
    - `family` unchanged; a family line under a bucket carries that bucket (stored on the family object as `bucket`).

- [ ] **Step 1: Write failing tests for slot-tag parsing in behavior.mjs**

Add to `tools/prd-buckets.test.mjs`:

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBehavior, stripSlotTags } from './behavior.mjs'
import { parsePrd } from './spec-store.mjs'

test('stripSlotTags removes only a trailing run of slot tokens', () => {
  assert.equal(stripSlotTags('press Add {happy}'), 'press Add')
  assert.equal(stripSlotTags('type nothing {boundary} {mistake}'), 'type nothing')
  assert.equal(stripSlotTags('a {curly} phrase mid-sentence'), 'a {curly} phrase mid-sentence')
  assert.equal(stripSlotTags('no tags here'), 'no tags here')
})

test('parseBehavior carries each beat\'s slot tags and keeps them out of the sentence', () => {
  const body = [
    '- **Given** a list',
    '- **When** you press Add {happy}',
    '- **Then** a row appears',
    '- **When** you press Add empty {boundary} {mistake}',
    '- **Then** nothing is added'
  ].join('\n')
  const b = parseBehavior(body)
  assert.equal(b.beats[0].when, 'you press Add')
  assert.deepEqual(b.beats[0].slots, ['happy'])
  assert.equal(b.beats[1].when, 'you press Add empty')
  assert.deepEqual(b.beats[1].slots, ['boundary', 'mistake'])
})
```

- [ ] **Step 2: Run — expect FAIL** (`node --test tools/prd-buckets.test.mjs` → `stripSlotTags is not a function`)

- [ ] **Step 3: Implement in `tools/behavior.mjs`**

```javascript
// Example SLOTS (the requirement framework, the human 2026-09-07): one or more of these tokens at
// the END of a When line file that beat under a slot. They are NOT part of the sentence the board
// prints, so parseBehavior strips them; untagged beats carry no tag here (cards.mjs defaults to happy).
export const SLOTS = ['happy', 'boundary', 'absence', 'mistake']
const TRAILING_TAGS = /(?:\s*\{(?:happy|boundary|absence|mistake)\})+\s*$/
export function stripSlotTags (text) {
  return String(text || '').replace(TRAILING_TAGS, '').trimEnd()
}
const TAG = /\{(happy|boundary|absence|mistake)\}/g
function slotsOf (whenLine) {
  const m = String(whenLine).match(TRAILING_TAGS)
  if (!m) return []
  return [...m[0].matchAll(TAG)].map(x => x[1])
}
```

Then in `parseBehavior`, when building each beat, read the raw When text once for slots and strip it for the sentence:

```javascript
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i].label !== 'When' || rest[i + 1].label !== 'Then') return null
    beats.push({ when: stripSlotTags(rest[i].text), then: rest[i + 1].text, slots: slotsOf(rest[i].text) })
  }
```

- [ ] **Step 4: Run — expect PASS** (`node --test tools/prd-buckets.test.mjs`)

- [ ] **Step 5: Write failing tests for parsePrd buckets/questions/sources/not-needed**

Append to `tools/prd-buckets.test.mjs`:

```javascript
const BUCKET = k => `### ${k} bucket gloss here\n`
const R = (id, body) => `## ${id} — title ${id}\n\n${body}\n`

test('a ### line starting with a bucket symbol is a bucket, not a family', () => {
  const text = BUCKET('①') + R('R1', 'body') + '\n### 1 · Fam — g\n' + R('R2', 'body2')
  const { reqs, families, buckets } = parsePrd(text)
  assert.deepEqual(buckets, [{ key: '①', gloss: 'bucket gloss here' }])
  assert.equal(reqs.find(r => r.id === 'R1').bucket, '①')
  assert.equal(reqs.find(r => r.id === 'R2').bucket, '①')       // family under the bucket
  assert.deepEqual(families.map(f => [f.name, f.bucket]), [['Fam', '①']])
})

test('a family line before any bucket is unbucketed (bucket null)', () => {
  const { reqs, families } = parsePrd('### 1 · Fam — g\n' + R('R1', 'x'))
  assert.equal(families[0].bucket, null)
  assert.equal(reqs[0].bucket, null)
})

test('## Q<n> is a question card, parsed like a req but kind=question', () => {
  const text = BUCKET('⑤') + R('R1', 'x') + '\n## Q1 — Is delete reversible?\n\n- **Ask** is this a requirement?\n'
  const { reqs } = parsePrd(text)
  const q = reqs.find(r => r.id === 'Q1')
  assert.equal(q.kind, 'question')
  assert.equal(q.bucket, '⑤')
  assert.equal(reqs.find(r => r.id === 'R1').kind, 'rule')
})

test('**Sources** and **Not needed** lines are read into authored stamps/slots', () => {
  const body = [
    '- **Given** g', '- **When** w {happy}', '- **Then** t',
    '- **Sources** doc: app/requirements.html · R1 — code: todo.html addTask()',
    '- **Not needed** mistake — an add cannot be undone here by design'
  ].join('\n')
  const { reqs } = parsePrd(R('R1', body))
  const r = reqs[0]
  assert.equal(r.sources.doc, 'app/requirements.html · R1')
  assert.equal(r.sources.code, 'todo.html addTask()')
  assert.equal(r.notNeeded.mistake, 'an add cannot be undone here by design')
  assert.deepEqual(r.slots.filled, ['happy'])
})
```

- [ ] **Step 6: Run — expect FAIL**

- [ ] **Step 7: Implement in `tools/spec-store.mjs` `parsePrd`**

Add near the top of the module (after imports): import the slot helpers.
```javascript
import { parseBehavior, SLOTS } from './behavior.mjs'   // if not already imported; SLOTS may be unused here
```
(parseBehavior is already imported in spec-store — confirm; only add SLOTS import if needed. The bucket symbols are a local constant.)

Replace the family-detection branch and the req push in `parsePrd`:

```javascript
  const BUCKET_KEYS = ['①', '②', '③', '④', '⑤']
  const reqs = []
  const families = []
  const buckets = []
  let family = null
  let bucket = null
  for (const chunk of body.split(/\n(?=##[#]? )/)) {
    const f = chunk.match(/^###\s+(.+)/)
    if (f) {
      const line = f[1].trim()
      const key = BUCKET_KEYS.find(k => line.startsWith(k))
      if (key) {                                   // a BUCKET line: the tool owns the name, trailing words are a gloss
        bucket = key
        family = null                              // a new bucket opens with no family
        buckets.push({ key, gloss: line.slice(key.length).trim() })
        continue
      }
      const heading = line
      const m = heading.match(/^(?:(\S+)\s+·\s+)?(.*?)(?:\s+—\s+(.*))?$/)
      family = { n: m?.[1] ?? null, name: (m?.[2] ?? heading).trim(), gloss: (m?.[3] ?? '').trim(), heading, bucket, ids: [] }
      families.push(family)
      continue
    }
    const h = chunk.match(/^##\s+(.+)/)
    if (!h) continue
    const [, id, title] = h[1].match(/^(\S+)\s+—\s+(.*)$/) || [null, '', h[1]]
    const rbody = chunk.replace(/^##.*\n/, '').trim()
    reqs.push({
      id, title, body: rbody,
      family: family ? family.n ?? family.name : null,
      bucket,
      kind: /^Q\d+$/.test(String(id)) ? 'question' : 'rule',
      slots: { filled: slotsFilled(rbody) },
      sources: parseSources(rbody),
      notNeeded: parseNotNeeded(rbody)
    })
    if (family) family.ids.push(id)
  }
  return { fm, reqs, families, buckets }
```

Add three pure helpers ABOVE `parsePrd` (they read the raw body; they never mutate it):

```javascript
// The slots a requirement's beats fill: each beat's explicit {tag}s, an untagged beat filling 'happy'.
function slotsFilled (body) {
  const b = parseBehavior(body)
  if (!b) return []
  const filled = new Set()
  for (const beat of b.beats) (beat.slots.length ? beat.slots : ['happy']).forEach(s => filled.add(s))
  return [...filled]
}
// Authored DOC/CODE stamps from a `- **Sources** doc: … — code: …` line. Either half may be absent.
function parseSources (body) {
  const m = body.match(/^\s*-\s*\*\*Sources\*\*\s+(.+)$/m)
  if (!m) return null
  const line = m[1]
  const doc = line.match(/doc:\s*(.*?)(?:\s+—\s+code:|$)/)
  const code = line.match(/code:\s*(.+)$/)
  return { doc: doc ? doc[1].trim() : null, code: code ? code[1].trim() : null }
}
// A slot filled ON PURPOSE: `- **Not needed** <slot> — <reason>`.
function parseNotNeeded (body) {
  const out = {}
  for (const m of body.matchAll(/^\s*-\s*\*\*Not needed\*\*\s+(\w+)\s+—\s+(.+)$/gm)) out[m[1]] = m[2].trim()
  return out
}
```

- [ ] **Step 8: Run buckets + families tests — expect PASS on both** (`node --test tools/prd-buckets.test.mjs tools/prd-families.test.mjs`). The families test must be **unchanged and green**.

- [ ] **Step 9: Run the whole pure suite** (`npm run test:tools`) — expect PASS (nothing else consumes the new fields yet).

- [ ] **Step 10: Commit**

```bash
git add tools/behavior.mjs tools/spec-store.mjs tools/prd-buckets.test.mjs
git commit -m "feat(spec): prd grammar for buckets, questions, slot tags, sources, not-needed"
```

---

## Task 2: cards.mjs — fixed-five grouping, slot/gap/state derivation, counter

**Files:**
- Create: `tools/cards.mjs`
- Test: `tools/cards.test.mjs`

**Interfaces:**
- Consumes: a `screen` object shaped like `readScreen`'s output (`{ reqs, families, buckets }`, each req carrying `kind, bucket, slots, notNeeded, status`), and the open findings from `readConflicts().open`.
- Produces:
  - `BUCKETS` → `[{ key, name, gloss }]` fixed five in order.
  - `bucketGroups(screen)` → `{ unbucketed: { families:[{family,reqs}], loose:[reqs], has:boolean }, buckets:[{ bucket:{key,name,gloss}, families:[{family,reqs}], loose:[reqs], empty:boolean }] }` — always five buckets in order. A req/family's own `bucket` field decides placement; a bucket line's gloss override is applied to `bucket.gloss` when present.
  - `neededSlots(req)` → `['happy','boundary','absence','mistake']` minus any declared not-needed (still needed, just filled — see filledSlots). (Kept as the constant list; not-needed is handled in filled.)
  - `filledSlots(req)` → union of `req.slots.filled` and `Object.keys(req.notNeeded)`.
  - `cardGaps(req)` → needed − filled, `[]` for question cards.
  - `conflictReqIds(open, screen)` → `Set<string>` of req ids on `screen` named as a side of an open finding.
  - `cardState(req, conflictIds)` → `'question'|'conflict'|'mismatch'|'agreed'`. Precedence for a rule: conflict > mismatch > agreed. mismatch ⟺ `status ∈ {failed, not-reached}`. (Gaps do NOT change the badge — they are a slot-level annotation; `changed` keeps its own indigo chip, orthogonal.)
  - `screenCounter(screen, open)` → `{ conflicts, gaps, mismatches, agreed }` — rule-card counts by state, `gaps` = Σ `cardGaps` over rule cards.

- [ ] **Step 1: Write failing tests** in `tools/cards.test.mjs`:

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUCKETS, bucketGroups, filledSlots, cardGaps, cardState, conflictReqIds, screenCounter } from './cards.mjs'

const rule = (id, o = {}) => ({ id, kind: 'rule', bucket: o.bucket ?? null, family: o.family ?? null,
  status: o.status ?? 'passed', slots: { filled: o.filled ?? ['happy'] }, notNeeded: o.notNeeded ?? {} })

test('BUCKETS is the fixed five in order with tool-owned names', () => {
  assert.deepEqual(BUCKETS.map(b => b.key), ['①', '②', '③', '④', '⑤'])
  assert.equal(BUCKETS[0].name, 'The main thing\'s life')
  assert.equal(BUCKETS[4].name, 'The mistake path')
})

test('bucketGroups always returns five buckets in order; an empty bucket is flagged', () => {
  const s = { reqs: [rule('R1', { bucket: '①' }), rule('R2', { bucket: '③' })], families: [], buckets: [] }
  const g = bucketGroups(s)
  assert.deepEqual(g.buckets.map(b => b.bucket.key), ['①', '②', '③', '④', '⑤'])
  assert.equal(g.buckets[0].empty, false)
  assert.equal(g.buckets[1].empty, true)   // ② has no cards
  assert.equal(g.unbucketed.has, false)
})

test('bucketGroups surfaces unbucketed reqs and a bucket-line gloss override', () => {
  const s = { reqs: [rule('R1'), rule('R2', { bucket: '①' })], families: [], buckets: [{ key: '①', gloss: 'my gloss' }] }
  const g = bucketGroups(s)
  assert.equal(g.unbucketed.has, true)
  assert.deepEqual(g.unbucketed.loose.map(r => r.id), ['R1'])
  assert.equal(g.buckets[0].bucket.gloss, 'my gloss')
})

test('filledSlots unions beat tags with not-needed; cardGaps is the remainder', () => {
  const r = rule('R1', { filled: ['happy', 'absence'], notNeeded: { mistake: 'by design' } })
  assert.deepEqual(filledSlots(r).sort(), ['absence', 'happy', 'mistake'])
  assert.deepEqual(cardGaps(r), ['boundary'])
  assert.deepEqual(cardGaps({ ...r, kind: 'question' }), [])
})

test('conflictReqIds finds a req named as a side of an open finding on this screen', () => {
  const open = [{ a: { source: 'spec/board/prd.md · R2' }, b: { source: 'spec/init/prd.md · R2' } }]
  assert.deepEqual([...conflictReqIds(open, 'board')], ['R2'])
  assert.deepEqual([...conflictReqIds(open, 'init')], ['R2'])
  assert.deepEqual([...conflictReqIds(open, 'todo')], [])
})

test('cardState: conflict > mismatch > agreed; questions are question', () => {
  assert.equal(cardState({ id: 'Q1', kind: 'question' }, new Set()), 'question')
  assert.equal(cardState(rule('R1', { status: 'failed' }), new Set()), 'mismatch')
  assert.equal(cardState(rule('R1', { status: 'not-reached' }), new Set()), 'mismatch')
  assert.equal(cardState(rule('R1', { status: 'passed' }), new Set(['R1'])), 'conflict')
  assert.equal(cardState(rule('R1', { status: 'passed' }), new Set()), 'agreed')
})

test('screenCounter counts rule cards by state and sums gap slots', () => {
  const s = { reqs: [
    rule('R1', { status: 'passed', filled: ['happy'] }),                 // agreed, 3 gaps
    rule('R2', { status: 'failed', filled: ['happy', 'boundary', 'absence', 'mistake'] }), // mismatch, 0 gaps
    { id: 'Q1', kind: 'question' }
  ], families: [], buckets: [] }
  const c = screenCounter(s, [])
  assert.deepEqual(c, { conflicts: 0, gaps: 3, mismatches: 1, agreed: 1 })
})
```

- [ ] **Step 2: Run — expect FAIL** (`node --test tools/cards.test.mjs`)

- [ ] **Step 3: Implement `tools/cards.mjs`**

```javascript
// The requirement framework's card layer (the human 2026-09-07): the five FIXED buckets, the four
// example slots, and each rule card's derived state. Pure and Playwright-free — the one thing this
// product cannot get wrong is derivation, so it is unit-tested directly (tools/cards.test.mjs) and
// the renderer only DRAWS what this returns. No state is stored: a bucket's/family's state is its
// cards', a card's state is its stamps + slots + the Conflicts page, all read on every build.

// The tool OWNS the bucket names and default glosses; a prd's bucket line may override only the gloss.
export const BUCKETS = [
  { key: '①', name: "The main thing's life", gloss: 'create it, change it, finish it, remove it — the screen’s main noun' },
  { key: '②', name: 'Every derived number', gloss: 'anything the app computes: counts, rings, roll-ups, effective rates' },
  { key: '③', name: 'Every view & chip', gloss: 'each view shows the right rows, every badge and chip agrees' },
  { key: '④', name: 'Survival', gloss: 'what outlives a reload, a sign-out, a publish, a navigation' },
  { key: '⑤', name: 'The mistake path', gloss: 'the slip is safe: undo, confirm, refuse, nothing lost' }
]
export const NEEDED_SLOTS = ['happy', 'boundary', 'absence', 'mistake']

// Group a screen's reqs+families into the fixed five buckets (always all five, in order) plus a
// leading "unbucketed" group for anything before the first bucket line. Placement is by each
// req/family's own `bucket` field; a bucket line's gloss overrides the default.
export function bucketGroups (screen) {
  const reqs = screen.reqs || []
  const families = screen.families || []
  const glossOf = k => (screen.buckets || []).find(b => b.key === k)?.gloss || ''
  const groupFor = (bucketKey) => {
    const fams = families.filter(f => f.bucket === bucketKey)
    const famGroups = fams.map(f => ({ family: f, reqs: f.ids.map(id => reqs.find(r => r.id === id)).filter(Boolean) }))
      .filter(g => g.reqs.length)
    const loose = reqs.filter(r => r.bucket === bucketKey && r.family == null)
    return { famGroups, loose }
  }
  const buckets = BUCKETS.map(b => {
    const { famGroups, loose } = groupFor(b.key)
    const g = glossOf(b.key)
    return { bucket: { ...b, gloss: g || b.gloss }, families: famGroups, loose, empty: !famGroups.length && !loose.length }
  })
  const u = groupFor(null)
  return { unbucketed: { families: u.famGroups, loose: u.loose, has: !!(u.famGroups.length || u.loose.length) }, buckets }
}

export const filledSlots = req =>
  [...new Set([...(req.slots?.filled || []), ...Object.keys(req.notNeeded || {})])]

export const cardGaps = req =>
  req.kind === 'question' ? [] : NEEDED_SLOTS.filter(s => !filledSlots(req).includes(s))

// The req ids on `screen` named as a side of an open finding. A side's source is `spec/<screen>/prd.md · R<n>`.
export function conflictReqIds (open, screen) {
  const ids = new Set()
  const pick = side => {
    const m = String(side?.source || '').match(new RegExp(`spec/${screen}/prd\\.md\\s*·\\s*(\\S+)`))
    if (m) ids.add(m[1])
  }
  for (const f of open || []) { pick(f.a); pick(f.b); for (const s of f.sides || []) pick(s) }
  return ids
}

// The single badge. Precedence conflict > mismatch > agreed; a gap is a slot-level annotation, not a
// badge state, and `changed` keeps its own indigo chip (orthogonal). Questions are their own state.
export function cardState (req, conflictIds) {
  if (req.kind === 'question') return 'question'
  if (conflictIds && conflictIds.has(req.id)) return 'conflict'
  if (req.status === 'failed' || req.status === 'not-reached') return 'mismatch'
  return 'agreed'
}

export function screenCounter (screen, open) {
  const ids = conflictReqIds(open, screen.name)
  let conflicts = 0, gaps = 0, mismatches = 0, agreed = 0
  for (const r of screen.reqs || []) {
    if (r.kind === 'question') continue
    const st = cardState(r, ids)
    if (st === 'conflict') conflicts++
    else if (st === 'mismatch') mismatches++
    else agreed++
    gaps += cardGaps(r).length
  }
  return { conflicts, gaps, mismatches, agreed }
}
```

- [ ] **Step 4: Run — expect PASS** (`node --test tools/cards.test.mjs`)

- [ ] **Step 5: Run whole pure suite** (`npm run test:tools`) — expect PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/cards.mjs tools/cards.test.mjs
git commit -m "feat(cards): fixed-five buckets, slot/gap/state derivation, screen counter"
```

---

## Task 3: lint — a question card is never a coverage target

**Files:**
- Modify: `tools/proof-integrity.mjs` (`lintIntent`/existence lint — the `npm run proof lint` path)
- Test: extend `tools/cards.test.mjs` OR a proof-integrity unit test if one exists; else a focused test file `tools/lint-questions.test.mjs`.

**Interfaces:**
- Consumes: the parsed prd (`reqs` with `kind`) and the tags a test declares (`checkReq('Q1')`).
- Produces: `npm run proof lint` errors when a `## Q<n>` id is tagged by any test (`checkReq`/`coverReqs`).

- [ ] **Step 1:** Read `tools/proof-integrity.mjs` to find where `lint` enumerates requirement ids and test tags (search `lintIntent`, `checkReq`, `coverReqs`). Identify the pure function that maps tags→reqs.

- [ ] **Step 2: Write a failing unit test** for the pure check (adapt names to what the file exports). If the lint logic is not separable, add the rule as a small exported pure function `questionTaggedError(reqs, taggedIds)` returning an error string or null, and test it:

```javascript
import { questionTaggedError } from './proof-integrity.mjs'
test('a question card tagged by a test is a lint error; a rule is fine', () => {
  const reqs = [{ id: 'Q1', kind: 'question' }, { id: 'R1', kind: 'rule' }]
  assert.match(questionTaggedError(reqs, new Set(['Q1'])) || '', /Q1/)
  assert.equal(questionTaggedError(reqs, new Set(['R1'])), null)
})
```

- [ ] **Step 3: Run — expect FAIL.**

- [ ] **Step 4: Implement** `questionTaggedError` and call it from the `lint` path so a tagged `Q` id prints an error and makes `npm run proof lint` exit non-zero. Keep the existing lint behaviour intact.

- [ ] **Step 5: Run — expect PASS**, then `npm run proof lint` on the repo — expect it still passes (no `Q` ids tagged yet).

- [ ] **Step 6: Commit**

```bash
git add tools/proof-integrity.mjs tools/lint-questions.test.mjs
git commit -m "feat(proof): a ## Q question card is never a coverage target"
```

---

## Task 4: render buckets — home card + List (build-board.mjs) + design.css

**Files:**
- Modify: `tools/build-board.mjs` (`card`, `cardRows`, the List/detail render, the screen head)
- Modify: `spec/_design.css` (bucket header, stamp strip, slot chips, state badge, counter — gap/question muted-ink + mark, NOT yamabuki, pending sign-off)
- Test: covered by the board dogfood in Task 7 (red-first there). Add a focused build-board unit test for the row plan.

**Interfaces:**
- Consumes: `bucketGroups`, `cardState`, `cardGaps`, `screenCounter`, `conflictReqIds` from `tools/cards.mjs`; `filledSlots`.
- Produces: on every home card, five bucket rows in fixed order (empty bucket → "— nothing here yet" muted); families as sub-headings inside a bucket; an "not yet bucketed" strip when reqs precede the first bucket. Each rule card row carries a **stamp strip** (`DOC · CODE · SPEC · PROVEN`) and a **state badge**; question cards carry their one question. A **counter** on the screen's detail head (conflicts · gaps · mismatches · agreed) linking into buckets.

- [ ] **Step 1: Write a failing unit test** `tools/board-buckets.test.mjs` for the pure row plan. Extend `cardRows` (or add `bucketCardRows`) to emit bucket rows in fixed order with empty holes:

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bucketCardRows } from './build-board.mjs'
const rule = (id, bucket) => ({ id, title: 't' + id, kind: 'rule', bucket, family: null, status: 'passed', slots: { filled: ['happy'] }, notNeeded: {} })
test('bucketCardRows: five bucket headers in order, empty holes flagged, cards under their bucket', () => {
  const s = { reqs: [rule('R1', '①'), rule('R2', '③')], families: [], buckets: [] }
  const rows = bucketCardRows(s)
  const kinds = rows.map(x => x.kind === 'bucket' ? 'B:' + x.b.bucket.key + (x.b.empty ? ':empty' : '') : x.kind === 'req' ? x.r.id : x.kind)
  assert.deepEqual(kinds, ['B:①', 'R1', 'B:②:empty', 'B:③', 'R2', 'B:④:empty', 'B:⑤:empty'])
})
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `bucketCardRows`** in build-board.mjs (exported, pure) that walks `bucketGroups(s)`: emit `{kind:'unbucketed'}` + its rows when `unbucketed.has`; then for each of the five buckets a `{kind:'bucket', b}` header, its family sub-headers `{kind:'fam', f}` and `{kind:'req', r}` rows, or nothing when empty (the header carries `b.empty`). Unlike the old 5-cap `cardRows`, the home card shows all five bucket headers always; the per-bucket card list may still fold with "… N more" INSIDE a bucket if a bucket is very large (cap ~5 per bucket) — keep it simple: no per-bucket cap for now, render all (revisit only if a real screen overflows).

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Wire the home `card()` render** to use `bucketCardRows`. Add markup:
  - bucket header row: `<li class="bkt${empty?' empty':''}"><span class="bkkey">①</span><b class="bkname">The main thing's life</b><span class="bkgloss">— gloss</span>${empty?'<span class="bkempty">— nothing here yet</span>':''}</li>`
  - family sub-header inside a bucket: reuse `famRow` but nested (add a `.subfam` class).
  - rule row: keep the existing id·mark·title, ADD a compact stamp dot-strip `stampStrip(r)` and the state badge `stateBadge(cardState(r, conflictIds))`.
  - question row: `<li class="qcard">…Q1 · question · title…</li>` with a `?` mark (muted ink).

- [ ] **Step 6: Add `stampStrip`, `stateBadge` helpers** in build-board.mjs:

```javascript
// DOC · CODE · SPEC · PROVEN. SPEC is implicit (the card exists). PROVEN is measured (status==='passed').
// DOC/CODE are AUTHORED (the **Sources** line) and NEVER render as a measured green — a distinct
// 'authored' style, filled ink but not the koke green a proof earns. A conflict side reddens the stamp.
const stampStrip = (r, isConflict) => {
  const on = r.status === 'passed'
  const cell = (label, filled, cls = '') => `<span class="stamp ${cls}${filled ? ' on' : ' off'}">${label}</span>`
  return `<span class="stamps">${
    cell('DOC', !!r.sources?.doc, 'authored' + (isConflict ? ' conf' : ''))}${
    cell('CODE', !!r.sources?.code, 'authored' + (isConflict ? ' conf' : ''))}${
    cell('SPEC', true, 'authored')}${
    cell('PROVEN', on, 'measured')}</span>`
}
// The four slots as chips: full (koke) when filled, gap (MUTED + a �decisive mark until the yamabuki
// sign-off) when a needed slot is empty. Not-needed reads 'n/a' with its reason in the title.
const slotChips = r => `<span class="slots">${NEEDED_SLOTS.map(s => {
  const filled = filledSlots(r).includes(s)
  const na = r.notNeeded?.[s]
  const cls = na ? 'na' : filled ? 'full' : 'gap'
  return `<span class="slot ${cls}" title="${esc(na || s)}"><span class="sk">${s}</span></span>`
}).join('')}</span>`
const STATE_MARK = { agreed: '✓', conflict: '⚑', gap: '△', mismatch: '✗', question: '?' }
const stateBadge = st => `<span class="badge b-${st}"><span class="bm">${STATE_MARK[st]}</span>${st}</span>`
```

Import `NEEDED_SLOTS`, `filledSlots`, `cardState`, `cardGaps`, `bucketGroups`, `conflictReqIds`, `screenCounter` from `./cards.mjs` at the top of build-board.mjs. Compute `conflictIds` per screen from `readConflicts().open` — thread the open findings into the render (build-board already reads the store; add a `conflicts` arg to `card`/detail render, read once in `build()`).

- [ ] **Step 7: Render the screen-head counter** in the detail: `screenCounter(s, open)` → four linked chips `<a class="cnt cnt-conf" href="#…">N conflicts</a> …` where 0 reads muted. Each links to its bucket anchor.

- [ ] **Step 8: Add design.css classes** (`.bkt`, `.bkkey`, `.bkname`, `.bkgloss`, `.bkempty`, `.stamps`, `.stamp.on/.off/.authored/.measured/.conf`, `.slots`, `.slot.full/.gap/.na`, `.badge.b-agreed/.b-conflict/.b-gap/.b-mismatch/.b-question`, `.cnt*`). Use existing tokens ONLY: koke (agreed/proven/full slot), bengara (conflict/mismatch), mute (gap/question/off stamp), tint/line for structure. **No yamabuki on gap/question** until sign-off; every colored chip carries a mark glyph. Verify AA by reusing existing token pairs (koke-tint/koke, bengara-tint/bengara, paper/mute).

- [ ] **Step 9:** `npm run board:build` then `node tools/build-board.mjs` guard passes; open board.html to eyeball (do NOT commit board.html — it's generated but IS committed in this repo; check `git status` convention — rebuild is normal). Run `npm run test:tools` (board-buckets test green).

- [ ] **Step 10: Commit**

```bash
git add tools/build-board.mjs tools/board-buckets.test.mjs spec/_design.css
git commit -m "feat(board): five-bucket home card + List, stamp strip, slots, state badge, counter"
```

---

## Task 5: Focus pager jump-map grouped by bucket (client.js)

**Files:**
- Modify: `tools/board/client.js` (the jump-map / pager region, ~line 3447-3492; `focusBody` counter)
- Modify: `tools/build-board.mjs` (the baked `data-*` the client reads — add `data-bkt` / bucket key per req row if needed)
- Test: board dogfood (Task 7). Add `node --check tools/board/client.js`.

**Interfaces:**
- Consumes: the baked req rows' `data-fam`/`data-famn` (existing) + a new `data-bkt` (bucket key) attribute.
- Produces: the Focus pager's jump-map groups its dots under the five buckets in fixed order (empty bucket shown as a labelled-but-empty stop), families as sub-labels inside; the counter line reads `<bucket> · <family> · n of N` when present.

- [ ] **Step 1:** Add `data-bkt="①"` (and empty when null) to the baked req row in build-board.mjs `reqRow` (~line 646), reading `r.bucket`.
- [ ] **Step 2: Write the board beat** (in Task 7's R17-amend test) that asserts the jump-map shows five bucket labels in order. (Red-first there.)
- [ ] **Step 3:** In client.js, group the jump-map dots by `data-bkt` in the fixed order `['①','②','③','④','⑤']` then null, each bucket labelled by its name (bake a `BUCKETS` name map into `window.__BOARD__`, or inline the five names as a const in client.js). Keep families as sub-labels within a bucket. A screen with no buckets renders exactly as today (all under null → the current flat map).
- [ ] **Step 4:** `node --check tools/board/client.js`; `npm run board:build`.
- [ ] **Step 5: Commit**

```bash
git add tools/board/client.js tools/build-board.mjs
git commit -m "feat(board): Focus jump-map groups requirement dots by bucket"
```

---

## Task 6: skills + CLAUDE.md

**Files:**
- Modify: `skills/kg-deep/SKILL.md` (3a → bucket lines then cards; Families paragraph → sub-groups inside a bucket; phase-1 capture of DOC+CODE into candidate cards per bucket, `## R` + Sources / `## Q` / a Conflicts note)
- Modify: `skills/kg-e2e/SKILL.md` (slot tags on When lines)
- Modify: `CLAUDE.md` (one paragraph on buckets/stamps/slots/question cards, rules-and-pointers only)

- [ ] **Step 1:** kg-deep 3a: rewrite the five-bucket walk into "write the five bucket lines `### ① …` in fixed order, then the rule cards under them; a family `### <n> · <name>` is a sub-group INSIDE a bucket." Add to phase 1: "read the DOC and the CODE the screen cites into candidate cards per bucket — agreed on all sides → `## R` with a `- **Sources** doc: … — code: …` line; one source only → `## Q<n>` with `- **Ask** is this a requirement?`; two sources incompatible → a finding for the Conflicts page (Part B consumes it; you only write the note)."
- [ ] **Step 2:** kg-e2e: document the slot tags — "end a When line with one or more of `{happy}` `{boundary}` `{absence}` `{mistake}`; untagged = happy; declare a slot filled on purpose with `- **Not needed** <slot> — <reason>`."
- [ ] **Step 3:** CLAUDE.md: one paragraph, rules-and-pointers only (no measured facts): the five fixed buckets are the grouping (`### ①..⑤`, tool-owns-name, gloss optional); families are sub-groups inside a bucket; `## Q<n>` is a question card, parsed like a req, never a coverage target (`checkReq('Q1')` → lint error), `Q` ids never reused; slot tags + `**Not needed**`; `**Sources**` = authored DOC/CODE stamps, never a measured green; state derived agreed→conflict→gap→mismatch, no new status field. Point to `tools/cards.mjs`.
- [ ] **Step 4: Commit**

```bash
git add skills/kg-deep/SKILL.md skills/kg-e2e/SKILL.md CLAUDE.md
git commit -m "docs(skills,claude): buckets, slot tags, question cards, source stamps"
```

---

## Task 7: dogfood spec/board — bucket lines, R17 amend, 4 new requirements (RED-FIRST)

**Files:**
- Modify: `spec/board/prd.md` (bucket lines over the requirements; R17 amend; 4 new reqs)
- Modify: `spec/board/test.spec.ts`, `spec/board/steps.ts` (4 new beats, red-first)

**The four new board requirements (draft into ① or the right bucket; the human owns meaning):**
- an EMPTY bucket renders visibly ("— nothing here yet").
- a QUESTION card renders and is NOT a coverage target.
- a rule card's CONFLICT state comes from the Conflicts page.
- an AUTHORED stamp (DOC/CODE) is never a measured green.

- [ ] **Step 1: Bucket the board prd.** Insert the five `### ①..⑤` lines and file R1–R23 under them. Suggested mapping (draft — the human steers): ① R1, R9, R16, R17 (shape/families/home); ② R4 (computed state); ③ R2, R3, R13, R14, R18, R19, R20, R23, R21 (views/reader/chips); ④ R22 (CI), R8 (no gate — survival of "canon as written"); ⑤ R7, R15 (what it refuses / handoff), and the NEW conflict/authored requirements. Keep the existing `### <n> · <family>` lines as sub-groups INSIDE the bucket they now sit in. **Do not reword any existing requirement's meaning** except R17.
- [ ] **Step 2: Amend R17** — add the bucket sentence with the reason attached (rule 6): "The five buckets render on every screen in their fixed order, an empty one visibly empty; a `###` family line is a sub-group INSIDE the bucket above it. *(Amended 2026-09-07 — the human accepted the five fixed buckets as the grouping of every screen; families demote to sub-groups. Drafted by staff, meaning the human's.)*"
- [ ] **Step 3: Write the 4 new requirements** as `## R24…R27` (append, never renumber) with Given/When→Then beats and slot tags. Add their steps in `steps.ts`, tag with `checkReq`.
- [ ] **Step 4: Watch each go RED** — run `npx playwright test --config=playwright.board.ts spec/_auth.setup.ts spec/board/test.spec.ts` on a FREE port (`BOARD_PORT=<free>`), confirm the 4 new beats FAIL before the render exists (order tasks so render for that assertion is not yet wired, OR write the test first if render already landed in Task 4/5 — if render is already in, instead prove red by asserting on a fixture screen that lacks the feature first, then flip). Document the red in the report.
- [ ] **Step 5: Make them pass** via the Task-4/5 render (already built) — the beats assert the real board DOM: `.bkt.empty` exists and reads "nothing here yet"; a `.qcard` for a `Q` id exists and `npm run proof lint` errors if it were tagged (assert the lint rule via a unit fixture, not a live tag); a `.badge.b-conflict` appears on the req the seeded conflict names; the DOC/CODE `.stamp.authored` never carries the `.measured`/koke class.
- [ ] **Step 6: Full board run to green + fold.** Wait for the reporter fold line. `npm run proof lint`.
- [ ] **Step 7: Commit**

```bash
git add spec/board/prd.md spec/board/test.spec.ts spec/board/steps.ts
git commit -m "dogfood(board): bucket lines, R17 amend, R24-R27 (empty bucket, question card, conflict state, authored stamp)"
```

---

## Task 8: dogfood demo/todo — walk into buckets, slot tags, question cards

**Files:**
- Modify: `demo/todo/spec/todo/prd.md`

- [ ] **Step 1: Add the five bucket lines** and file: ① R1, R2, R9-note→ actually R9 → ⑤; ① R1, R2; ② R3, R4, R5; ③ R6, R7; ④ R8; ⑤ R9. Keep the existing `### <n> · <family>` lines as sub-groups inside the right bucket. **Note R9 belongs to ⑤ and is INTENTIONALLY failing — never fix it green.**
- [ ] **Step 2: Tag the beats' slots** on the When lines (do NOT change meaning): R1 When "press the now-enabled Add button {happy}"; add nothing that changes prose beyond the trailing tag. Where a beat is a boundary/absence/mistake, tag it. Add `- **Not needed**` lines only where a slot genuinely does not apply, with a reason.
- [ ] **Step 3: Add the question cards the todolist page found** as `## Q1…Q11` (each with `- **Ask** is this a requirement?` and a `- **Source** code: …` note), one per: add-with-a-due-date, collapse/expand a container (fold, saved), delete a sub-task (re-flows parent), Enter adds, Escape cancels, empty/unchanged edit keeps title without an "edited" stamp, Today includes overdue, a done task wears no chip, view+open state survive reload. File each under its bucket. **A question card is a question, not a requirement — do not tag it, do not assert it.**
- [ ] **Step 4:** `npm run proof lint` (no Q tagged). Rebuild demo/todo board and eyeball.
- [ ] **Step 5: Commit**

```bash
git add demo/todo/spec/todo/prd.md
git commit -m "dogfood(todo): five buckets, slot tags, question cards (no meaning changed)"
```

---

## Task 9: verify on real data + screenshot

**Files:** none (verification).

- [ ] **Step 1:** Rebuild demo/todo's board (board port 4175, app 4319 per memory). Serve it, open in a browser, screenshot the home showing todo's five buckets (① with R1/R2, ⑤ with the failing R9, empty buckets visible if any).
- [ ] **Step 2:** Confirm: five buckets in order; empty bucket muted "nothing here yet"; question cards present with `?` mark; R9 in ⑤ still Failed (never green); stamps show DOC/CODE authored (not green), PROVEN green only where a test passes; counter reads conflicts·gaps·mismatches·agreed.
- [ ] **Step 3:** `npm run test:tools`, `npm run proof lint`, `node --check tools/board/client.js`, full board suite green (wait for fold).
- [ ] **Step 4:** Push when green (`git push`). Report: files/commits, what's red and why, what's left, the demo/todo screenshot, and the questions for the human — the **yamabuki (yellow) sign-off first**.

---

## Self-Review

- **Spec coverage (design §4,5,7,8,9,10):** §4 grammar → Task 1. §5 derivation → Task 2. §7 capture (skills) → Task 6. §8 rendering → Tasks 4,5. §9 dogfood+tests → Tasks 7,8; pure tests → Tasks 1,2. Question-card-not-a-target → Task 3. Verify → Task 9. Part B (§6) is explicitly OUT of scope.
- **Placeholder scan:** all code steps carry real code; test snippets are concrete. The one soft spot is Task 5's client.js jump-map (region identified by line + behaviour, code shape given) and Task 7 red-first ordering (two honest strategies given) — acceptable because they are proven red-first by the board suite.
- **Type consistency:** `cardState(req, conflictIds:Set)`, `bucketGroups(screen)→{unbucketed,buckets}`, `filledSlots`/`cardGaps`/`NEEDED_SLOTS`/`BUCKETS` names are consistent across Tasks 2,4,5. `parseBehavior` beat gains `slots`. `parsePrd` gains `buckets` + per-req `kind,bucket,slots,sources,notNeeded`.
- **Open design decisions flagged to the human (report):** (1) **yamabuki sign-off** for gap/question — built with muted ink until answered. (2) `cardState` precedence conflict>mismatch>agreed with gaps as slot-level annotation (matches the worked example's "agreed +N gaps") rather than gap as a badge state — confirm. (3) mismatch = {failed, not-reached}; `untested`→agreed-badge + dashed PROVEN; `changed` keeps its indigo chip — confirm.
