# Storage A, then Expected phase 8 — the ONE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **RE-RULED 2026-09-05, FINAL SHAPE (the human, in three rulings: "like Langfuse hosted locally"; "reference claude-mem, media local-but-out-of-repo or a cloud blob url"; "test records into local db / remote db — team = remote db url + cloud blob url"). Design page: `docs/storage-references-design-2026-09-05.html`. Deltas over every task body below:**
> - **Where (claude-mem's pattern):** ALL derived data in `~/.specboard/<projectId>/` — the user's home directory, out of every repo by construction. `SPECBOARD_HOME` overrides it (tests, CI, artifact review). The interim `specboard/data/` idea is withdrawn.
> - **The db (switch 1):** the fold, run records and raw report are rows behind ONE **async** store interface with two drivers — `sqlite` (`board.db` via `better-sqlite3`, the default) or `pg` (a remote `SPECBOARD_DB_URL`). Every "index.json"/"runs.json"/"results.json" in the task bodies reads as these rows. The API is async from day one so the pg driver fits with no rewrite.
> - **The blobs (switch 2):** content-addressed `<sha256>.<ext>` behind a two-method driver (`put`, `remove`) — `fs` (`~/.specboard/<id>/blobs/`, served at `/blob/…`) or `s3` (the same sha-named object in any S3-compatible bucket; the db stores its URL). A picture reference is ONE column with two shapes — `blob/<sha>.<ext>` or `https://…` — and the client treats both as an opaque src. The switch moves the whole blob store.
> - **Team enablement = two values:** the remote db url + the cloud bucket. Set both and every teammate's local board and CI read/write the same record. Runs are append-only; the per-screen fold is latest-wins; gc's keep-set is computed from the shared db, so cleanup can never delete what another user's retained run names. A hosted read-only board is optional, later. Manifest commits modes + non-secret endpoints (`db`, `media`, `bucket`); secrets env-only (`SPECBOARD_DB_URL`, `SPECBOARD_S3_KEY/SECRET`); a remote mode missing its credentials fails the fold LOUDLY — never a silent local fallback.
> - **Task deltas:** T1 = the async store (schema + sqlite/pg + fs/s3; new deps: better-sqlite3, pg); T2's keep-set is a db query (either driver); T3 imports into db rows; T4's manifest carries `projectId` + `db`/`media` (+ `bucket`); T5/T7/T9/T10 call the async store; T8 serves `/blob/…` for the fs driver only; T15 zips the home-dir store; A3′–A5′ unchanged (`beats[].base` is a src column).
> - **Phase-8 ripples of the two-shape src (decided 2026-09-06):** wherever A4′/A5′ or a gate matches a base/replica reference, accept BOTH shapes — `^blob/[0-9a-f]{64}\.(html|png|json|…)$` OR an `https://` URL; the reader's `repFetch` and the proof gates (`proof mirror`) read blob bytes through the store's one `get(src)` (fs read or bucket fetch), never by building paths. Cloud mode requires a CORS GET rule on the bucket for the board's origin — documented at T13, and a fetch failure renders/reports loudly (a missing base leaves the test red / the gate row red), never silently local.

**Goal:** Every derived file leaves the repository for a content-addressed, gc'd store (`~/.specboard/<projectId>/`: the db behind the sqlite/pg switch + blobs behind the fs/s3 switch) and ships as **0.45.0**; then the Expected picture of a beat becomes one shared base per screen state plus a patch per moment, built ON that store, and ships as **0.46.0**.

**Architecture:** This plan is the ORDER and the DELTAS. The task bodies live in two source plans and are executed exactly as written there unless a task below says "amended" — then the amendment here is the source. Source plans: `docs/superpowers/plans/2026-09-05-storage-data-home.md` (T1–T16) and `docs/superpowers/plans/2026-09-05-expected-base-patch-and-residuals.md` (A1–A6, B1–B3, C1–C6). The reason they merge: phase 8's A3 wanted a base "content-hashed and refcounted" in `spec/<screen>/evidence/_base/` — the very directory storage A removes — and storage A builds exactly that property for every file (`putBlob` names by sha256, `gcBlobs` keeps what any record names). So storage first, and A3/A4/A5 shrink onto it; B1 is retired (nothing committed is left to grade); C5 is ruled. Status page: `docs/plan-storage-then-expected-2026-09-05.html` — update its chips at every task's commit.

**Tech Stack:** Node 20 ESM, Playwright 1.62 (`playwright.board.ts`), `node:test` (`npm run test:tools`), the board's own spec (`spec/board/test.spec.ts`, `checkReq`), `npm run proof mirror|lint`. No new dependency.

## Global Constraints

- The decision (the human, 2026-09-05, `docs/storage-userflow-2026-09-05.html` §5, option A): "the local fold stays a file and a blob directory, and the database arrives with the team store." No SQLite, no Postgres, no bucket in this plan.
- The codebase rule (the human, 2026-09-05): "we only store things in codebase if it's necessary, otherwise find a way to store somewhere else."
- Phase 8's meaning (the human, 2026-09-05, "yes, agree" on `docs/expected-base-patch-2026-09-05.html` §4): one base per screen state, one patch per moment, context faded, one camera on both cells.
- Rule 1 red-first (composed flows exempt at flow level only); rule 3 never fake a green; rule 4 decide which side is wrong before editing a broken test; rule 6 correct docs in place with the reason; rule 7 fix your own defects now.
- Node floor **20**. No new npm dependency. `sha256` is `node:crypto`.
- The blob string is exactly `blob/<64 lowercase hex>.<ext>`, `ext` = `[a-z0-9]{1,8}`. Run records are `runs/<runId>/<rel>`. Anything else in an index value is a repo-relative path as today.
- Data home root: `process.env.SPECBOARD_HOME` if set, else `~/.specboard`; per project `<root>/<projectId>/`.
- `spec/_config.json` stays **ignored** (a sign-in script may carry a credential); `spec/_conflict-decisions.json` becomes **committed**.
- **Versions:** T14 ships **0.45.0** (the skeleton's shape changes). A6′ ships **0.46.0** (what an Expected file means changes). Bump `.claude-plugin/plugin.json` AND `.claude-plugin/marketplace.json` together, both times. Interim commits may use `0.45.0-a`, `-b`, … — this corrects the phase-8 source plan, which said 0.45.0 (rule 6: storage lands first now).
- **Ports:** this repo's suite on `BOARD_PORT=4199`; demo/todo on `BOARD_PORT=4198` with its app on 4319 (`cd demo/todo && node serve-app.mjs &`). Never 4173 (own), 4175 (demo), 4174 (dojostack) — those are live boards. This corrects the phase-8 source plan's 4177/4176 to one convention.
- Every verification harvest exports a temp `SPECBOARD_HOME=$(mktemp -d)` until T11; from T11 on, the real home.
- Never pass `--reporter` or `-g` to Playwright; wait for the fold's "N drawing(s) written" (or gap summary) line before gating or committing.
- Stage by explicit path, never `git add -A` — another session shares this checkout. NEVER `git worktree add`.
- One harvest at a time in this tree. Vendor into `demo/todo` after each shippable task (`node tools/update.mjs demo/todo`) and check its board by eye (R9 is red on purpose; never make it green).

---

## Status at the start of the plan (2026-09-05)

| id | task | status |
|---|---|---|
| — | Expected view phases 1–7, one HTML per moment, 0.44.1; 0.44.2 the ring's dash pair | done, pushed |
| B3 | phase 0 | to do |
| T1–T16 | storage A, phases 1–4 | to do |
| A1–A6′ | phase 8 on the store, phase 5 | to do |
| B1 | CI gates before the suite | **retired** (see T15) |
| B2 | the zero-claim waiver | to do, folded into T9 |
| C1–C4 | rulings the human has not given | waiting |
| C5 | storage | **ruled A** |
| C6 | dojostack vendoring | half-open: T14 vendors + imports without the backend |

---

## Phase 0 — one residual first

### Task B3: A raw NUL byte in the reporter's source

Execute exactly as written in `2026-09-05-expected-base-patch-and-residuals.md` → **Task B3** (the video cache key `screen + '\x00' + srcAbs` is written with a literal NUL at byte 11998; make it the escape `'\x00'`, verify the byte count is 0 and `file spec/_results-reporter.mjs` no longer says `data`, `npm run test:tools` green, commit `spec/_results-reporter.mjs` alone).

Why first: T7 and A3′ rewrite this file, and `grep` reads it as binary until then.

---

## Phase 1 — the store, pure and unit-tested

Execute **Task 1, Task 2, Task 3, Task 4** exactly as written in `2026-09-05-storage-data-home.md`. No amendments. Their interfaces, used below: `dataHome(root, manifest, env, home)`, `putBlob(home, bytes, ext) → 'blob/<sha>.<ext>'`, `blobPath(home, rel)`, `isBlobRel(s)`, `referencedBlobs(...records) → Set`, `gcBlobs(home, keep)`, `importHarvest({ root, home })`, `newProjectId(name)`.

---

## Phase 2 — the pipeline reads and writes the store

### Task T5 (amended): `spec-store` roots in the data home; `momentsOf` reads a beat's `base`

Execute **Task 5** of `2026-09-05-storage-data-home.md` with ONE amendment to `momentsOf`, so phase 8 needs no second walker and a legacy entry (imported by T3, which has `replicaExpectedBefore` and no `base`) keeps working.

**Interfaces (amended):**
- `momentsOf(entry) → Array<{ phase: 'before'|'value'|'after', frame, layout, replica, kind: 'base'|'moment' }>` — the before triple's `replica` is `b.base || b.replicaExpectedBefore || null`, and `kind` is `'base'` exactly when it came from `b.base`.

- [ ] **Step 1: Replace the `momentsOf` test in `tools/store-paths.test.mjs` (Task 5 Step 1) with this one**

```js
test('momentsOf lists every moment triple of an entry, values included, the before moment from base when there is one', async () => {
  const s = await fresh(mkdtempSync(join(tmpdir(), 'kgsp-')))
  const e = { beats: [{ n: 1, before: 'b', after: 'a', layoutBefore: 'lb', layoutAfter: 'la', replicaExpectedBefore: 'rb', replicaExpectedAfter: 'ra', values: [{ k: 1, frame: 'f', layout: 'l', replicaExpected: 'r' }] }] }
  assert.deepEqual(s.momentsOf(e), [
    { phase: 'before', frame: 'b', layout: 'lb', replica: 'rb', kind: 'moment' },
    { phase: 'value', frame: 'f', layout: 'l', replica: 'r', kind: 'moment' },
    { phase: 'after', frame: 'a', layout: 'la', replica: 'ra', kind: 'moment' }
  ])
  const withBase = { beats: [{ n: 1, before: 'b', layoutBefore: 'lb', base: 'blob/' + 'e'.repeat(64) + '.html', values: [] }] }
  assert.deepEqual(s.momentsOf(withBase)[0], { phase: 'before', frame: 'b', layout: 'lb', replica: 'blob/' + 'e'.repeat(64) + '.html', kind: 'base' })
  assert.deepEqual(s.momentsOf(null), [])
})
```

- [ ] **Step 2: In Task 5 Step 3, write `momentsOf` as**

```js
// Pure: one evidence entry → every moment's file triple, in the order the row shows them. A beat's
// BEFORE picture is its BASE when the fold landed one (phase 8: the Given, shared by every beat that
// starts from the same page) — an entry from before phase 8 still carries replicaExpectedBefore.
export function momentsOf (entry) {
  const out = []
  for (const b of (entry && Array.isArray(entry.beats) ? entry.beats : [])) {
    if (!b) continue
    out.push({ phase: 'before', frame: b.before || null, layout: b.layoutBefore || null, replica: b.base || b.replicaExpectedBefore || null, kind: b.base ? 'base' : 'moment' })
    for (const v of (Array.isArray(b.values) ? b.values : [])) if (v) out.push({ phase: 'value', frame: v.frame || null, layout: v.layout || null, replica: v.replicaExpected || null, kind: 'moment' })
    out.push({ phase: 'after', frame: b.after || null, layout: b.layoutAfter || null, replica: b.replicaExpectedAfter || null, kind: 'moment' })
  }
  return out
}
```

`chromeSource` (Task 5 Step 3) filters `m.phase === 'before'` — unchanged by this; a base is a whole-page before replica, which is exactly what it wants.

Everything else in Task 5 — its other tests, `DATA_HOME`, `resolveRel`, the gc at the fold, the commit — as written.

### Tasks T6, T7, T8, T10

Execute **Task 6, Task 7, Task 8, Task 10** exactly as written in `2026-09-05-storage-data-home.md`. T7's Step 4 real harvest is where the 2026-09-04 trap is caught: open the temp home's `index.json` and confirm every value moment carries a `layout` blob before committing.

### Task T9 (+ B2): the gates read the store; a call into steps.ts opens a page

Execute **Task 9** of `2026-09-05-storage-data-home.md` as written (its `checkReplicas` loop uses `m.replica`/`m.layout` from `momentsOf`; a `kind: 'base'` moment is graded like any other here — A5′ dedupes it later). Then, in the SAME file and before the commit, execute **Task B2** of `2026-09-05-expected-base-patch-and-residuals.md` exactly as written (`opensPage(body, bodies)` follows calls into `bodies`; `npm run proof lint` here and in demo/todo must not raise the DECLARED count). Commit both together:

```bash
git add tools/viz-derive.mjs tools/proof-integrity.mjs tools/proof-integrity.test.mjs
git commit -m "feat(gates): the replica gate and the sketch pass read the index and the data home; a call into steps.ts opens a page (final review I3)"
```

### Task T11

Execute **Task 11** exactly as written. Its Step 5 CLAUDE.md correction is the first of two (A6′ makes the second).

---

## Phase 3 — scaffold, update, skills; release 0.45.0; dojostack migrates

### Tasks T12, T13

Execute **Task 12, Task 13** exactly as written.

### Task T14 (amended): release 0.45.0 in BOTH manifests

Execute **Task 14** as written with one amendment to Step 1: bump `.claude-plugin/marketplace.json` too (the phase-8 plan's constraint, which the storage plan omitted):

```bash
sed -i '' 's/"version": "0.44.2"/"version": "0.45.0"/' .claude-plugin/plugin.json .claude-plugin/marketplace.json
npm run test:tools
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json && git commit -m "release: 0.45.0 — the data home" && git push
```

Step 3 (dojostack) needs NO backend: `update.mjs` vendors, `store-import.mjs` moves the harvest that already exists, the board restarts on it. Record in memory that C6 is half-open: only a fresh dojostack harvest still waits on the sign-in. **Stop after the local commit — the human pushes dojostack.**

---

## Phase 4 — step 5 of the flow

### Task T15 (+ B1 retired): CI keeps the runner's harvest as an artifact

Execute **Task 15** exactly as written. In the same edit of `.github/workflows/e2e.yml`, add one comment line above the two `npm run proof` steps:

```yaml
      # (B1, 2026-09-05, retired with decision A: "grade the committed bytes before the suite" —
      # nothing derived is committed any more, so the only harvest a job can grade is its own.)
```

Mark B1 **retired** on the status page with that reason.

### Task T16

Execute **Task 16** exactly as written. **Read `spec/init/prd.md` first; if a requirement names the git-branch option, stop and ask (rule 5).**

---

## Phase 5 — Expected phase 8, on the store

### Tasks A1, A2

Execute **Task A1, Task A2** of `2026-09-05-expected-base-patch-and-residuals.md` exactly as written. Interfaces used below: `captureReplica(arg)` takes `arg.key`; the root carries `data-replica-ns` and `data-replica-path`; `replicaAttrs(html).ns` / `.path`.

### Task A3′ (rewritten): the base is a blob — the before replica, header stripped, `putBlob`

**Files:**
- Modify: `tools/evidence.mjs` (new pure helper beside `beatEvidencePaths` ~line 83; the beat carry at ~lines 262–276 and the "borrow the old replica" rule at ~lines 637–640 in `foldEvidence`)
- Modify: `spec/_results-reporter.mjs` (the beat row at ~line 279 and the `for (const key of ['replicaExpectedBefore', 'replicaExpectedAfter'])` loop at ~292; the `noteReplica(…, 'before')` calls at ~302 and ~309)
- Test: `tools/evidence.test.mjs`, `tools/evidence-fold.test.mjs`

**Interfaces:**
- Consumes: `putBlob(DATA_HOME, bytes, 'html')` (T1, imported in the reporter since T7); `resolveRel` (T5); `noteReplica(row, rel, gapLines, screen, id, beat, phase)` (reads the gate verdict off the file `rel` names — since T7 through `resolveRel`).
- Produces:
  - `baseBody(html) → string` in `tools/evidence.mjs` — the file without its first html comment line (the header names the moment; two identical pages captured for two moments must be the same bytes, hence the same blob).
  - the beat entry gains `base: 'blob/<sha>.html' | null`; `replicaExpectedBefore` is no longer set on a new entry (the before picture IS the base). The blob's NAME is the hash A3 wanted; T2's gc is the refcount A3 wanted. `baseHashOf`, `baseEvidencePath`, the `_base/` directory and the fold's refcount test are NOT built.
  - `foldEvidence` carries `base` on a beat exactly as it carries `replicaExpectedBefore` (the carry at ~266 and the borrow rule at ~637), so a per-screen fold never drops it.

- [ ] **Step 1: Failing tests**

Append to `tools/evidence.test.mjs`:

```js
import { baseBody } from './evidence.mjs'
test('phase 8: the base is the before replica without its header line, so two moments of one page are one blob', () => {
  const a = '<!-- specboard replica-1 · todo:R3 b1 before · Expected · sanitised, no script -->\n<style>.rep .rab{}</style><div class="rep rab"></div>'
  const b = '<!-- specboard replica-1 · todo:R1 b1 before · Expected · sanitised, no script -->\n<style>.rep .rab{}</style><div class="rep rab"></div>'
  assert.equal(baseBody(a), baseBody(b))
  assert.equal(baseBody(a), '<style>.rep .rab{}</style><div class="rep rab"></div>')
  assert.equal(baseBody('<div></div>'), '<div></div>')            // no header: unchanged
  assert.notEqual(baseBody(a), baseBody(a.replace('rab"></div>', 'rab">x</div>')))
})
```

Append to `tools/evidence-fold.test.mjs` (follow its fixture style for `index`/`fresh`):

```js
test('phase 8: foldEvidence carries a beat\'s base, and a fresh beat with no base borrows the old one like it borrows a replica', () => {
  const base = 'blob/' + 'a'.repeat(64) + '.html'
  const index = { todo: { evidence: { R1: { beats: [{ n: 1, before: 'blob/' + 'b'.repeat(64) + '.png', base, values: [] }] } } } }
  foldEvidence(index, [{ screen: 'todo', id: 'R1', entry: { beats: [{ n: 1, before: 'blob/' + 'c'.repeat(64) + '.png', base: 'blob/' + 'd'.repeat(64) + '.html', values: [] }] } }])
  assert.equal(index.todo.evidence.R1.beats[0].base, 'blob/' + 'd'.repeat(64) + '.html', 'a fresh base replaces the old')
  foldEvidence(index, [{ screen: 'todo', id: 'R1', entry: { beats: [{ n: 1, before: 'blob/' + 'e'.repeat(64) + '.png', values: [] }] } }])
  assert.equal(index.todo.evidence.R1.beats[0].base, 'blob/' + 'd'.repeat(64) + '.html', 'a fold with no base keeps the last one (the same rule as a missing replica)')
})
```

- [ ] **Step 2: Run, watch them fail** — `node --test tools/evidence.test.mjs tools/evidence-fold.test.mjs` → `baseBody` is not exported; `base` is `undefined` after the fold.

- [ ] **Step 3: Implement**

`tools/evidence.mjs`, beside `beatEvidencePaths`:

```js
// ONE BASE PER SCREEN STATE (phase 8, the human 2026-09-05: "build a schematic page and use that page in
// all test cases"). The before moment of every beat is body-rooted — no ring, so the scene root is the
// body — and two beats that start from the same page produced the same bytes three times over
// (demo/todo's R1/R2/R3 before files). The only byte that differed was the header comment naming the
// moment. Strip it, and the reporter's putBlob does the rest: same bytes, same sha256, ONE blob, kept
// while any beat names it (tools/store.mjs gcBlobs). The reader drops every comment anyway (repBody).
export function baseBody (html) {
  return String(html || '').replace(/^<!--[^\n]*-->\n?/, '')
}
```

In `foldEvidence`: where the beat carry builds `replicaExpectedBefore: s.replicaExpectedBefore || null` (~266), add `base: s.base || null,`; in the borrow rule (~637, `if (!(b.replicaExpectedBefore || b.replicaExpectedAfter) && …)`), treat `base` as the before replica: the condition becomes `!(b.base || b.replicaExpectedBefore || b.replicaExpectedAfter)` and the borrow copies `o.base` alongside `o.replicaExpectedBefore` when `hasB`. Read the surrounding twenty lines first: the intent is "a fresh beat that photographed nothing new keeps the last picture", and `base` is now one of the pictures.

`spec/_results-reporter.mjs`, the beat row (~279): add `base: null` to the row literal. The copy loop (~292):

```js
      // PHASE 8: the BEFORE replica lands as the beat's BASE — header stripped so identical pages
      // are one blob (tools/evidence.mjs baseBody). The after moment stays a moment of its own.
      if (b.replicaExpectedBefore) {
        try { row.base = putBlob(DATA_HOME, Buffer.from(baseBody(readFileSync(b.replicaExpectedBefore, 'utf8'))), 'html') } catch { row.base = null }
      }
      for (const key of ['replicaExpectedAfter']) { /* the existing landing, unchanged */ }
```

and every `noteReplica(…, row.replicaExpectedBefore, …, 'before')` (~302, ~309) becomes `noteReplica(…, row.base, …, 'before')`. Import `baseBody` from `../tools/evidence.mjs`.

- [ ] **Step 4: Units green** — `npm run test:tools 2>&1 | grep -E "^# (pass|fail)"` → `# fail 0`; `node --check spec/_results-reporter.mjs`.

- [ ] **Step 5: Harvest `spec/init` on the free port and COUNT the sharing**

```bash
BOARD_PORT=4199 npx playwright test --config=playwright.board.ts spec/init/test.spec.ts
```

Wait for the fold line. Then:

```bash
node -e "
const s = require('./tools/spec-store.mjs'); const i = JSON.parse(require('fs').readFileSync(s.RESULTS_INDEX,'utf8'));
const beats = Object.values(i.init.evidence).flatMap(e => e.beats || []).filter(b => b.base);
const distinct = new Set(beats.map(b => b.base));
console.log('beats with a base', beats.length, '· distinct bases', distinct.size, '· legacy replicaExpectedBefore left', beats.filter(b => b.replicaExpectedBefore).length)"
```

Expected: `distinct bases` **strictly fewer** than `beats with a base` (init's beats start from the same page more than once), and `legacy … left` = 0 for init. Equal counts mean the header was not stripped — the task is not done. (`require` of an `.mjs` fails on Node 20 — if so use `node --input-type=module -e "import * as s from './tools/spec-store.mjs'; …"`.)

- [ ] **Step 6: Commit** (source only — the harvest is untracked since T11)

```bash
git add tools/evidence.mjs spec/_results-reporter.mjs tools/evidence.test.mjs tools/evidence-fold.test.mjs
git commit -m "feat(fold): the before replica lands as the beat's base — one blob per screen state, shared by content, kept by reference (phase 8 A3 on the data home)"
```

---

### Task A4′ (amended): the reader grafts the patch onto the base; the base is fetched at `/blob/…`

Execute **Task A4** of `2026-09-05-expected-base-patch-and-residuals.md` with these substitutions; everything not named here (the `graft.js` unit test and file, `SBGraft.graft`, the `[data-ctx]` rule, `paintLone`, the PRD prose) is as written there.

- [ ] **Step 5 of A4, the R18 claim** — the base is a blob rel, not a repo path:

```ts
  await checkReq('R18', async () => {
    // PHASE 8: a value moment's Expected is the beat's BASE (a blob in the data home, decision A) with
    // the moment's patch grafted in — the srcdoc carries words from OUTSIDE the patch (the base's
    // context, faded) AND the patch's own root.
    const cell = page.locator('.sbrep[data-repbase]').first()
    await proveVisible(cell, /^blob\/[0-9a-f]{64}\.html$/, 'the cell names the base blob it drew', { attr: 'data-repbase', soft: true })
    const doc = await page.locator('.sbrep iframe.repframe').first().getAttribute('srcdoc')
    expect(doc && /data-ctx="1"/.test(doc), 'context outside the patch is marked').toBe(true)
    expect(doc && /data-replica-path="/.test(doc), 'the patch root is in the document').toBe(true)
  })
```

(`proveVisible` with `{ attr }` — if the helper has no attribute mode, `expect(await cell.getAttribute('data-repbase')).toMatch(/^blob\/[0-9a-f]{64}\.html$/)` and keep a `proveVisible` on a visible fact of the cell, e.g. its chip.) The R19 claim is unchanged.

- [ ] **Step 6 of A4, the reader** — `repFetch(sh.base)` is unchanged in shape: `repFetch` calls `fetch(path)` with the rel as given, and `blob/<sha>.html` resolves against the page's origin to `/blob/<sha>.html`, which T8 serves. Confirm once in the browser's network panel (or `curl -I http://localhost:4199/blob/<one rel from the index>` → 200 with the CSP header) before assuming the row is blank for another reason. The `values(b)`/`shot` builder carries `base: b.base || ''` exactly as A4 says — `b.base` is the blob rel from A3′.

- [ ] **Step 7 of A4** — run on **4199** (not 4177): `BOARD_PORT=4199 npx playwright test --config=playwright.board.ts spec/board/test.spec.ts`; wait for the fold; `node --check tools/board/client.js tools/board/graft.js`; `npm run board:build`; `npm run proof mirror` → exit 0 (A5′ may be needed first if the gate grades the shared base per beat and one beat's before skeleton lags; do A5′ then come back).

- [ ] **Step 8 of A4, the commit** — source only:

```bash
git add tools/board/graft.js tools/graft.test.mjs tools/build-board.mjs tools/board/client.js spec/board/prd.md spec/board/test.spec.ts
git commit -m "feat(reader): the Expected is the beat's base with the moment's patch grafted in, one camera on both cells — phase 8 A4 on the data home"
```

---

### Task A5′ (rewritten): the gate grades a base ONCE, against every beat that shares it

**Files:**
- Modify: `tools/proof-integrity.mjs` (`checkReplicas(index = readResults())` as T9 left it)
- Test: `tools/proof-integrity.test.mjs`

**Interfaces:**
- Consumes: `momentsOf` with `kind` (T5 amended), `resolveRel`, `readResults` (T5), `layoutHash(a, b)` (`tools/viz.mjs:1071`), `replicaAttrs` (`tools/replica-gate.mjs`).
- Produces: `checkReplicas(index)` rows gain `kind: 'base' | 'moment'`. For every DISTINCT `base` rel in the index there is exactly ONE row `{ kind: 'base', file: rel, screen, id: '<id1> b<n1>, <id2> b<n2>, …', ok, why, gaps }`: the blob must exist (else `why: 'its base is gone'`), its root must carry `data-replica-layout` and `data-replica-gaps` (the same pin/gaps/truncation rules as a moment), and its pin must equal `layoutHash(readJSON(resolveRel(beat.layoutBefore)), null)` for EVERY beat that names it — a mismatch appends `'<id> b<n>: the harvest is newer than the base'`. Moment rows (`kind: 'moment'`) keep today's rules. There is no orphan rule: a base blob nothing names was collected by `gcBlobs` at the fold.

- [ ] **Step 1: Failing tests** (append to `tools/proof-integrity.test.mjs`; the T9 test in this file — temp `SPECBOARD_HOME`, `putBlob`, a fresh import — is the model)

```js
test('phase 8: a base shared by two beats is graded ONCE and every sharing beat\'s before skeleton must match its pin', async () => {
  const home = mkdtempSync(join(tmpdir(), 'kgpi-'))
  process.env.SPECBOARD_HOME = home
  const { putBlob } = await import('./store.mjs')
  const { layoutHash } = await import('./viz.mjs')
  const { DATA_HOME } = await import('./spec-store.mjs?home=' + encodeURIComponent(home))
  const { checkReplicas } = await import('./proof-integrity.mjs?home=' + encodeURIComponent(home))
  const lay = { w: 1440, h: 900, els: [] }
  const layR1 = putBlob(DATA_HOME, Buffer.from(JSON.stringify(lay)), 'json')
  const layR3 = putBlob(DATA_HOME, Buffer.from(JSON.stringify({ ...lay, els: [{ x: 1, y: 1, w: 1, h: 1, kind: 'text', text: 'moved' }] })), 'json')
  const base = putBlob(DATA_HOME, Buffer.from('<div class="rep" data-replica-kit="replica-1" data-replica-region="0 0 1440 900" data-replica-path="" data-replica-layout="' + layoutHash(lay, null) + '" data-replica-gaps="[]"></div>'), 'html')
  const index = { todo: { evidence: { R1: { beats: [{ n: 1, base, layoutBefore: layR1, values: [] }] }, R3: { beats: [{ n: 1, base, layoutBefore: layR3, values: [] }] } } } }
  const rows = checkReplicas(index).filter(r => r.kind === 'base')
  assert.equal(rows.length, 1, 'one row for the shared base')
  assert.equal(rows[0].file, base)
  assert.equal(rows[0].ok, false)
  assert.match(rows[0].why, /R3 b1: the harvest is newer than the base/)
  assert.doesNotMatch(rows[0].why, /R1 b1/)
})

test('phase 8: a beat whose base blob is gone is a red row, not a silent pass', async () => {
  const home = mkdtempSync(join(tmpdir(), 'kgpi-'))
  process.env.SPECBOARD_HOME = home
  const { checkReplicas } = await import('./proof-integrity.mjs?home=' + encodeURIComponent(home))
  const index = { todo: { evidence: { R1: { beats: [{ n: 1, base: 'blob/' + '0'.repeat(64) + '.html', layoutBefore: null, values: [] }] } } } }
  const r = checkReplicas(index).find(x => x.kind === 'base')
  assert.ok(r); assert.equal(r.ok, false); assert.match(r.why, /its base is gone/)
})
```

- [ ] **Step 2: Run, watch them fail** — `node --test tools/proof-integrity.test.mjs` → two `not ok` (rows have no `kind`; the shared base yields two rows).

- [ ] **Step 3: Implement** — in `checkReplicas`, before the per-screen loop T9 wrote, collect the bases:

```js
  // PHASE 8: a BASE is shared by every beat that starts from the same page, so it is graded ONCE —
  // against each sharing beat's own before skeleton. Nothing here can be an orphan: a blob no record
  // names is collected at the fold (tools/store.mjs gcBlobs), so the index IS the list.
  const bases = new Map()   // rel → [{ screen, id, n, layout }]
  for (const screen of Object.keys(index || {}).filter(s => !s.startsWith('_')).sort()) {
    for (const [id, entry] of Object.entries((index[screen] && index[screen].evidence) || {})) {
      for (const b of (entry && Array.isArray(entry.beats) ? entry.beats : [])) {
        if (!b || !b.base) continue
        if (!bases.has(b.base)) bases.set(b.base, [])
        bases.get(b.base).push({ screen, id, n: b.n, layout: b.layoutBefore || null })
      }
    }
  }
  for (const [rel, refs] of bases) {
    const row = { kind: 'base', screen: refs[0].screen, id: refs.map(r => `${r.id} b${r.n}`).join(', '), file: rel, ok: true, why: '', gaps: [] }
    rows.push(row)
    let html = ''
    try { html = readFileSync(resolveRel(rel), 'utf8') } catch { html = '' }
    if (!html) { row.ok = false; row.why = 'its base is gone'; continue }
    // the same pin / gaps / truncation checks a moment gets — reuse the helper T9's loop calls
    // (extract it into `gradeFile(row, html)` if it is inline; do not duplicate the rules)
    gradeFile(row, html)
    const pin = replicaAttrs(html).layout
    for (const r of refs) {
      let lay = null
      if (r.layout) { try { lay = JSON.parse(readFileSync(resolveRel(r.layout), 'utf8')) } catch { lay = null } }
      if (!lay || layoutHash(lay, null) !== pin) { row.ok = false; row.why += (row.why ? '; ' : '') + `${r.id} b${r.n}: the harvest is newer than the base` }
    }
  }
```

and in T9's per-moment loop, `if (m.kind === 'base') continue` (the base was graded above) and every other row gets `kind: 'moment'`. `replicaAttrs(html).layout` — check the field name `replicaAttrs` uses for `data-replica-layout` and use that one. If the printer (`npm run proof mirror`'s summary) counts rows per screen, a base row counts under `refs[0].screen`.

- [ ] **Step 4: Verify** — `npm run test:tools` green; `npm run proof mirror` on this repo → exit 0, and the census prints one `base` row per distinct blob (fewer than the beats, per A3′ Step 5's count).

- [ ] **Step 5: Commit**

```bash
git add tools/proof-integrity.mjs tools/proof-integrity.test.mjs
git commit -m "feat(gate): a base is graded once against every beat that shares it — phase 8 A5 on the data home"
```

---

### Task A6′ (amended): ship 0.46.0 — full suite, demo real-data check, docs, vendor

**Files:**
- Modify: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (0.46.0)
- Modify: `CLAUDE.md` (Architecture: the data home line gains "`beats[].base` — the before replica, header stripped, one blob per screen state"; the evidence trap paragraph: "the before moment's picture is the beat's base"; the mirror paragraph: "a base is graded once, against every beat that names it")
- Modify: `skills/kg-e2e/SKILL.md` (one sentence under the Expected/replica note: the Given is captured body-rooted once per state and shared by content)
- Modify: `tools/_skeleton.mjs` FILES: add `tools/board/graft.js`; `tools/update.test.mjs` pins it (the `words.js` pin test at ~175–186 is the model)
- Modify: `docs/plan-storage-then-expected-2026-09-05.html` statuses

- [ ] **Step 1:** `tools/update.test.mjs`: copy the `words.js` pin test for `graft.js`; run → red; add to FILES → green.
- [ ] **Step 2:** Full suite here: `BOARD_PORT=4199 npm run e2e` (≈30 min; wait for the fold). Expected: everything green, the new R18/R19 claims included.
- [ ] **Step 3:** `npm run proof mirror && npm run proof lint` → exit 0.
- [ ] **Step 4:** Bump to 0.46.0 in both json files. `node tools/update.mjs demo/todo`; `cd demo/todo && node serve-app.mjs &`; `BOARD_PORT=4198 npx playwright test --config=playwright.board.ts spec/todo/test.spec.ts`; both gates in demo exit 0; `node tools/build-board.mjs` there; restart the demo board (`lsof -ti :4175`, kill by pid, relaunch detached). Open http://localhost:4175/#/todo, R3 beat 1: the Expected shows the faded card with the row in full ink, the arc at 1/3, the same crop as the photograph. Screenshot it to `docs/superpowers/mockups/2026-09-05-phase8-r3-live.png`. (R9 stays red — it is the demo's intentional failure.)
- [ ] **Step 5:** Docs (CLAUDE.md, skill, the status page). `npm run test:tools` once more.
- [ ] **Step 6: Commit and push** — source and docs only; the demo's harvest is untracked since T11/T14:

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json CLAUDE.md skills/kg-e2e/SKILL.md tools/_skeleton.mjs tools/update.test.mjs docs/plan-storage-then-expected-2026-09-05.html docs/superpowers/mockups/2026-09-05-phase8-r3-live.png demo/todo/spec/_specboard.json
git commit -m "chore(release): 0.46.0 — the Expected is one base per screen state plus a patch per moment (phase 8), on the data home"
git push origin main
```

Then dojostack: `node ~/workspace/claude-plugin-spec/tools/update.mjs ~/workspace/dojostack/dojostack_main` and restart :4174 — the imported 0.45.0 harvest has no `base` fields, so every beat draws `paintLone` (today's picture) until a fresh harvest, which waits on the backend (C6). Say so in the memory file rather than calling it done.

---

## Part C — waiting on the human (recommendation recorded; nothing scheduled)

| id | question | recommendation | note after the merge |
|---|---|---|---|
| C1 | `checkReq` cannot name WHICH beat it proves; six beats carry a declared lint gap | an optional `{ beat: n }` third argument | unchanged |
| C2 | evidence keyed by requirement, so a standalone init run can replace board:R1's beat | key by TEST — an index-shape change | would land cheapest right after T7, while T3's importer is fresh; ask before T7 starts |
| C3 | the strip names every segment vs the old plan's single caption | keep the names | unchanged |
| C4 | board R7's wording, restored verbatim | verbatim | unchanged |
| C5 | storage D1/D2/D3 + .git shrink | — | **ruled A** 2026-09-05: D1 yes (`_config.json` stays ignored), D2 with the team store, D3 untouched; shrink 0+1 = T11; step 2 (the 850 MB history rewrite) still the human's own decision |
| C6 | dojostack on 0.43.7, backend down | vendor when up | T14 vendors + imports without the backend; a fresh harvest still waits |

---

## Self-review

- **Spec coverage.** Storage flow page §3 tree: authored committed (T11–T14), data home with index/blobs/runs (T1–T10), viz out of the repo (T9), `storage.where = git` removed (T16), CI (T15). Phase-8 design §4: namespace → A1, base per Given state shared by content → A3′ (the blob name), reader graft + one camera → A4′, gate once per base → A5′; §3 failure modes: two instants → `[data-ctx]` fade (A4′), class collisions → A1, graft by identity → A2 + A4′, no base → `paintLone` (A4′). Residuals: B3 phase 0, B2 in T9, B1 retired with the reason at T15. Rulings: C5 closed, C6 half-closed, C1–C4 open.
- **Placeholder scan.** Every amended task carries its own test, code and command. Unamended tasks point at a body that exists in full in a source plan (not "similar to").
- **Type consistency.** `momentsOf` items `{ phase, frame, layout, replica, kind }` (T5) are what T9's loop and A5′ read; `b.base` (A3′) ↔ `sh.base` / `data-repbase` (A4′) ↔ `bases` map (A5′); `putBlob(DATA_HOME, bytes, 'html')` returns the `blob/…` rel everywhere; `layoutHash(lay, null)` from `tools/viz.mjs` in A5′ as in the phase-8 source; `resolveRel` returns `string|null` and is the only path resolver after T5.
- **Versions and ports** are set once in Global Constraints and override the two source plans (0.45.0 → T14, 0.46.0 → A6′; 4199 here, 4198 demo).
