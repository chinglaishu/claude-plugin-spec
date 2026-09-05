# Expected View phase 8 (one base per screen state, one patch per moment) + the open residuals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Merged 2026-09-05 into the ONE plan** `docs/superpowers/plans/2026-09-05-storage-then-expected-phase8.md` (status page `docs/plan-storage-then-expected-2026-09-05.html`) — storage A (decision A, `docs/storage-userflow-2026-09-05.html` §5) runs FIRST and this phase is rebased on its data home. Still executed as written here: **A1, A2, B2, B3**. **Rewritten there, and the master is the source: A3** (no `_base/` directory and no hand refcount — the before replica's header is stripped and it lands by `putBlob`; the blob name is the hash, the fold's gc is the refcount), **A4** (`data-repbase` is a `blob/…` rel fetched at `/blob/`), **A5** (bases grouped from the index, graded once; no orphan rule), **A6** (ships **0.46.0**, not 0.45.0 — that number is the data home's; ports 4199/4198). **B1 retired** (after storage A nothing derived is committed, so there are no committed bytes to grade). **C5 ruled A**; **C6 half-open** (T14 vendors and imports without the backend). The status page named in the constraints below is superseded by the master's.

**Goal:** The Expected picture of a beat becomes ONE shared base replica of the screen's Given state (content-hashed, drawn faded as context) with the moment's own patch grafted onto the element it re-captured, so both cells of a row show the same field of view; and the residuals the final re-review left are closed.

**Architecture:** The capture (`spec/_replica.mjs`) keeps producing one HTML per moment; three things change around it. (1) Every file's classes are namespaced by the moment key so two files can share one document. (2) The patch root records the DOM path of its scene root, so the reader can find the element it replaces in the base. (3) The fold (`spec/_results-reporter.mjs` + `tools/evidence.mjs`) content-hashes the beat's body-rooted BEFORE replica into `spec/<screen>/evidence/_base/<hash>.html`, shared and refcounted; the reader (`tools/board/client.js` + a new pure `tools/board/graft.js`) builds the moment's srcdoc as base + patch; the gate (`tools/proof-integrity.mjs checkReplicas`) grades a base once against the beats that share it. The human approved the meaning on 2026-09-05 (docs/expected-base-patch-2026-09-05.html §4).

**Tech Stack:** Node 20 ESM, Playwright 1.62 (`playwright.board.ts`), `node:test` unit tests (`npm run test:tools`), the board's own spec (`spec/board/test.spec.ts`, `checkReq`), `npm run proof mirror|lint`.

## Global Constraints

- Rule 1: every behaviour change is red-first; a composed flow is exempt at flow level only.
- Rule 3: never fake a green; a moment with no base shows "no Expected for this moment" honestly.
- Rule 7: fix your own defects in the turn you find them.
- Stage files explicitly (`git add <paths>`), never `git add -A` — another agent shares this tree.
- Never test against the live boards (4173 own, 4175 demo, 4174 dojostack). Suite runs use a free `BOARD_PORT` (4176 for demo/todo).
- Never pass `--reporter` or `-g` to Playwright; wait for the fold's "N drawing(s) written" line before gating.
- Design system: no raw hex in the board; sizes on the type scale; contrast ≥ 4.5:1. Class names in `tools/board/*.js` are inlined verbatim into board.html — `node --check` them.
- Version: bump `.claude-plugin/plugin.json` AND `.claude-plugin/marketplace.json` together; this phase ships as **0.45.0** (a change in what the Expected file means). Interim commits may use 0.45.0-a, -b, …
- Vendor into `demo/todo` after each shippable task (`node tools/update.mjs demo/todo`), harvest it on `BOARD_PORT=4176` with the app up on 4319 (`cd demo/todo && node serve-app.mjs &`), and check `demo/todo/spec/todo/evidence` by eye (R9 is red on purpose; never make it green).
- The HTML plan page with statuses is `docs/expected-base-patch-plan-2026-09-05.html`; update its status chips at every task's commit.
- The other worktree rule: NEVER `git worktree add`; work in this checkout.

---

## Status at the start of the plan (2026-09-05)

| id | task | status |
|---|---|---|
| — | Expected view phases 1–7, one HTML per moment, 0.44.1 | done, pushed |
| — | 0.44.2: a circle's `stroke-dasharray`/`stroke-dashoffset` travel (the demo's R3 ring) | done, pushed |
| A1–A6 | phase 8 below | to do |
| B1–B3 | residuals below | to do |
| C1–C6 | rulings the human has not given (listed at the end) | waiting on the human |

---

## Part A — Phase 8: one base per screen state, one patch per moment

### Task A1: Namespace every replica's classes by its moment key

**Files:**
- Modify: `spec/_replica.mjs` (classOf, ~line 475–552; root attrs ~line 1366–1376; the rebuild's class reading ~line 1296–1340)
- Modify: `spec/_base.ts` (captureMoment, ~line 1354–1390: pass `key`)
- Modify: `tools/replica-gate.mjs` (`replicaAttrs`, ~line 330–345: read `data-replica-ns`)
- Test: `tools/replica.test.mjs`, `tools/replica-gate.test.mjs`

**Interfaces:**
- Consumes: `captureReplica(arg)` (spec/_replica.mjs:105) — `arg` gains `key: string` (`"<screen>:<id>#b<n>/<phase or vK>"`).
- Produces: class names `"<ns>N"` where `ns = 'r' + fnv6(key)` (six lowercase base-36 chars), the root attribute `data-replica-ns="<ns>"`, and `replicaAttrs(html).ns`. Every later task reads `ns` from the root attribute, never by regex on class names.

- [ ] **Step 1: Write the failing tests**

Append to `tools/replica.test.mjs` (the `el`, `cap` helpers and the stub DOM are at the top of that file):

```js
test('two captures of two moments never share a class name, and the root says which namespace it is', () => {
  const leaf = () => el('span', [300, 200, 40, 20], { text: 'Draft', cs: { color: 'rgb(79, 70, 229)', 'font-size': '12px' } })
  const body = () => el('body', [0, 0, 1440, 900], { children: [el('div', [280, 190, 80, 40], { children: [leaf()], cs: { display: 'flex' } })] })
  const a = cap(body(), { target: null, ring: { x: 300, y: 200, width: 40, height: 20 }, key: 'todo:R3#b1/v1' })
  const b = cap(body(), { target: null, ring: { x: 300, y: 200, width: 40, height: 20 }, key: 'todo:R3#b1/after' })
  const classes = h => new Set((h.match(/class="([^"]+)"/g) || []).flatMap(m => m.slice(7, -1).split(/\s+/)).filter(c => c !== 'rep'))
  const A = classes(a.html); const B = classes(b.html)
  assert.ok(A.size > 0 && B.size > 0)
  for (const c of A) assert.ok(!B.has(c), 'class ' + c + ' is shared by two moments')
  assert.match(a.html, /data-replica-ns="r[a-z0-9]{6}"/, 'the root names its namespace')
  assert.ok(!/\.rep \.r\d+\{/.test(a.html), 'no bare rN rule survives: ' + a.html.slice(0, 200))
})

test('the namespace is a pure function of the key — a re-harvest of the same moment writes the same classes', () => {
  const body = () => el('body', [0, 0, 1440, 900], { children: [el('span', [10, 10, 40, 20], { text: 'x', cs: { color: 'rgb(1, 2, 3)' } })] })
  const a = cap(body(), { target: null, ring: { x: 10, y: 10, width: 40, height: 20 }, key: 'k' })
  const b = cap(body(), { target: null, ring: { x: 10, y: 10, width: 40, height: 20 }, key: 'k' })
  assert.equal(a.html, b.html)
})
```

Append to `tools/replica-gate.test.mjs`:

```js
test('replicaAttrs reads the namespace off the root', () => {
  const html = '<style>.rep .rab12cd0{color:red}</style><div class="rep rab12cd0" data-replica-kit="replica-1" data-replica-ns="rab12cd" data-replica-region="0 0 10 10"></div>'
  assert.equal(replicaAttrs(html).ns, 'rab12cd')
})
```

- [ ] **Step 2: Run them, watch them fail**

Run: `node --test tools/replica.test.mjs tools/replica-gate.test.mjs 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: the three new tests `not ok` (classes are `r0…`, no `data-replica-ns`, `ns` undefined).

- [ ] **Step 3: Implement**

In `spec/_replica.mjs`, near the top of `captureReplica` (after `const target = …`):

```js
  // THE NAMESPACE (phase 8, 2026-09-05). Every replica used to name its classes r0…rN, so two files in
  // one document restyled each other — the base-plus-patch mock collapsed the base's grid into a 26 px
  // button. A short hash of the moment key prefixes every class, deterministic so a re-harvest of the
  // same moment writes the same bytes. Six base-36 chars of FNV-1a: enough that two moments of one
  // screen never collide in practice, and short enough to stay under the byte cap.
  const NS = (() => {
    const key = String((arg && arg.key) || '')
    let h = 0x811c9dc5
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
    return 'r' + (h >>> 0).toString(36).padStart(7, '0').slice(-6)
  })()
```

Then every place that mints a class (`cls = 'r' + seen.size` at ~549 and ~1329) becomes `cls = NS + seen.size`. The root attrs (~1370) gain `['data-replica-ns', NS]`. The rebuild that parses a prior file (`rawRoot`, ~1296) already reads class names from the DOM and the css map from the `<style>`, so it needs no change — verify by running the existing `replica-chain` tests. In `tools/replica-gate.mjs` `replicaAttrs`, add `ns: attrOf(tag, 'data-replica-ns')`.

In `spec/_base.ts` `captureMoment` (~line 1370, the `page.evaluate(MOMENT_FN, {...})` arg): add

```ts
      key: `${scr}:${id}#b${beat}/${phase}`,
```

where `scr`, `id`, `beat`, `phase` are the values `snapPhase`/`snapValue` already hold for this moment (thread them into `captureMoment` as parameters if they are not in scope; `snapReplica` derives `scr` the same way at ~line 1176).

- [ ] **Step 4: Run the unit suite**

Run: `npm run test:tools 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`. If `replica-chain.test.mjs` fails on a class regex, the test was asserting the OLD `rN` shape — fix the assertion to read the namespace from the root (rule 4: the test was correctly broken).

- [ ] **Step 5: Commit**

```bash
git add spec/_replica.mjs spec/_base.ts tools/replica-gate.mjs tools/replica.test.mjs tools/replica-gate.test.mjs
git commit -m "feat(replica): classes are namespaced by the moment key, so two replicas can share one document — phase 8 A1"
```

---

### Task A2: The patch records the DOM path of its scene root

**Files:**
- Modify: `spec/_replica.mjs` (root attrs ~line 1366–1376; the root-selection block ~line 300–316 where `root` is chosen)
- Modify: `tools/replica-gate.mjs` (`replicaAttrs`: `path`)
- Test: `tools/replica.test.mjs`, `tools/replica-gate.test.mjs`

**Interfaces:**
- Produces: root attribute `data-replica-path="i/j/k"` — the element-child indices from `document.body` down to the scene root (`""` for a body-rooted capture). Indices count ELEMENT children only. `replicaAttrs(html).path` returns it as a string (`""` when absent).

- [ ] **Step 1: Failing tests**

`tools/replica.test.mjs`:

```js
test('the root carries the element-child path from body to the scene root, and a body-rooted capture carries the empty path', () => {
  const leaf = el('span', [300, 200, 40, 20], { text: 'Draft', cs: { color: 'rgb(1, 2, 3)' } })
  const row = el('div', [280, 190, 738, 70], { children: [leaf], cs: { display: 'flex' } })
  const list = el('div', [270, 180, 760, 300], { children: [el('div', [270, 180, 760, 10], {}), row], cs: { display: 'block' } })
  const main = el('main', [230, 0, 1210, 900], { children: [el('h1', [240, 20, 200, 30], { text: 'All tasks' }), list] })
  const body = el('body', [0, 0, 1440, 900], { children: [el('aside', [0, 0, 230, 900], {}), main] })
  const r = cap(body, { target: leaf, ring: { x: 300, y: 200, width: 40, height: 20 }, key: 'k' })
  assert.match(r.html, /data-replica-path="1\/1\/1"/, 'main is body[1], list is main[1], row is list[1]: ' + r.html.slice(0, 300))
  const whole = cap(body, { target: null, ring: null, key: 'k0' })
  assert.match(whole.html, /data-replica-path=""/)
})
```

`tools/replica-gate.test.mjs`:

```js
test('replicaAttrs reads the path off the root, empty when absent', () => {
  assert.equal(replicaAttrs('<div class="rep" data-replica-path="1/0/3"></div>').path, '1/0/3')
  assert.equal(replicaAttrs('<div class="rep"></div>').path, '')
})
```

- [ ] **Step 2: Run, watch them fail** — `node --test tools/replica.test.mjs tools/replica-gate.test.mjs`

- [ ] **Step 3: Implement**

In `spec/_replica.mjs`, right after `root` is final (after `if (!root) root = doc.body || null`):

```js
  // WHERE THE PATCH GOES BACK (phase 8): the element-child path from body to this scene root, so the
  // reader can graft this moment onto the same element of the screen's base replica. Element children
  // only — text nodes and the base's own <style> never count, and placeholders keep their slots.
  const rootPath = (() => {
    const parts = []
    for (let n = root; n && n !== doc.body; n = n.parentElement) {
      const p = n.parentElement; if (!p) break
      let i = 0; for (const k of (p.children || [])) { if (k === n) break; i++ }
      parts.unshift(i)
    }
    return parts.join('/')
  })()
```

and add `['data-replica-path', rootPath]` to `rootAttrs`. The stub DOM in the test has `children` and `parentElement` (check `el()` at the top of `tools/replica.test.mjs`; if `parentElement` is not wired, wire it there: `for (const k of children) k.parentElement = node`). In `replicaAttrs`: `path: attrOf(tag, 'data-replica-path')`.

- [ ] **Step 4: `npm run test:tools` green.**

- [ ] **Step 5: Commit**

```bash
git add spec/_replica.mjs tools/replica-gate.mjs tools/replica.test.mjs tools/replica-gate.test.mjs
git commit -m "feat(replica): the root records the element path of its scene root — phase 8 A2"
```

---

### Task A3: The fold stores one base per screen state, content-hashed, refcounted

**Files:**
- Modify: `tools/evidence.mjs` (new pure helpers beside `beatEvidencePaths` ~line 83; `foldEvidence` ~line 555 prune)
- Modify: `spec/_results-reporter.mjs` (the beat-row fold ~line 279–310 where `replicaExpectedBefore` is copied)
- Test: `tools/evidence.test.mjs`, `tools/evidence-fold.test.mjs`

**Interfaces:**
- Produces in `tools/evidence.mjs`:
  - `baseEvidencePath(screen, hash) → "spec/<screen>/evidence/_base/<hash>.html"`
  - `baseHashOf(html) → string` — sha256 (hex, first 12) of the file WITHOUT its first html comment line (the header names the moment, and two identical pages captured for two moments must hash the same)
  - the beat entry gains `base: "<path>|null"`; `replicaExpectedBefore` is REMOVED from new entries (the before moment's picture IS the base).
  - `foldEvidence` prunes a `_base/*.html` file only when no beat of that screen references it (refcount, exactly like the video at ~line 557).
- Consumes: the reporter's per-beat row built at ~line 279.

- [ ] **Step 1: Failing tests**

`tools/evidence.test.mjs`:

```js
import { baseEvidencePath, baseHashOf } from './evidence.mjs'
test('phase 8: a base is named by the hash of its body, header line excluded', () => {
  const a = '<!-- specboard replica-1 · todo:R3 b1 before · Expected · sanitised, no script -->\n<style>.rep .rab{}</style><div class="rep rab"></div>'
  const b = '<!-- specboard replica-1 · todo:R1 b1 before · Expected · sanitised, no script -->\n<style>.rep .rab{}</style><div class="rep rab"></div>'
  assert.equal(baseHashOf(a), baseHashOf(b), 'two moments of the same page share one base')
  assert.notEqual(baseHashOf(a), baseHashOf(a.replace('rab"></div>', 'rab">x</div>')))
  assert.equal(baseEvidencePath('todo', baseHashOf(a)), 'spec/todo/evidence/_base/' + baseHashOf(a) + '.html')
  assert.match(baseHashOf(a), /^[0-9a-f]{12}$/)
})
```

`tools/evidence-fold.test.mjs` (follow the file's existing fixture style for `index` and `entries`; the video refcount test there is the model):

```js
test('phase 8: a base file is pruned only when no beat of the screen references it any more', () => {
  const index = { todo: { evidence: { R1: { beats: [{ n: 1, base: 'spec/todo/evidence/_base/aaaaaaaaaaaa.html' }] },
                                     R3: { beats: [{ n: 1, base: 'spec/todo/evidence/_base/aaaaaaaaaaaa.html' }] } } } }
  const fresh = [{ screen: 'todo', id: 'R3', entry: { beats: [{ n: 1, base: 'spec/todo/evidence/_base/bbbbbbbbbbbb.html' }] } }]
  const prune = foldEvidence(index, fresh)
  assert.ok(!prune.includes('spec/todo/evidence/_base/aaaaaaaaaaaa.html'), 'R1 still references it')
  const prune2 = foldEvidence(index, [{ screen: 'todo', id: 'R1', entry: { beats: [{ n: 1, base: 'spec/todo/evidence/_base/bbbbbbbbbbbb.html' }] } }])
  assert.ok(prune2.includes('spec/todo/evidence/_base/aaaaaaaaaaaa.html'), 'now nothing does')
})
```

- [ ] **Step 2: Run, watch them fail** — `node --test tools/evidence.test.mjs tools/evidence-fold.test.mjs`

- [ ] **Step 3: Implement**

`tools/evidence.mjs`:

```js
import { createHash } from 'node:crypto'
// ONE BASE PER SCREEN STATE (phase 8, the human 2026-09-05: "build a schematic page and use that page in
// all test cases"). The before moment of every beat is body-rooted — no ring, so the scene root is the
// body — and two beats that start from the same page produced the same bytes three times over
// (demo/todo's R1/R2/R3 before files). The base is that file, named by the hash of its body so every
// beat that starts from the same state shares one; refcounted at the fold like the screen's video.
export function baseHashOf (html) {
  const body = String(html || '').replace(/^<!--[^\n]*-->\n?/, '')
  return createHash('sha256').update(body).digest('hex').slice(0, 12)
}
export function baseEvidencePath (screen, hash) {
  return `spec/${screen}/evidence/_base/${hash}.html`
}
```

In `foldEvidence`, beside the video refcount: collect `base` paths across every entry of the screen after the fold; a base path named by an OLD entry and referenced by no entry afterwards goes into `prune`. Keep `replicaExpectedBefore` in the keep-set for LEGACY entries (a fold from before this) so their files are pruned once superseded, not left behind.

`spec/_results-reporter.mjs` ~line 292 (the `for (const key of ['replicaExpectedBefore', 'replicaExpectedAfter'])` copy loop): for `replicaExpectedBefore`, instead of copying to the deterministic `.before.expected.html` path, read the attachment's bytes, compute `baseHashOf`, write to `baseEvidencePath(scr, hash)` (mkdir `_base`), set `row.base = thatPath`, and do NOT set `row.replicaExpectedBefore`. `noteReplica(…, 'before')` (~line 302/309) reads the gate verdict from the file: pass `row.base` to it.

- [ ] **Step 4: `npm run test:tools` green**, then `node --check spec/_results-reporter.mjs`.

- [ ] **Step 5: Harvest this repo's `spec/init` on a free port and inspect**

Run: `BOARD_PORT=4177 npx playwright test --config=playwright.board.ts spec/init/test.spec.ts` (wait for "N drawing(s) written").
Expected: `spec/init/evidence/_base/*.html` exists, every beat in `spec/_results-index.json` under `init` has `base`, no new `.before.expected.html`, and the old ones are gone (pruned).

- [ ] **Step 6: Commit** (stage the code, the index and the init evidence explicitly)

```bash
git add tools/evidence.mjs spec/_results-reporter.mjs tools/evidence.test.mjs tools/evidence-fold.test.mjs spec/_results-index.json spec/init/evidence
git commit -m "feat(fold): one base replica per screen state, content-hashed and refcounted — phase 8 A3"
```

---

### Task A4: The reader grafts the patch onto the base, one camera on both cells

**Files:**
- Create: `tools/board/graft.js` (pure, inlined verbatim like `stepper.js`/`words.js`; exposes `globalThis.SBGraft`)
- Create: `tools/graft.test.mjs`
- Modify: `tools/build-board.mjs` (inline the new file next to where `words.js` is read; add the `[data-ctx]` rule to the srcdoc CSS in `repSrcdoc` — that CSS lives in `client.js`, see below)
- Modify: `tools/board/client.js` (`replicaCell` ~line 2260–2340: `paint(j)`; `repSrcdoc` ~line 1402: the `[data-ctx]` rule; the `values`/`shot` builders ~line 1765–1830: carry the beat's `base`)
- Modify: `spec/board/prd.md` R18 + R19 prose (the human approved the meaning 2026-09-05; write the reason inline, rule 6)
- Test: `tools/graft.test.mjs`; `spec/board/test.spec.ts` (R18 at ~1349, R19 at ~1846)

**Interfaces:**
- `SBGraft.graft(baseRoot, patchRoot, path) → { ok: boolean, why: string }` — `baseRoot`/`patchRoot` are DOM-like nodes (`children`, `replaceWith`, `setAttribute`, `parentElement`); walks `path` ("1/1/1") from `baseRoot` by element children; on success replaces the found element with `patchRoot`, and marks every element that is NOT an ancestor of the graft point and NOT inside the patch with `data-ctx="1"`. Empty `path` → `{ ok: true, why: 'whole page' }` and no marking (the moment IS the base).
- `SBGraft.plan(basePath, patchPath)`: returns the list of ancestor indices to leave unfaded — used by the marking.
- The reader's cell dataset gains `data-repbase="<base path>"`; `data-repsrc` keeps naming the patch.

- [ ] **Step 1: Failing unit test** — `tools/graft.test.mjs` with a tiny stub node (same shape `replica.test.mjs` uses):

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
new Function(readFileSync(new URL('./board/graft.js', import.meta.url), 'utf8'))()   // defines globalThis.SBGraft
const node = (tag, kids = []) => { const n = { tag, children: kids, attrs: {}, parentElement: null,
  setAttribute (k, v) { this.attrs[k] = String(v) }, replaceWith (o) { const p = this.parentElement; const i = p.children.indexOf(this); p.children[i] = o; o.parentElement = p } }
  for (const k of kids) k.parentElement = n; return n }
test('graft replaces the element at the path and fades everything off the path', () => {
  const row = node('div'); const other = node('div'); const list = node('div', [other, row]); const aside = node('aside'); const body = node('body', [aside, node('main', [node('h1'), list])])
  const patch = node('div')
  const r = SBGraft.graft(body, patch, '1/1/1')
  assert.equal(r.ok, true)
  assert.equal(list.children[1], patch, 'the patch stands where the row stood')
  assert.equal(aside.attrs['data-ctx'], '1'); assert.equal(other.attrs['data-ctx'], '1')
  assert.equal(list.attrs['data-ctx'], undefined, 'an ancestor of the graft keeps full ink')
  assert.equal(patch.attrs['data-ctx'], undefined)
})
test('an empty path is the whole page: nothing replaced, nothing faded', () => {
  const body = node('body', [node('div')]); const r = SBGraft.graft(body, node('div'), '')
  assert.equal(r.ok, true); assert.equal(body.children[0].attrs['data-ctx'], undefined)
})
test('a path the base cannot follow is refused with a reason, and the base is untouched', () => {
  const body = node('body', [node('div')]); const r = SBGraft.graft(body, node('div'), '0/4')
  assert.equal(r.ok, false); assert.match(r.why, /no element at 0\/4/)
})
```

- [ ] **Step 2: Run it, watch it fail** — `node --test tools/graft.test.mjs` → `SBGraft is not defined` / file missing.

- [ ] **Step 3: Write `tools/board/graft.js`**

```js
// THE GRAFT (phase 8, 2026-09-05). The Expected of a moment is the screen's BASE replica (its Given,
// shared by every beat that starts from that state) with this moment's PATCH — the scene root the
// capture re-measured — standing where the same element stands in the base. Pure over a DOM-like
// node shape so it is unit-tested in node (tools/graft.test.mjs) and inlined verbatim into board.html.
;(function (root) {
  function walk (base, path) {
    if (!path) return base
    let n = base
    for (const s of String(path).split('/')) {
      const i = Number(s); const kids = (n && n.children) || []
      if (!Number.isInteger(i) || i < 0 || i >= kids.length) return null
      n = kids[i]
    }
    return n
  }
  function graft (base, patch, path) {
    if (!path) return { ok: true, why: 'whole page' }
    const at = walk(base, path)
    if (!at) return { ok: false, why: 'no element at ' + path + ' in the base' }
    const keep = new Set()
    for (let n = at; n && n !== base; n = n.parentElement) keep.add(n)
    keep.add(base)
    ;(function mark (n) {
      for (const k of (n.children || [])) {
        if (k === at) continue
        if (!keep.has(k)) k.setAttribute('data-ctx', '1')
        mark(k)
      }
    })(base)
    at.replaceWith(patch)
    return { ok: true, why: '' }
  }
  root.SBGraft = { graft: graft, walk: walk }
})(typeof globalThis !== 'undefined' ? globalThis : this)
```

- [ ] **Step 4: Unit test green** — `node --test tools/graft.test.mjs`; `node --check tools/board/graft.js`.

- [ ] **Step 5: Failing board tests (red-first, in `spec/board/test.spec.ts`)**

Inside the R18 test (~line 1349), add a `checkReq('R18', …)` block; inside the R19 test (~1846) one more:

```ts
  await checkReq('R18', async () => {
    // PHASE 8: a value moment's Expected is the beat's BASE with the moment's patch grafted in — the
    // srcdoc carries words from OUTSIDE the patch (the base's context, faded) AND the patch's own root.
    const cell = page.locator('.sbrep[data-repbase]').first()
    await proveVisible(cell, /spec\/.*\/evidence\/_base\/[0-9a-f]{12}\.html/, 'the cell names the base it drew', { attr: 'data-repbase', soft: true })
    const doc = await page.locator('.sbrep iframe.repframe').first().getAttribute('srcdoc')
    expect(doc && /data-ctx="1"/.test(doc), 'context outside the patch is marked').toBe(true)
    expect(doc && /data-replica-path="/.test(doc), 'the patch root is in the document').toBe(true)
  })
```

```ts
  await checkReq('R19', async () => {
    // both cells frame the same page: the Expected srcdoc is page-sized (the base's region is the viewport)
    const doc = await page.locator('.sbrep iframe.repframe').first().getAttribute('srcdoc')
    expect(doc && /data-replica-region="0 -?\d+ 1440 900"/.test(doc), 'the base is the whole page').toBe(true)
  })
```

(`proveVisible` with `{ attr }` — if the helper has no attribute mode, use `expect(await cell.getAttribute('data-repbase')).toMatch(...)` and keep the `proveVisible` on a visible fact of the cell, e.g. the chip.) Run the board spec on a free port and watch these go red: `BOARD_PORT=4177 npx playwright test --config=playwright.board.ts spec/board/test.spec.ts`.

- [ ] **Step 6: Implement the reader**

`tools/build-board.mjs`: read `tools/board/graft.js` verbatim into the page exactly where `words.js` is read (search `words.js`), before `client.js`.

`tools/board/client.js`:
1. In `values(b)` / the `shot(...)` builder (~1765): add `base: b.base || ''` to every shot of the beat (`shot` gains a `base` field).
2. In `repSrcdoc(parts)` CSS list: add `'[data-ctx]{opacity:.4;filter:saturate(.5)}'`.
3. In `replicaCell.paint(j)`: after `repBody(got[0])`:

```js
          const patchHtml = body
          if (sh.base && sh.repSide === 'expected') {
            repFetch(sh.base).then(function (baseText) {
              if (mine !== seq || !fr.isConnected) return
              const baseBody = repBody(baseText)
              const path = repAttr(got[0], 'data-replica-path')
              if (!baseBody) { fr.dataset.repbase = ''; paintLone(); return }
              const p = new DOMParser().parseFromString('<div id="b">' + baseBody + '</div><div id="p">' + patchHtml + '</div>', 'text/html')
              const baseRoot = p.querySelector('#b > .rep'); const patchRoot = p.querySelector('#p > .rep')
              const styles = Array.from(p.querySelectorAll('style')).map(function (s) { return s.outerHTML }).join('')
              const g = window.SBGraft.graft(baseRoot, patchRoot, path)
              if (!g.ok) { fr.dataset.repbase = ''; fr.dataset.repwhy = g.why; paintLone(); return }
              fr.dataset.repbase = sh.base
              show(repSrcdoc({ body: styles + baseRoot.outerHTML, faces: got[1] || '', plates: [],
                region: repRect(baseText, 'data-replica-region'), ring: repRect(got[0], 'data-ring-box'),
                ok: !failedClaims(sh).length, vw: vp.vw, vh: vp.vh }))
              fr.dataset.repside = sh.repSide; fr.dataset.repsrc = sh.rep; fr.dataset.repmoment = String(j)
            })
            return
          }
          paintLone()
```

where `paintLone` is the existing body of `paint` (the current `show(repSrcdoc({...}))` block) extracted into a local function — a moment with no base (a legacy harvest, a body-rooted moment, a refused graft) still shows exactly what it shows today. The `ring` stays this moment's ring box, so the chip and the camera (`momentCam`) need no change: the base is page-sized and the patch stands at its own coordinates.

4. `spec/board/prd.md` R18: replace the paragraph that begins "The Expected half of a beat row used to be a **drawing**" so it says the picture is the beat's base plus the moment's patch, and why (2026-09-05, the human: one page per screen state instead of one whole replica per moment; the mock docs/expected-base-patch-2026-09-05.html). R19: add one sentence that both cells are page-sized so one camera frames both by construction.

- [ ] **Step 7: Board spec green on the free port; then `node --check tools/board/client.js tools/board/graft.js`; `npm run board:build`.**

Run: `BOARD_PORT=4177 npx playwright test --config=playwright.board.ts spec/board/test.spec.ts` → wait for the fold. Expected: all green except nothing (this repo has no intentionally-red board test). Then `npm run proof mirror` → exit 0 (A5 may be needed first if the gate refuses `_base` files: in that case do A5 before this step's gate and come back).

- [ ] **Step 8: Commit**

```bash
git add tools/board/graft.js tools/graft.test.mjs tools/build-board.mjs tools/board/client.js spec/board/prd.md spec/board/test.spec.ts spec/_results-index.json spec/board/evidence board.html
git commit -m "feat(reader): the Expected is the beat's base with the moment's patch grafted in, one camera on both cells — phase 8 A4"
```

---

### Task A5: The gate grades a base once, against every beat that shares it

**Files:**
- Modify: `tools/proof-integrity.mjs` (`REPLICA_FILE` line 280; `checkReplicas` 281–330)
- Modify: `tools/replica-gate.mjs` only if `replicaNote` needs the base path (check its signature first)
- Test: `tools/proof-integrity.test.mjs`

**Interfaces:**
- `checkReplicas(spec)` rows gain `kind: 'base' | 'moment'`. For a base: `file = spec/<screen>/evidence/_base/<hash>.html`; its `data-replica-layout` pin must equal `layoutHash` of the BEFORE skeleton (`<id>.b<n>.before.layout.json`) of EVERY beat in the screen's index whose `base` is this file; a base no beat references is a row `ok:false, why:'orphan base — nothing in the index references it'`; a beat whose `base` file is missing is a row `ok:false`.

- [ ] **Step 1: Failing tests** (`tools/proof-integrity.test.mjs` builds scratch spec trees with `mkdtempSync`; follow its existing `checkReplicas` fixture, e.g. the "leftover .actual.html is refused" test):

```js
test('phase 8: a base shared by two beats is graded once and both before skeletons must match its pin', () => {
  const dir = scratchSpec()   // the file's helper that writes spec/<screen>/evidence and _results-index.json
  writeIndex(dir, { todo: { evidence: { R1: { beats: [{ n: 1, base: 'spec/todo/evidence/_base/abcdefabcdef.html' }] }, R3: { beats: [{ n: 1, base: 'spec/todo/evidence/_base/abcdefabcdef.html' }] } } } })
  const lay = { w: 1440, h: 900, els: [] }
  writeFile(dir, 'spec/todo/evidence/R1.b1.before.layout.json', JSON.stringify(lay))
  writeFile(dir, 'spec/todo/evidence/R3.b1.before.layout.json', JSON.stringify({ ...lay, els: [{ x: 1, y: 1, w: 1, h: 1, kind: 'text', text: 'moved' }] }))
  writeFile(dir, 'spec/todo/evidence/_base/abcdefabcdef.html', '<div class="rep" data-replica-kit="replica-1" data-replica-region="0 0 1440 900" data-replica-path="" data-replica-layout="' + layoutHash(lay, null) + '" data-replica-gaps="[]"></div>')
  const rows = checkReplicas(join(dir, 'spec')).filter(r => r.kind === 'base')
  assert.equal(rows.length, 1, 'one row for the shared base')
  assert.equal(rows[0].ok, false)
  assert.match(rows[0].why, /R3 b1: the harvest is newer than the base/)
})
test('phase 8: an orphan base is refused', () => {
  const dir = scratchSpec(); writeIndex(dir, { todo: { evidence: {} } })
  writeFile(dir, 'spec/todo/evidence/_base/000000000000.html', '<div class="rep" data-replica-layout="x" data-replica-gaps="[]"></div>')
  const r = checkReplicas(join(dir, 'spec')).find(x => x.kind === 'base'); assert.equal(r.ok, false); assert.match(r.why, /orphan/)
})
```

- [ ] **Step 2: Run, watch them fail.**

- [ ] **Step 3: Implement** — in `checkReplicas`: read `spec/_results-index.json` once; build `refs: Map<basePath, [{id, n}]>` from every screen's `evidence[id].beats[].base`; when listing a screen's evidence dir also list `_base/` and push a `kind:'base'` row per file: pin present, `gaps` from its root, orphan check, and for each ref compare the pin with `layoutHash(readJSON(<id>.b<n>.before.layout.json), null)` — mismatch → `why += '<id> b<n>: the harvest is newer than the base'`. Moment rows keep today's rules; a moment row whose beat has `base` but the file is missing → `ok:false, why:'its base is gone'`. Extend `REPLICA_FILE` to still match moment files; base files are matched by the `_base/` directory, not by the regex.

- [ ] **Step 4: `npm run test:tools` green; `npm run proof mirror` exit 0 on this repo and in `demo/todo` after A6's re-harvest.**

- [ ] **Step 5: Commit**

```bash
git add tools/proof-integrity.mjs tools/proof-integrity.test.mjs
git commit -m "feat(gate): a base is graded once against every beat that shares it — phase 8 A5"
```

---

### Task A6: Ship 0.45.0 — full suite, demo real-data check, docs, vendor

**Files:**
- Modify: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (0.45.0)
- Modify: `CLAUDE.md` (Architecture: the `evidence/_base/` line; the trap paragraph on evidence: "the before moment's picture is the beat's base"; the mirror paragraph: a base graded once)
- Modify: `skills/kg-e2e/SKILL.md` (one sentence under the Expected/replica note: the Given is captured body-rooted once per state and shared)
- Modify: `tools/_skeleton.mjs` FILES: add `tools/board/graft.js`; `tools/update.test.mjs` pins it (the words.js test at ~175–186 is the model)
- Modify: `docs/expected-base-patch-plan-2026-09-05.html` statuses

- [ ] **Step 1:** `tools/update.test.mjs`: copy the `words.js` pin test for `graft.js`; run → red; add to FILES → green.
- [ ] **Step 2:** Full suite here: `BOARD_PORT=4177 npx playwright test --config=playwright.board.ts` (≈30 min; wait for the fold). Expected: 82+ passed, the new R18/R19 claims included.
- [ ] **Step 3:** `npm run proof mirror && npm run proof lint` exit 0.
- [ ] **Step 4:** Bump to 0.45.0 in both json files. `node tools/update.mjs demo/todo`; `cd demo/todo && node serve-app.mjs &`; `BOARD_PORT=4176 npx playwright test --config=playwright.board.ts spec/todo/test.spec.ts`; both gates in demo exit 0; `node tools/build-board.mjs` there. Open http://localhost:4175/#/todo, R3 beat 1: the Expected shows the faded card with the row in full ink, the arc at 1/3, the same crop as the photograph. Screenshot it to `docs/superpowers/mockups/2026-09-05-phase8-r3-live.png`.
- [ ] **Step 5:** Docs (CLAUDE.md, skill, plan page statuses). `npm run test:tools` once more.
- [ ] **Step 6: Commit and push**

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json CLAUDE.md skills/kg-e2e/SKILL.md tools/_skeleton.mjs tools/update.test.mjs docs/expected-base-patch-plan-2026-09-05.html docs/superpowers/mockups/2026-09-05-phase8-r3-live.png demo/todo/spec/_specboard.json demo/todo/spec/_results-index.json demo/todo/spec/todo/evidence spec/_results-index.json spec/*/evidence board.html
git commit -m "chore(release): 0.45.0 — the Expected is one base per screen state plus a patch per moment (phase 8)"
git push origin main
```

---

## Part B — Residuals from the final re-review of phases 1–7

### Task B1: CI grades the committed harvest, not only the fresh one

**Files:** `.github/workflows/e2e.yml` (the two `npm run proof …` steps after the suite, ~line 43–51)

- [ ] **Step 1:** Add, BEFORE the `npx playwright test` step, `- run: npm run proof mirror` and `- run: npm run proof lint` with the comment "the committed bytes are what a clone reads; grade them before the suite rewrites them". Keep the two after-suite runs.
- [ ] **Step 2:** Add after the suite: `- run: git diff --stat --exit-code -- 'spec/*/evidence' '**/_results-index.json' || (echo "::warning::the suite rewrote committed evidence — re-fold and commit" && true)` (a warning, not a failure: per-screen partial harvests in CI are normal — see `tools/ci-select.mjs`).
- [ ] **Step 3:** Commit `git add .github/workflows/e2e.yml`, push, watch the run with `gh run watch`. Expected: both gates pass before the suite on the committed tree.

### Task B2: The zero-claim waiver cannot be taken by a composed-flow block on an open page

**Files:** `tools/proof-integrity.mjs` (`opensPage` ~line 694), `tools/proof-integrity.test.mjs`

- [ ] **Step 1: Failing test**

```js
test('I3: a block that calls an imported steps function opens a page, so a zero-claim intentGap cannot waive it', () => {
  const bodies = { draftedRowBecomesCard: 'await page.click("x")' }
  assert.equal(opensPage('await draftedRowBecomesCard(page, state); intentGap("api only")', bodies), true)
  assert.equal(opensPage('await beats.typeTitle(state)', { typeTitle: 'await page.fill("#t", "x")' }), true)
  assert.equal(opensPage("await request.post('/api/run')", {}), false)
})
```

- [ ] **Step 2: Run, red.** — `node --test tools/proof-integrity.test.mjs`
- [ ] **Step 3: Implement** — in `opensPage(body, bodies)`: after the existing regexes, collect every identifier called as `name(` or `x.name(` in `body`; if `bodies[name]` exists and `opensPage(bodies[name], bodies)` (recursion with a `seen` set to stop cycles) is true, return true. `bodies` is the map of function bodies the lint already builds (`functionBodies`, fixed in phase 6 fix round 2) — pass it through where `opensPage` is called (~line 703, 778).
- [ ] **Step 4: `npm run proof lint` on this repo and in demo/todo** — expected: still exit 0, and the DECLARED count does not rise (if a block loses its waiver, that block needs a real claim or one `intentGap` per fact — do that, never a silent green).
- [ ] **Step 5: Commit** `git add tools/proof-integrity.mjs tools/proof-integrity.test.mjs` — `fix(lint): a call into steps.ts opens a page — the whole-beat waiver stays headless-only (final review I3)`.

### Task B3: A raw NUL byte in the reporter's source

**Files:** `spec/_results-reporter.mjs` (`commitVideo`, the cache key `screen + '\x00' + srcAbs` is written with a LITERAL NUL character, byte 11998)

- [ ] **Step 1:** Replace the literal byte with the escape `' '` (same runtime value). Verify: `python3 -c "print(open('spec/_results-reporter.mjs','rb').read().count(b'\x00'))"` → `0`; `file spec/_results-reporter.mjs` no longer says `data`; `grep -n commitVideo spec/_results-reporter.mjs` works without `-a`.
- [ ] **Step 2:** `npm run test:tools` green (the reporter tests cover `commitVideo`'s cache: `tools/reporter-*.test.mjs`).
- [ ] **Step 3:** Commit `git add spec/_results-reporter.mjs` — `fix(reporter): the video cache key's NUL is an escape, not a raw byte (grep read the file as binary)`.

---

## Part C — Waiting on the human (not schedulable; recommendation recorded)

| id | question | recommendation | where it is written |
|---|---|---|---|
| C1 | `checkReq(id, fn)` cannot name WHICH beat it proves; six beats carry a declared lint gap instead of a claim | add an optional `{ beat: n }` third argument; the lint scores block n against beat n | `tools/proof-integrity.mjs` comments; final-rereview I3/I4 |
| C2 | evidence is keyed by requirement, so a standalone `spec/init` run can replace `board:R1`'s beat (precedence rule holds it today) | key evidence by TEST (`<screen>/<test-slug>/…`); an index-shape change | CLAUDE.md trap "a cross-screen flow may not repaint…" |
| C3 | the moment strip names every segment; the plan's §3 described one caption | keep the names (the human asked for named moments on 2026-09-02) and drop §3's sentence | `docs/expected-view-plan-2026-09-03.html` §3 |
| C4 | board R7's wording was narrowed by an implementer and restored verbatim | keep verbatim; the narrowing was not the human's | `spec/board/prd.md` R7 comment |
| C5 | storage: D1 commit authored files inside `specboard/`; D2 cloud = private bucket + static board; D3 tools from the plugin; shrink steps 0 (gc) / 1 (untrack derived) / 2 (filter-repo) | D1 yes, D2 B, D3 yes later; steps 0+1 now, 2 when the other session is idle | `docs/storage-paths-2026-09-05.html` §7, §9 |
| C6 | dojostack's board is on 0.43.7; vendoring needs its backend up (401 at sign-in last time) | vendor 0.45.0 the day the backend is up: `node tools/update.mjs ~/workspace/dojostack/dojostack_main` | memory `specboard-sidecar-layout` |

---

## Self-review

- Spec coverage: §4 of the design names (a) namespace → A1, (b) base per Given state content-hashed and shared → A3, (c) reader graft + one camera → A4, (d) gate once per base → A5; the failure modes §3: two-instants → `[data-ctx]` fade in A4; class collisions → A1; graft by identity → A2 + A4; no base → `paintLone` fallback in A4. Release/vendor/real data → A6.
- Type consistency: `arg.key` (A1) ↔ `captureMoment` passes `key`; `data-replica-path` (A2) ↔ `repAttr(got[0], 'data-replica-path')` (A4) ↔ `replicaAttrs(html).path` (A2/A5); beat entry `base` (A3) ↔ `sh.base` (A4) ↔ `beats[].base` refs (A5); `SBGraft.graft(base, patch, path)` (A4 unit + client).
- Placeholders: none; every step has its command, code or file.
