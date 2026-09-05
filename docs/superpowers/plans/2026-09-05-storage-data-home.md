# Storage A — authored in git, the harvest in a data home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Merged 2026-09-05 into the ONE plan** `docs/superpowers/plans/2026-09-05-storage-then-expected-phase8.md` (status page `docs/plan-storage-then-expected-2026-09-05.html`). Execute the tasks below in that plan's order (B3 first, then T1–T16, then Expected phase 8 on the store). Amended there, and the master is the source where they differ: **T5** `momentsOf` reads a beat's `base` (kind `'base'`); **T9** carries B2 in the same commit; **T14** bumps `marketplace.json` too; **T15** records B1 as retired. Reason: phase 8's base "content-hashed and refcounted" is exactly `putBlob` + `gcBlobs`, so it is built on this store, not beside it.

> **RE-RULED 2026-09-05 (final shape — read every task below through the master plan's banner, which is the source where they differ):** the data home is **`~/.specboard/<projectId>/`** (claude-mem's home-dir pattern); the fold/runs/report are rows behind one **async** store interface — `sqlite` (`board.db`, better-sqlite3, default) or `pg` (remote `SPECBOARD_DB_URL`); blobs sit behind an `fs`/`s3` driver (local dir served at `/blob/…`, or an S3-compatible bucket with the URL in the db). Team = two values: the remote db url + the cloud bucket. Design page: `docs/storage-references-design-2026-09-05.html`.

**Goal:** Every derived file (frames, replicas, skeletons, fonts, videos, the fold index, the run log, the sketches) leaves the repository for a per-project data home at `~/.specboard/<projectId>/`, content-addressed and garbage-collected, while the authored files (`prd.md`, `test.spec.ts`, `steps.ts`, narration packs, conflict decisions, the manifest) become the only thing a project commits.

**Architecture:** One new module, `tools/store.mjs`, answers three questions — where a project's data home is, how bytes become a blob (`blob/<sha256>.<ext>`, a string that is both the index's value and the URL the server serves), and which blobs are still referenced. The reporter lands the harvest as blobs instead of copying into `spec/<screen>/evidence/`; `spec-store` moves the index, the run log and the record dir into the data home and resolves a `blob/…` or `runs/…` string to its file; the server gains two pattern-allowlisted routes. Everything that today pairs files by directory listing (`chromeSource`, `checkReplicas`, `viz-derive`) reads the index instead, which already lists every moment's frame, skeleton and replica together. A one-time importer moves an existing harvest in, so no project loses its last fold.

**Tech Stack:** Node 20 (no `node:sqlite`, no native modules), Playwright 1.62, `node --test` for the pure units. No new dependencies.

## Global Constraints

- The decision this plan implements (the human, 2026-09-05, `docs/storage-userflow-2026-09-05.html` §5, option A): "the local fold stays a file and a blob directory, and the database arrives with the team store." No SQLite, no Postgres, no bucket in this plan.
- The codebase rule (the human, 2026-09-05): "we only store things in codebase if it's necessary, otherwise find a way to store somewhere else." Authored files are necessary (the agent reads them in the checkout; CI runs the test). Nothing derived is.
- Node floor stays **20** (CI `node-version: 20`; dojostack and this machine run 20.20.2).
- No new npm dependency. `sha256` is `node:crypto`.
- The blob string is exactly `blob/<64 lowercase hex>.<ext>`; `ext` is `[a-z0-9]{1,8}`. The run-record string is `runs/<runId>/<relative path>`. Anything else in an index value is a repo-relative path exactly as today (`spec/<screen>/…`).
- Data home root: `process.env.SPECBOARD_HOME` if set, else `~/.specboard`. Per project: `<root>/<projectId>/`.
- Files inside a data home: `index.json` (was `spec/_results-index.json`), `runs.json` (was `spec/_runs.json`), `results.json` (was `spec/_results.json`, the raw Playwright report of a CLI run), `blobs/<sha256>.<ext>` (flat, no sharding), `runs/<runId>/…` (was `spec/_runs/<runId>/`), `viz/<screen>/<id>.svg` (was `spec/<screen>/viz/`).
- `spec/<screen>/screen.png` and `spec/<screen>/crawl.png` stay where tests and the crawler write them, **gitignored** (they are written by test files the user authors; moving them is a test edit, out of scope).
- `spec/_config.json` stays **ignored** (per machine: local URLs, ports, a sign-in script). `spec/_conflict-decisions.json` becomes **committed** (it is the human's decision, authored). This departs from the flow page, which listed `_config.json` as committed; the reason is the sign-in script, which may embed a credential — rule 6, corrected here with the reason.
- The plugin's version bumps to **0.45.0** in `.claude-plugin/plugin.json` (Task 14), because the vendored skeleton changes shape.
- Never pass `--reporter` or `-g` to Playwright; never run a harvest against the live board on 4173 (use `BOARD_PORT=4199`).
- Commit after every task with explicit paths (`git add <files>`), never `git add -A` — another session shares this checkout.

---

## File structure

| file | responsibility |
|---|---|
| `tools/store.mjs` (new) | pure + tiny fs: `dataHomeRoot`, `projectId`, `dataHome`, `blobName`, `isBlobRel`, `putBlob`, `blobPath`, `referencedBlobs`, `gcBlobs` |
| `tools/store.test.mjs` (new) | unit tests for the above, on a temp dir |
| `tools/store-import.mjs` (new) | the one-time importer: repo `spec/_results-index.json` + `spec/_runs.json` + files → data home; idempotent; CLI `node tools/store-import.mjs` |
| `tools/store-import.test.mjs` (new) | unit tests on a temp tree |
| `tools/_skeleton.mjs` | manifest `id` carried by `mergeManifest`; `FILES` gains the two store modules; `SPEC_IGNORE` gains the derived files; `boardIgnoreLines` gains the vendored code |
| `tools/scaffold.mjs` | writes `id` into a fresh manifest; no longer appends `/specboard/` to the app's `.gitignore` |
| `tools/spec-store.mjs` | `DATA_HOME`, `resolveRel`, `RESULTS`/`RESULTS_INDEX`/`RUNS`/`RUNDIR`/`VIZ_DIR` in the data home; fold prunes by GC; `chromeSource`/`hasAnyReplica`/`vizFor` read the store |
| `tools/evidence.mjs` | `deriveFacesCss` maps a font url to `basename(f.path)` when the face has a `path` |
| `spec/_results-reporter.mjs` | `harvestEvidence` lands blobs; run-record paths are `runs/<id>/…`; `committed` read from `RESULTS_INDEX` |
| `tools/serve-board.mjs` | `RUNDIR` from spec-store; `/blob/<name>` and `/runs/<id>/…` routes; CSP on `.html` blobs, CORS on font/css blobs |
| `tools/board/client.js` | the whole-log link `/spec/_runs/` → `/runs/` |
| `tools/viz-derive.mjs` | writes `VIZ_DIR/<screen>/<id>.svg`; "harvested" read from the index |
| `tools/proof-integrity.mjs` | `checkReplicas` and `checkMirrors` iterate the index / `VIZ_DIR` |
| `playwright.board.ts` | the json reporter's default file is the data home's `results.json` |
| `.gitignore`, `demo/todo/.gitignore`, `spec/.gitignore` | derived files out |
| `.github/workflows/e2e.yml` | uploads the runner's data home as an artifact on every run |
| `skills/*/SKILL.md`, `CLAUDE.md`, `docs/storage-paths-2026-09-05.html` | the layout rule corrected in place, with the reason |

---

## Phase 1 — the store, pure and unit-tested

### Task 1: `tools/store.mjs` — the data home and the blob address

**Files:**
- Create: `tools/store.mjs`
- Test: `tools/store.test.mjs`

**Interfaces:**
- Produces:
  - `dataHomeRoot(env = process.env, home = os.homedir()) → string`
  - `projectId(root, manifest) → string` — `manifest.id` when it matches `/^[a-z0-9][a-z0-9-]{0,63}$/`, else `<basename(root)>-<sha256(resolve(root)).slice(0,8)>`
  - `dataHome(root, manifest, env, home) → string` = `join(dataHomeRoot(env, home), projectId(root, manifest))`
  - `blobName(bytes, ext) → string` = `<sha256 hex>.<ext>` (ext lowercased, dot stripped)
  - `isBlobRel(s) → boolean` — `/^blob\/[0-9a-f]{64}\.[a-z0-9]{1,8}$/`
  - `putBlob(home, bytes, ext) → string` — writes `<home>/blobs/<name>` if absent (mkdir -p), returns `blob/<name>`
  - `blobPath(home, rel) → string|null` — absolute file for a blob rel, `null` for anything else

- [ ] **Step 1: Write the failing tests**

```js
// tools/store.test.mjs — the data home (the human, 2026-09-05: "only store things in codebase if
// it's necessary, otherwise find a way to store somewhere else"). Derived files live in
// ~/.specboard/<projectId>/, addressed by content, and the string that lands in the index IS the URL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { dataHomeRoot, projectId, dataHome, blobName, isBlobRel, putBlob, blobPath } from './store.mjs'

const box = () => mkdtempSync(join(tmpdir(), 'kgstore-'))
const sha = b => createHash('sha256').update(b).digest('hex')

test('the data home root is SPECBOARD_HOME, else ~/.specboard', () => {
  assert.equal(dataHomeRoot({ SPECBOARD_HOME: '/x/y' }, '/home/u'), '/x/y')
  assert.equal(dataHomeRoot({}, '/home/u'), join('/home/u', '.specboard'))
})

test('a manifest id names the project; without one the id is basename + a path hash', () => {
  assert.equal(projectId('/a/b/app', { id: 'tsumiki-3f9a1c' }), 'tsumiki-3f9a1c')
  const fallback = projectId('/a/b/app', null)
  assert.match(fallback, /^app-[0-9a-f]{8}$/)
  assert.equal(fallback, projectId('/a/b/app', { id: 'Not Valid!' }))   // an invalid id is no id
  assert.notEqual(fallback, projectId('/a/c/app', null))                // a different checkout, a different home
})

test('dataHome is root + projectId', () => {
  assert.equal(dataHome('/a/app', { id: 'p1' }, { SPECBOARD_HOME: '/h' }, '/u'), join('/h', 'p1'))
})

test('a blob is named by its sha256 and its extension', () => {
  const b = Buffer.from('hello')
  assert.equal(blobName(b, 'png'), `${sha(b)}.png`)
  assert.equal(blobName(b, '.HTML'), `${sha(b)}.html`)
  assert.equal(isBlobRel('blob/' + sha(b) + '.png'), true)
  assert.equal(isBlobRel('spec/board/evidence/R1.b1.before.png'), false)
  assert.equal(isBlobRel('blob/../etc/passwd'), false)
})

test('putBlob writes once, returns the rel, and blobPath finds it back', () => {
  const home = box()
  const b = Buffer.from('frame bytes')
  const rel = putBlob(home, b, 'png')
  assert.equal(rel, 'blob/' + sha(b) + '.png')
  const abs = blobPath(home, rel)
  assert.equal(abs, join(home, 'blobs', sha(b) + '.png'))
  assert.equal(readFileSync(abs).toString(), 'frame bytes')
  const m1 = statSync(abs).mtimeMs
  assert.equal(putBlob(home, b, 'png'), rel)            // the same bytes are the same blob
  assert.equal(statSync(abs).mtimeMs, m1)               // …and are not rewritten
  assert.equal(blobPath(home, 'spec/x/y.png'), null)    // a repo path is not a blob
  assert.equal(existsSync(join(home, 'blobs')), true)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/store.test.mjs`
Expected: FAIL — `Cannot find module './store.mjs'`

- [ ] **Step 3: Write `tools/store.mjs`**

```js
// tools/store.mjs — THE DATA HOME (the human, 2026-09-05: "we only store things in codebase if it's
// necessary, otherwise find a way to store somewhere else"; decision A in
// docs/storage-userflow-2026-09-05.html). Everything a run DERIVES — frames, replicas, skeletons,
// fonts, videos, the fold index, the run log, the sketches — lives outside every git, in
// ~/.specboard/<projectId>/, the way MLflow's local default keeps ./mlruns beside a directory of
// artifacts. Blobs are addressed by content: the string that lands in the index, `blob/<sha256>.<ext>`,
// is BOTH the file's name under <home>/blobs/ and the URL the board serves it at, so unchanged fonts
// and frames cost nothing on a re-harvest and a blob is deleted only when no retained record names it
// (referencedBlobs/gcBlobs). The authored files — prd, test, steps — stay in the app repo: the coding
// agent reads them in the checkout and CI runs the test from it. Pure except putBlob/gcBlobs, which
// touch <home>/blobs/ and nothing else; unit-tested in tools/store.test.mjs.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync, renameSync, readdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve, basename } from 'node:path'

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/
const BLOB = /^blob\/([0-9a-f]{64}\.[a-z0-9]{1,8})$/

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export function dataHomeRoot (env = process.env, home = homedir()) {
  const v = env && typeof env.SPECBOARD_HOME === 'string' ? env.SPECBOARD_HOME.trim() : ''
  return v || join(home, '.specboard')
}

// The manifest's `id` (written once by the scaffold, committed, carried across updates — so every
// clone of a project maps to the same home, which is what the team step will key on); else a name
// that is stable per checkout and cannot collide between two checkouts of the same-named app.
export function projectId (root, manifest) {
  const id = manifest && typeof manifest.id === 'string' ? manifest.id.trim() : ''
  if (ID.test(id)) return id
  const abs = resolve(String(root || '.'))
  return `${basename(abs)}-${sha256(abs).slice(0, 8)}`
}

export function dataHome (root, manifest, env = process.env, home = homedir()) {
  return join(dataHomeRoot(env, home), projectId(root, manifest))
}

export function blobName (bytes, ext) {
  const e = String(ext || 'bin').toLowerCase().replace(/^\.+/, '').replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
  return `${sha256(bytes)}.${e}`
}

export const isBlobRel = s => BLOB.test(String(s || ''))

// Write-once: the same bytes are the same file, so a re-harvest of an unchanged frame is a no-op.
// Temp-then-rename, like every other write in this tool — a reader never sees half a blob.
export function putBlob (home, bytes, ext) {
  const name = blobName(bytes, ext)
  const dir = join(home, 'blobs')
  const dest = join(dir, name)
  if (!existsSync(dest)) {
    mkdirSync(dir, { recursive: true })
    const tmp = `${dest}.${process.pid}.tmp`
    writeFileSync(tmp, bytes)
    renameSync(tmp, dest)
  }
  return `blob/${name}`
}

export function blobPath (home, rel) {
  const m = BLOB.exec(String(rel || ''))
  return m ? join(home, 'blobs', m[1]) : null
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tools/store.test.mjs`
Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
git add tools/store.mjs tools/store.test.mjs
git commit -m "feat(store): the data home and the content-addressed blob — ~/.specboard/<projectId>/blobs, blob/<sha256>.<ext> as index value and URL"
```

---

### Task 2: `referencedBlobs` + `gcBlobs` — a blob lives while a retained record names it

**Files:**
- Modify: `tools/store.mjs`
- Test: `tools/store.test.mjs`

**Interfaces:**
- Produces:
  - `referencedBlobs(...records) → Set<string>` — walks any JSON value (objects, arrays, strings) and collects every string for which `isBlobRel` holds
  - `gcBlobs(home, keep) → { deleted: number, kept: number }` — deletes every file under `<home>/blobs/` whose `blob/<name>` is not in `keep`; a missing dir is `{deleted:0, kept:0}`

- [ ] **Step 1: Write the failing tests** (append to `tools/store.test.mjs`)

```js
import { referencedBlobs, gcBlobs } from './store.mjs'

test('referencedBlobs collects every blob rel anywhere in the records, nothing else', () => {
  const b1 = 'blob/' + 'a'.repeat(64) + '.png'
  const b2 = 'blob/' + 'b'.repeat(64) + '.html'
  const index = { board: { evidence: { R1: { before: b1, beats: [{ n: 1, values: [{ frame: b2, layout: 'spec/x.json' }] }] } } } }
  const runs = [{ runId: '1', shotsByTest: { t: { video: 'runs/1/v.webm', shots: [b1] } } }]
  assert.deepEqual([...referencedBlobs(index, runs)].sort(), [b1, b2])
  assert.deepEqual([...referencedBlobs(null, undefined, 'blob/short.png')], [])
})

test('gcBlobs deletes the unreferenced and keeps the rest', () => {
  const home = box()
  const keep = putBlob(home, Buffer.from('keep me'), 'png')
  const drop = putBlob(home, Buffer.from('drop me'), 'png')
  const r = gcBlobs(home, new Set([keep]))
  assert.deepEqual(r, { deleted: 1, kept: 1 })
  assert.equal(existsSync(blobPath(home, keep)), true)
  assert.equal(existsSync(blobPath(home, drop)), false)
  assert.deepEqual(gcBlobs(box(), new Set()), { deleted: 0, kept: 0 })   // no blobs dir yet: nothing to do
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/store.test.mjs`
Expected: FAIL — `referencedBlobs is not a function`

- [ ] **Step 3: Implement** (append to `tools/store.mjs`)

```js
// Every blob some record still names. Walks whatever it is handed — the index, the run log, a
// single entry — so a caller cannot forget a field: the rule is "named anywhere", not "named here".
export function referencedBlobs (...records) {
  const out = new Set()
  const walk = v => {
    if (typeof v === 'string') { if (isBlobRel(v)) out.add(v); return }
    if (Array.isArray(v)) { for (const x of v) walk(x); return }
    if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x)
  }
  for (const r of records) walk(r)
  return out
}

// Delete what nothing names. The keep-set is computed by the caller from EVERY retained record
// (the fold does this after each write), so a font two screens share is deleted only when both have
// let go of it — the refcount foldEvidence used to keep by hand, now a property of the address.
export function gcBlobs (home, keep) {
  const dir = join(home, 'blobs')
  if (!existsSync(dir)) return { deleted: 0, kept: 0 }
  let deleted = 0
  let kept = 0
  for (const name of readdirSync(dir)) {
    if (/\.tmp$/.test(name)) continue                      // a write in flight is not garbage
    if (keep.has(`blob/${name}`)) { kept++; continue }
    try { rmSync(join(dir, name), { force: true }); deleted++ } catch { /* already gone */ }
  }
  return { deleted, kept }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tools/store.test.mjs`
Expected: 7 passing

- [ ] **Step 5: Commit**

```bash
git add tools/store.mjs tools/store.test.mjs
git commit -m "feat(store): referencedBlobs + gcBlobs — a blob lives exactly while a retained record names it"
```

---

### Task 3: `tools/store-import.mjs` — bring an existing harvest into the data home once

**Files:**
- Create: `tools/store-import.mjs`
- Test: `tools/store-import.test.mjs`

**Interfaces:**
- Consumes: `putBlob`, `isBlobRel` (Task 1)
- Produces:
  - `importHarvest({ root, home }) → { blobs: number, rewritten: number, missing: string[] }` — reads `<root>/spec/_results-index.json` and `<root>/spec/_runs.json`; for every string value that is a repo-relative path under `spec/` naming an existing file, `putBlob` its bytes with the file's extension and replace the string with the blob rel (files under `spec/_runs/<id>/` are copied to `<home>/runs/<id>/…` and the string becomes `runs/<id>/…`); writes `<home>/index.json` and `<home>/runs.json`; a string naming a missing file is left as is and listed in `missing`. Idempotent: a value that is already a blob rel or `runs/` rel is untouched. Never deletes anything under `<root>`.
  - CLI: `node tools/store-import.mjs` runs it for the tools' own root (the directory above `tools/`), printing the counts.

- [ ] **Step 1: Write the failing tests**

```js
// tools/store-import.test.mjs — the one-time move of a committed harvest into the data home. No
// project loses its last fold when the storage rule changes under it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { importHarvest } from './store-import.mjs'
import { isBlobRel, blobPath } from './store.mjs'

const box = () => mkdtempSync(join(tmpdir(), 'kgimp-'))
const w = (root, rel, body) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body) }

function legacyTree () {
  const root = box()
  w(root, 'spec/board/evidence/R1.b1.before.png', 'PNG-1')
  w(root, 'spec/board/evidence/R1.b1.before.layout.json', '{"w":1}')
  w(root, 'spec/board/evidence/_fonts/abc.woff2', 'FONT')
  w(root, 'spec/_runs/77/case/video.webm', 'WEBM')
  w(root, 'spec/_results-index.json', JSON.stringify({
    board: {
      total: 1, failed: 0, tests: [], ranAt: 1,
      evidence: { R1: {
        before: 'spec/board/evidence/R1.b1.before.png', after: 'spec/board/evidence/R1.gone.png',
        fonts: [{ hash: 'abc', ext: 'woff2', path: 'spec/board/evidence/_fonts/abc.woff2' }],
        beats: [{ n: 1, before: 'spec/board/evidence/R1.b1.before.png', layoutBefore: 'spec/board/evidence/R1.b1.before.layout.json' }]
      } }
    }
  }))
  w(root, 'spec/_runs.json', JSON.stringify([{ runId: '77', shotsByTest: { t: { shots: [], video: 'spec/_runs/77/case/video.webm' } } }]))
  return root
}

test('every existing file named by the index becomes a blob; the string is rewritten; a missing file is reported, not invented', () => {
  const root = legacyTree(); const home = box()
  const r = importHarvest({ root, home })
  assert.equal(r.blobs, 3)                                  // png, layout json, font (the png is named twice, stored once)
  assert.deepEqual(r.missing, ['spec/board/evidence/R1.gone.png'])
  const idx = JSON.parse(readFileSync(join(home, 'index.json'), 'utf8'))
  const e = idx.board.evidence.R1
  assert.equal(isBlobRel(e.before), true)
  assert.equal(e.before, e.beats[0].before)
  assert.equal(readFileSync(blobPath(home, e.beats[0].layoutBefore), 'utf8'), '{"w":1}')
  assert.match(e.fonts[0].path, /^blob\/[0-9a-f]{64}\.woff2$/)
  assert.equal(e.after, 'spec/board/evidence/R1.gone.png')  // left as it was — honesty over a guess
  assert.equal(existsSync(join(root, 'spec/board/evidence/R1.b1.before.png')), true)  // the repo is never touched
})

test('a run record moves under <home>/runs/<id>/ and its string becomes runs/<id>/…', () => {
  const root = legacyTree(); const home = box()
  importHarvest({ root, home })
  const runs = JSON.parse(readFileSync(join(home, 'runs.json'), 'utf8'))
  assert.equal(runs[0].shotsByTest.t.video, 'runs/77/case/video.webm')
  assert.equal(readFileSync(join(home, 'runs/77/case/video.webm'), 'utf8'), 'WEBM')
})

test('importing twice changes nothing', () => {
  const root = legacyTree(); const home = box()
  importHarvest({ root, home })
  const once = readFileSync(join(home, 'index.json'), 'utf8')
  const r2 = importHarvest({ root, home })
  assert.equal(r2.blobs, 0)
  assert.equal(readFileSync(join(home, 'index.json'), 'utf8'), once)
})

test('a tree with no index imports nothing and does not throw', () => {
  const r = importHarvest({ root: box(), home: box() })
  assert.deepEqual(r, { blobs: 0, rewritten: 0, missing: [] })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/store-import.test.mjs`
Expected: FAIL — `Cannot find module './store-import.mjs'`

- [ ] **Step 3: Write `tools/store-import.mjs`**

```js
// tools/store-import.mjs — ONE-TIME IMPORT of a harvest that predates the data home (decision A,
// 2026-09-05). Reads the repo's committed fold (spec/_results-index.json, spec/_runs.json), moves
// every file it names into the project's data home — evidence as content-addressed blobs, run
// records under runs/<id>/ — and writes the rewritten fold there. It never deletes anything in the
// repo (that is a git step a person runs, with the plan beside them) and it is idempotent, so running
// it after a half-migration is safe. A path that names no file is left exactly as written and
// reported: an entry that lied before lies the same way after, visibly, rather than being repaired
// into a blob nobody photographed (rule 3). Unit-tested in tools/store-import.test.mjs.
import { existsSync, readFileSync, readdirSync, mkdirSync, copyFileSync, writeFileSync, renameSync } from 'node:fs'
import { join, dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { putBlob, isBlobRel, dataHome } from './store.mjs'

const RUN = /^spec\/_runs\/([^/]+)\/(.+)$/
const SPEC = /^spec\/[^/].*/

function writeJsonAtomic (path, value) {
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
  renameSync(tmp, path)
}

export function importHarvest ({ root, home }) {
  const out = { blobs: 0, rewritten: 0, missing: [] }
  const readJson = p => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
  const idxPath = join(root, 'spec/_results-index.json')
  const runsPath = join(root, 'spec/_runs.json')
  const idx = existsSync(idxPath) ? readJson(idxPath) : null
  const runs = existsSync(runsPath) ? readJson(runsPath) : null
  if (!idx && !runs) return out
  mkdirSync(home, { recursive: true })
  const had = new Set()
  if (existsSync(join(home, 'blobs'))) for (const n of readdirSync(join(home, 'blobs'))) had.add(`blob/${n}`)
  const landed = new Set()
  const moveOne = s => {
    if (isBlobRel(s) || /^runs\//.test(s) || !SPEC.test(s)) return s
    const abs = join(root, s)
    if (!existsSync(abs)) { if (!out.missing.includes(s)) out.missing.push(s); return s }
    const run = RUN.exec(s)
    if (run) {
      const dest = join(home, 'runs', run[1], run[2])
      if (!existsSync(dest)) { mkdirSync(dirname(dest), { recursive: true }); copyFileSync(abs, dest) }
      out.rewritten++
      return `runs/${run[1]}/${run[2]}`
    }
    const rel = putBlob(home, readFileSync(abs), extname(abs).slice(1) || 'bin')
    landed.add(rel)
    out.rewritten++
    return rel
  }
  const walk = v => {
    if (typeof v === 'string') return moveOne(v)
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = walk(x); return o }
    return v
  }
  if (idx) writeJsonAtomic(join(home, 'index.json'), walk(idx))
  if (runs) writeJsonAtomic(join(home, 'runs.json'), walk(runs))
  out.blobs = [...landed].filter(r => !had.has(r)).length
  return out
}

// CLI: import THIS tree's harvest into its own data home.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  let manifest = null
  try { manifest = JSON.parse(readFileSync(join(root, 'spec/_specboard.json'), 'utf8')) } catch { manifest = null }
  const home = dataHome(root, manifest)
  const r = importHarvest({ root, home })
  console.log(`imported into ${home}: ${r.blobs} new blob(s), ${r.rewritten} path(s) rewritten, ${r.missing.length} missing`)
  for (const m of r.missing.slice(0, 20)) console.log(`  missing · ${m}`)
}
```


- [ ] **Step 4: Run to verify it passes**

Run: `node --test tools/store-import.test.mjs`
Expected: 4 passing. If the "importing twice" test reports `blobs: 0` but the index differs, the walk is non-deterministic — it must not be; check that `Object.entries` order is preserved (it is) and that no timestamp is written.

- [ ] **Step 5: Commit**

```bash
git add tools/store-import.mjs tools/store-import.test.mjs
git commit -m "feat(store): importHarvest — move a committed fold + its files into the data home once, idempotent, never deleting from the repo"
```

---

### Task 4: the manifest carries a project `id`

**Files:**
- Modify: `tools/_skeleton.mjs:206-214` (`mergeManifest`)
- Modify: `tools/scaffold.mjs` (the manifest write, around the `mergeManifest(buildManifest(SRC), prev)` line)
- Test: `tools/sidecar.test.mjs`

**Interfaces:**
- Consumes: `projectId` (Task 1)
- Produces: `mergeManifest(fresh, prev)` keeps `prev.id`; `newProjectId(name) → string` in `tools/_skeleton.mjs` = `<slug(name)>-<6 hex from randomBytes>`, slug = lowercase, non `[a-z0-9]` runs → `-`, trimmed to 40 chars, at least one char (falls back to `project`).

- [ ] **Step 1: Write the failing tests** (append to `tools/sidecar.test.mjs`)

```js
import { newProjectId } from './_skeleton.mjs'

test('a project id is a slug of the name plus six hex, and mergeManifest carries it across updates', () => {
  const id = newProjectId('Tsumiki Demo!')
  assert.match(id, /^tsumiki-demo-[0-9a-f]{6}$/)
  assert.match(newProjectId(''), /^project-[0-9a-f]{6}$/)
  const merged = mergeManifest({ version: '0.45.0', files: {} }, { version: '0.44.2', files: {}, id, project: { name: 'x' } })
  assert.equal(merged.id, id)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/sidecar.test.mjs`
Expected: FAIL — `newProjectId` is not exported

- [ ] **Step 3: Implement**

In `tools/_skeleton.mjs`, add beside `mergeManifest`:

```js
import { randomBytes } from 'node:crypto'

// The project's id (decision A, 2026-09-05): names its data home, ~/.specboard/<id>/, on every
// machine that checks the project out — written once by the scaffold, committed with the manifest,
// carried across updates. A slug of the name so a person can find the folder, plus six hex so two
// projects called "app" do not share one.
export function newProjectId (name) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return `${slug || 'project'}-${randomBytes(3).toString('hex')}`
}
```

and in `mergeManifest`, where `project` and `app` are carried from `prev`, carry `id` the same way:

```js
  if (prev && typeof prev.id === 'string' && prev.id.trim()) out.id = prev.id.trim()
```

(read the function first — it builds an `out` from `fresh` and copies `project`/`app` from `prev`; add the line next to those).

In `tools/scaffold.mjs`, where the fresh manifest is built (`const fresh = mergeManifest(buildManifest(SRC), prev)`), add after it:

```js
  if (!fresh.id) fresh.id = newProjectId((fresh.project && fresh.project.name) || basename(APP))
```

and add `newProjectId` to the `_skeleton.mjs` import list (and `basename` to the `node:path` import if missing).

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tools/sidecar.test.mjs tools/update.test.mjs`
Expected: all passing (update.test.mjs proves the decision table still holds with the new field carried).

- [ ] **Step 5: Commit**

```bash
git add tools/_skeleton.mjs tools/scaffold.mjs tools/sidecar.test.mjs
git commit -m "feat(skeleton): the manifest carries a project id — the name of its data home on every machine"
```

---

## Phase 2 — the pipeline reads and writes the store

### Task 5: `spec-store` — paths in the data home, `resolveRel`, GC at the fold, index-driven `chromeSource`/`hasAnyReplica`/`vizFor`

**Files:**
- Modify: `tools/spec-store.mjs:23-29` (roots), `:208-219` (RESULTS/RESULTS_INDEX/RUNS), `:273-333` (`foldByScreen`), `:455-470` (`vizFor`), `:905-953` (`chromeSource`, `hasAnyReplica`)
- Test: `tools/store-paths.test.mjs` (new)

**Interfaces:**
- Consumes: `dataHome`, `blobPath`, `referencedBlobs`, `gcBlobs` (Tasks 1–2)
- Produces (exports from `tools/spec-store.mjs`):
  - `DATA_HOME` — `dataHome(ROOT, manifest)` where `manifest` is the parsed `spec/_specboard.json` or `null`
  - `RESULTS = join(DATA_HOME, 'results.json')`, `RESULTS_INDEX = join(DATA_HOME, 'index.json')`, `RUNS = join(DATA_HOME, 'runs.json')`, `RUNDIR = join(DATA_HOME, 'runs')`, `VIZ_DIR = join(DATA_HOME, 'viz')`
  - `resolveRel(rel) → string|null` — `blob/…` → `blobPath(DATA_HOME, rel)`; `runs/<id>/…` → `join(DATA_HOME, rel)` only if the joined path still starts with `RUNDIR + sep`; anything else → `join(ROOT, rel)` only if that starts with `ROOT + sep`; else `null`
  - `momentsOf(entry) → Array<{ frame, layout, replica }>` — pure: from one evidence entry, every moment's file triple (beats' before/after with their layout/replica; each value's frame/layout/replicaExpected). Used by Tasks 7, 9.
  - `writeJson` creates the parent directory when missing.

- [ ] **Step 1: Write the failing tests**

```js
// tools/store-paths.test.mjs — spec-store's roots live in the DATA HOME (decision A, 2026-09-05).
// The module reads SPECBOARD_HOME at import, so each test imports it fresh under its own home.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

const fresh = async home => {
  process.env.SPECBOARD_HOME = home
  return import('./spec-store.mjs?home=' + encodeURIComponent(home))
}

test('the fold, the run log and the record dir live in the data home, never under spec/', async () => {
  const home = mkdtempSync(join(tmpdir(), 'kgsp-'))
  const s = await fresh(home)
  assert.equal(s.DATA_HOME.startsWith(home + sep), true)
  assert.equal(s.RESULTS_INDEX, join(s.DATA_HOME, 'index.json'))
  assert.equal(s.RUNS, join(s.DATA_HOME, 'runs.json'))
  assert.equal(s.RUNDIR, join(s.DATA_HOME, 'runs'))
  assert.equal(s.VIZ_DIR, join(s.DATA_HOME, 'viz'))
  assert.equal(s.RESULTS_INDEX.includes(`${sep}spec${sep}`), false)
})

test('resolveRel: a blob to the blob dir, a run record under runs/, a repo path under ROOT, and nothing that escapes', async () => {
  const home = mkdtempSync(join(tmpdir(), 'kgsp-'))
  const s = await fresh(home)
  const b = 'blob/' + 'c'.repeat(64) + '.png'
  assert.equal(s.resolveRel(b), join(s.DATA_HOME, 'blobs', 'c'.repeat(64) + '.png'))
  assert.equal(s.resolveRel('runs/17/case/video.webm'), join(s.DATA_HOME, 'runs', '17', 'case', 'video.webm'))
  assert.equal(s.resolveRel('spec/board/prd.md'), join(s.ROOT, 'spec', 'board', 'prd.md'))
  assert.equal(s.resolveRel('runs/../../etc/passwd'), null)
  assert.equal(s.resolveRel('../etc/passwd'), null)
})

test('writeJson creates the data home on first write', async () => {
  const home = mkdtempSync(join(tmpdir(), 'kgsp-'))
  const s = await fresh(home)
  s.writeJson(join(s.DATA_HOME, 'index.json'), { a: 1 })
  assert.equal(JSON.parse(readFileSync(join(s.DATA_HOME, 'index.json'), 'utf8')).a, 1)
})

test('momentsOf lists every moment triple of an entry, values included', async () => {
  const s = await fresh(mkdtempSync(join(tmpdir(), 'kgsp-')))
  const e = { beats: [{ n: 1, before: 'b', after: 'a', layoutBefore: 'lb', layoutAfter: 'la', replicaExpectedBefore: 'rb', replicaExpectedAfter: 'ra', values: [{ k: 1, frame: 'f', layout: 'l', replicaExpected: 'r' }] }] }
  assert.deepEqual(s.momentsOf(e), [
    { frame: 'b', layout: 'lb', replica: 'rb' },
    { frame: 'f', layout: 'l', replica: 'r' },
    { frame: 'a', layout: 'la', replica: 'ra' }
  ])
  assert.deepEqual(s.momentsOf(null), [])
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/store-paths.test.mjs`
Expected: FAIL — `DATA_HOME` undefined / `resolveRel` not a function

- [ ] **Step 3: Implement in `tools/spec-store.mjs`**

Near the roots (after `APP_ROOT`, line 28):

```js
import { dataHome, blobPath, referencedBlobs, gcBlobs } from './store.mjs'
import { sep, isAbsolute } from 'node:path'   // merge into the existing node:path import

// THE DATA HOME (decision A, 2026-09-05; tools/store.mjs). Everything derived lives here, outside
// every git: the fold, the run log, the run records, the blobs, the sketches. Named by the manifest's
// id, so every checkout of a project shares one home per machine.
const MANIFEST_HERE = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'spec/_specboard.json'), 'utf8')) } catch { return null } })()
export const DATA_HOME = dataHome(ROOT, MANIFEST_HERE)
export const RUNDIR = join(DATA_HOME, 'runs')
export const VIZ_DIR = join(DATA_HOME, 'viz')

// A string out of the index → the file it names, or null. Three shapes and no fourth: a blob, a
// run record, a repo-relative path (prd.md, test.spec.ts, screen.png — the authored tree and the
// two pictures tests still write there). Each is confined to its own root, so a crafted string can
// reach nothing else — the static server's allowlist and every tool read through this one door.
export function resolveRel (rel) {
  const s = String(rel || '')
  if (!s || isAbsolute(s)) return null
  const b = blobPath(DATA_HOME, s)
  if (b) return b
  if (/^runs\//.test(s)) { const p = resolve(RUNDIR, s.slice(5)); return p.startsWith(RUNDIR + sep) ? p : null }
  const p = resolve(ROOT, s)
  return p.startsWith(ROOT + sep) ? p : null
}

// Pure: one evidence entry → every moment's file triple, in the order the row shows them.
export function momentsOf (entry) {
  const out = []
  for (const b of (entry && Array.isArray(entry.beats) ? entry.beats : [])) {
    if (!b) continue
    out.push({ frame: b.before || null, layout: b.layoutBefore || null, replica: b.replicaExpectedBefore || null })
    for (const v of (Array.isArray(b.values) ? b.values : [])) if (v) out.push({ frame: v.frame || null, layout: v.layout || null, replica: v.replicaExpected || null })
    out.push({ frame: b.after || null, layout: b.layoutAfter || null, replica: b.replicaExpectedAfter || null })
  }
  return out
}
```

Replace lines 208–215:

```js
export const RESULTS = join(DATA_HOME, 'results.json')
export const RESULTS_INDEX = join(DATA_HOME, 'index.json')
// …
export const RUNS = join(DATA_HOME, 'runs.json')
```

`writeJson` (line 52): add `mkdirSync(dirname(path), { recursive: true })` before the temp write (import `mkdirSync`, `dirname`).

In `foldByScreen`, replace the whole `if (evidence && Object.keys(evidence).length) { … }` block (the `rmSync` prune loop and the `legacyActualReplicas` sweep) with:

```js
  if (evidence && Object.keys(evidence).length) {
    // the fold's carry rules (tools/evidence.mjs foldEvidence) decide which entry stands; what its
    // return value used to name for deletion is now decided by ADDRESS: after the write below, a
    // blob no retained record names is collected (gcBlobs) — the refcount the fonts and the video
    // kept by hand is a property of the content address.
    foldEvidence(index, evidence)
  }
```

and after `writeJson(RESULTS_INDEX, index)`:

```js
  try {
    const keep = referencedBlobs(index, readRuns())
    gcBlobs(DATA_HOME, keep)
  } catch (err) { console.error('blob gc failed:', err) }
  return index
```

Remove the `legacyActualReplicas` import if nothing else uses it (keep the export in `evidence.mjs`; its unit test still pins it).

`vizFor` (line 462): `const p = join(VIZ_DIR, screen, `${id}.svg`)`.

`chromeSource` (lines 913–950): replace the directory read with an index read —

```js
export function chromeSource (name) {
  const idx = readResults()
  const entries = Object.values((idx[name] && idx[name].evidence) || {})
  // deterministic: the first Before moment, by requirement id, that still has the skeleton it was
  // measured with — the skeleton is what says where the shell ends and a screen's own words begin
  const firsts = entries.flatMap(e => momentsOf(e).filter(m => m.replica && m.layout && /\.html$/.test(m.replica)))
    .filter((m, i, a) => a.findIndex(x => x.replica === m.replica) === i)
    .sort((a, b) => String(a.replica).localeCompare(String(b.replica)))
  for (const m of firsts) {
    let lay = null
    try { lay = JSON.parse(readFileSync(resolveRel(m.layout), 'utf8')) } catch { continue }
    let doc = null
    try {
      const html = readFileSync(resolveRel(m.replica), 'utf8')
      const mm = /data-replica-region="([^"]*)"/.exec(html)
      const p = mm ? mm[1].trim().split(/\s+/).map(Number) : []
      if (p.length === 4 && p.every(Number.isFinite)) doc = p[3]
    } catch { /* an unreadable page lends nothing but its viewport */ }
    const content = contentRect(lay, doc)
    if (!content) continue
    return { replica: m.replica, vw: Number(lay.w), vh: Number(lay.h), content }
  }
  return null
}
export function hasAnyReplica (name) {
  const idx = readResults()
  return Object.values((idx[name] && idx[name].evidence) || {}).some(e => momentsOf(e).some(m => m.replica))
}
```

Note the old code chose only a **before** replica ("a before moment rang nothing, so its replica is the whole page"); keep that: filter `momentsOf` output to the first triple of each beat. Simplest: add an `phase` field to `momentsOf` items (`'before' | 'value' | 'after'`) and filter `m.phase === 'before'`. Update the Step 1 expectation accordingly (`{ phase: 'before', frame: 'b', … }`).

- [ ] **Step 4: Run the units**

Run: `node --test tools/store-paths.test.mjs tools/stale-proof.test.mjs tools/evidence-fold.test.mjs tools/chrome-from.test.mjs`
Expected: all passing. `chrome-from.test.mjs` tests the pure choice, not the disk read, so it must be untouched.

Run: `npm run test:tools`
Expected: every suite green EXCEPT tests that pinned the old locations; list them. Expected to need attention: `tools/reporter-derive.test.mjs` / `tools/reporter-gate.test.mjs` if they write `spec/_results-index.json` into a temp cwd — read each failure and decide (rule 4) which side is wrong: a test asserting "the index is at `spec/_results-index.json`" is now asserting the old rule and moves to `DATA_HOME`; a test asserting a fold rule is right and must still pass.

- [ ] **Step 5: Commit**

```bash
git add tools/spec-store.mjs tools/store-paths.test.mjs tools/*.test.mjs
git commit -m "feat(spec-store): the fold, the run log, the records and the sketches live in the data home; resolveRel is the one door; gc by reference replaces prune by path"
```

---

### Task 6: `deriveFacesCss` points a rule at the face's blob

**Files:**
- Modify: `tools/evidence.mjs:164-190`
- Test: `tools/evidence.test.mjs`

**Interfaces:**
- Produces: `deriveFacesCss(rules, fonts)` — a font entry with a `path` maps its url to `basename(path)`; one without keeps `${hash}.${ext}`. The sheet itself lands as a blob at `blob/<sha>.css` (Task 7); a relative `url(<sha>.woff2)` inside it resolves against `/blob/`, which is exactly where the face is.

- [ ] **Step 1: Write the failing test** (append to `tools/evidence.test.mjs`)

```js
test('deriveFacesCss rewrites a face url to the blob the fold landed it as, so the sheet and the face sit in one dir', () => {
  const rules = [{ cssText: '@font-face{font-family:X;src:url(https://cdn/x.woff2)}', urls: ['https://cdn/x.woff2'] }]
  const fonts = [{ url: 'https://cdn/x.woff2', hash: 'abc', ext: 'woff2', path: 'blob/' + 'f'.repeat(64) + '.woff2' }]
  assert.equal(deriveFacesCss(rules, fonts), '@font-face{font-family:X;src:url(' + 'f'.repeat(64) + '.woff2)}')
  assert.equal(deriveFacesCss(rules, [{ url: 'https://cdn/x.woff2', hash: 'abc', ext: 'woff2' }]), '@font-face{font-family:X;src:url(abc.woff2)}')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/evidence.test.mjs`
Expected: FAIL on the first assertion (`url(abc.woff2)` instead of the blob name)

- [ ] **Step 3: Implement** — in `deriveFacesCss`, replace the `byUrl.set` line:

```js
    if (f && f.url && ((f.hash && f.ext) || f.path)) {
      byUrl.set(String(f.url), f.path ? String(f.path).split('/').pop() : `${f.hash}.${f.ext}`)
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tools/evidence.test.mjs`
Expected: all passing

- [ ] **Step 5: Commit**

```bash
git add tools/evidence.mjs tools/evidence.test.mjs
git commit -m "fix(evidence): a faces sheet names each face by the blob it landed as"
```

---

### Task 7: the reporter lands the harvest as blobs and the run record under `runs/<id>/`

**Files:**
- Modify: `spec/_results-reporter.mjs:176-436` (`harvestEvidence`, `commitVideo`, `landFrame`, fonts, faces), `:700-778` (`shotsByTest`, `recordRunEntry`)
- Test: `tools/reporter-blobs.test.mjs` (new)

**Interfaces:**
- Consumes: `putBlob`, `DATA_HOME`, `RESULTS_INDEX`, `RUNDIR` (Tasks 1, 5)
- Produces: `harvestEvidence(harvest, ranAt)` exported; every landed field (`before`, `after`, beat `before/after/layoutBefore/layoutAfter/replicaExpectedBefore/replicaExpectedAfter`, value `frame/layout/replicaExpected`, `fonts[].path`, `fontFaces`, `video.path`) is a `blob/…` rel. `shotsByTest[title].shots[]` and `.video` are `runs/<runId>/<path relative to BOARD_RECORD>`.

- [ ] **Step 1: Write the failing test**

```js
// tools/reporter-blobs.test.mjs — the harvest LANDS AS BLOBS (decision A, 2026-09-05): no file is
// copied into spec/<screen>/evidence/ any more; every landed field is a content address in the
// data home, so an unchanged frame costs nothing and a dropped one is collected by reference.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('harvestEvidence returns blob rels for every landed file and writes nothing under spec/', async () => {
  const home = mkdtempSync(join(tmpdir(), 'kgrep-'))
  process.env.SPECBOARD_HOME = home
  const { harvestEvidence } = await import('../spec/_results-reporter.mjs?home=' + encodeURIComponent(home))
  const { isBlobRel, blobPath } = await import('./store.mjs')
  const { DATA_HOME } = await import('./spec-store.mjs?home=' + encodeURIComponent(home))
  const src = mkdtempSync(join(tmpdir(), 'kgsrc-'))
  const f = (n, body) => { const p = join(src, n); writeFileSync(p, body); return p }
  const harvest = {
    'board:R1': {
      window: { from: 0, to: 10 },
      beats: [{ n: 1, before: f('b.png', 'PNGB'), after: f('a.png', 'PNGA'), layoutBefore: f('lb.json', '{"w":1,"h":1,"els":[]}'), layoutAfter: f('la.json', '{"w":1,"h":1,"els":[]}'), replicaExpectedBefore: f('rb.html', '<div data-replica-layout="x"></div>'), replicaExpectedAfter: f('ra.html', '<div></div>'), values: [] }],
      fonts: [{ hash: 'abc', ext: 'woff2', src: f('x.woff2', 'FONT'), url: 'https://cdn/x.woff2', family: 'X' }],
      fontFaceRules: [{ cssText: '@font-face{font-family:X;src:url(https://cdn/x.woff2)}', urls: ['https://cdn/x.woff2'] }]
    }
  }
  const out = harvestEvidence(harvest, Date.now())
  const e = out['board:R1']
  assert.ok(e, 'the entry landed')
  for (const k of ['before', 'after']) assert.equal(isBlobRel(e[k]), true, k)
  const b = e.beats[0]
  for (const k of ['before', 'after', 'layoutBefore', 'layoutAfter', 'replicaExpectedBefore', 'replicaExpectedAfter']) assert.equal(isBlobRel(b[k]), true, k)
  assert.equal(isBlobRel(e.fonts[0].path), true)
  assert.equal(isBlobRel(e.fontFaces), true)
  assert.match(e.fontFaces, /\.css$/)
  assert.equal(existsSync(blobPath(DATA_HOME, b.before)), true)
  assert.equal(existsSync(join(process.cwd(), 'spec', 'board', 'evidence', 'R1.b1.before.png')), false)
})
```

Read `harvestEvidence`'s signature and the harvest shape it expects (lines 219–380) before finalising the fixture: the beat objects carry the attachment's ABSOLUTE source paths under the keys the code reads (`b.before`, `b.after`, `b.layoutBefore`, …, `b.values[k].frame`), and `r.before`/`r.after` may be requirement-level fallbacks. Match the fixture to the code, not the other way round.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/reporter-blobs.test.mjs`
Expected: FAIL — `harvestEvidence` is not exported (then, once exported, the fields are `spec/board/evidence/…` strings)

- [ ] **Step 3: Implement in `spec/_results-reporter.mjs`**

Imports: add `import { putBlob } from '../tools/store.mjs'` and extend the spec-store import to `{ foldByScreen, recordRunEntry, RESULTS_INDEX, RUNDIR }`. Add `import { tmpdir } from 'node:os'`.

Replace every landing with a blob put. The pattern, applied to each `copyFileSync(src, join(process.cwd(), destRel))` in `harvestEvidence`:

```js
// ONE WAY IN (decision A): bytes → a blob in the data home; the rel is the value the index keeps
// and the URL the board asks for. `ext` is the source file's own extension.
const land = src => {
  try { return putBlob(DATA_HOME, readFileSync(src), extname(src).slice(1)) } catch { return null }
}
```

(`DATA_HOME` imported from spec-store.) Then:

- `landFrame(src, destRel)`: when ffmpeg is present, downscale into a temp file `join(tmpdir(), \`sb-${process.pid}-${Date.now()}.png\`)` with `ffmpegDownscaleArgs(src, tmp)`, then `land(tmp)` and `rmSync(tmp, { force: true })`; else `land(src)`. It returns the rel or `null` — callers assign `entry[phase] = rel` when non-null instead of testing a boolean.
- beat files (`copyFileSync(b[key], join(process.cwd(), bp[key])); row[key] = bp[key]`): `const rel = land(b[key]); if (rel) row[key] = rel`.
- value files: the same with `vp` — `const rel = land(v[key]); if (rel) got[key] = rel` (and `got.layout` likewise).
- the requirement-level pair: `entry[phase] = <the beat's already-landed rel>` where the code copied `from`; else `landFrame(r[phase])`.
- fonts: `const rel = land(f.src); if (rel && !faces.some(x => x.hash === f.hash)) faces.push({ hash: f.hash, ext: f.ext, family: f.family || '', url: f.url || '', path: rel })` — **keep `url`** on the face, `deriveFacesCss` keys by it.
- the faces sheet: `const css = deriveFacesCss(r.fontFaceRules || [], faces); if (css) entry.fontFaces = putBlob(DATA_HOME, Buffer.from(css + '\n'), 'css')`.
- `commitVideo(srcVideo, scr, cache)`: re-encode with `ffmpegVideoArgs` into a temp `.webm`, `land` it, remove the temp; without ffmpeg `land(srcVideo)`. Return the rel.
- `evidencePaths`/`beatEvidencePaths`/`valueEvidencePaths`/`fontEvidencePath`/`facesCssPath`/`evidenceVideoPath` are no longer called here; remove them from the import (the functions stay in `evidence.mjs` for the importer's tests and history — do not delete them in this task).
- `mkdirSync(join(process.cwd(), paths.dir), …)` lines: delete — nothing is written under `spec/`.
- `committed`: `try { committed = JSON.parse(readFileSync(RESULTS_INDEX, 'utf8')) } catch { committed = {} }`.
- `export` the function: `export function harvestEvidence (harvest, ranAt)`.

Run-record paths (the `shotsByTest[test.title] = { shots, video: video ? relative(process.cwd(), video.path) : null, … }` block and wherever `shots` entries are built with `relative(process.cwd(), …)`): with `BOARD_RECORD` set, make each `runs/${basename(process.env.BOARD_RECORD)}/${relative(process.env.BOARD_RECORD, abs)}`; without it (a CLI run) `shots` and `video` are already blanked by `recordRunEntry`'s map — leave that.

The `whole-log` link the server offers reads `run.log` inside the record dir — unchanged, the dir moved with `RUNDIR`.

- [ ] **Step 4: Run the units, then a real harvest on a free port**

Run: `node --test tools/reporter-blobs.test.mjs tools/reporter-guard.test.mjs tools/reporter-derive.test.mjs tools/reporter-gate.test.mjs tools/reporter-steps.test.mjs`
Expected: all passing.

Run: `SPECBOARD_HOME=$(mktemp -d) BOARD_PORT=4199 npx playwright test --config=playwright.board.ts spec/conflicts/test.spec.ts`
Wait for the fold line (`N drawing(s) written` or the gap summary), then:

```bash
ls $SPECBOARD_HOME/*/blobs | head; node -e "const i=require(process.env.SPECBOARD_HOME+'/'+require('fs').readdirSync(process.env.SPECBOARD_HOME)[0]+'/index.json'); console.log(Object.keys(i), JSON.stringify(i.conflicts.evidence.R1.beats[0]).slice(0,300))"
```

Expected: the index in the temp home, every evidence value a `blob/…` rel, nothing new under `spec/conflicts/evidence/` (`git status --short spec/conflicts` shows no change). (`$SPECBOARD_HOME` must be exported in the same shell for both commands — `export SPECBOARD_HOME=$(mktemp -d)` first.)

- [ ] **Step 5: Commit**

```bash
git add spec/_results-reporter.mjs tools/reporter-blobs.test.mjs
git commit -m "feat(reporter): the harvest lands as content-addressed blobs in the data home; run records under runs/<id>/"
```

---

### Task 8: the server serves blobs and run records; the client's log link follows

**Files:**
- Modify: `tools/serve-board.mjs:94` (RUNDIR), `:1262-1300` (static), `:1298` (CORS), the `run.log` link (`:846`)
- Modify: `tools/board/client.js:4845` (`/spec/_runs/` → `/runs/`)
- Test: `tools/static-allow.test.mjs` (new) for the pure allow decision

**Interfaces:**
- Consumes: `RUNDIR`, `resolveRel` (Task 5)
- Produces: `staticTarget(rel) → { file, kind } | null` exported from `tools/serve-board.mjs`… — the server is not importable without starting (check the file's bottom: if `listen` runs at import, put the pure decision in `tools/static-allow.mjs` instead and import it from both). `kind` ∈ `'board' | 'spec' | 'blob' | 'run'`.

- [ ] **Step 1: Write the failing test**

```js
// tools/static-allow.test.mjs — the static server is an ALLOWLIST (CLAUDE.md trap). Four kinds and
// no fifth: board.html, the authored tree under spec/, a blob, a run record.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allowKind } from './static-allow.mjs'

test('allowKind names the four servable kinds and refuses everything else', () => {
  assert.equal(allowKind('board.html'), 'board')
  assert.equal(allowKind('spec/board/prd.md'), 'spec')
  assert.equal(allowKind('blob/' + 'a'.repeat(64) + '.png'), 'blob')
  assert.equal(allowKind('runs/1788509372511/case/video.webm'), 'run')
  assert.equal(allowKind('runs/1788509372511/run.log'), 'run')
  assert.equal(allowKind('.git/config'), null)
  assert.equal(allowKind('blob/../x'), null)
  assert.equal(allowKind('runs/../spec/x'), null)
  assert.equal(allowKind('runs/17'), null)              // a dir, not a file
  assert.equal(allowKind('spec/_runs/17/run.log'), 'spec')  // the old path is still a spec path; resolveRel says whether it exists
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/static-allow.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

`tools/static-allow.mjs`:

```js
// tools/static-allow.mjs — the static server's ALLOWLIST as a pure decision (decision A added two
// kinds to the two it had). A blob rel and a run-record rel are matched by SHAPE; the file each names
// is found by spec-store's resolveRel, which confines each kind to its own root.
const BLOB = /^blob\/[0-9a-f]{64}\.[a-z0-9]{1,8}$/
const RUN = /^runs\/[A-Za-z0-9_-]+\/(?:[^/.][^/]*\/)*[^/.][^/]*$/
export function allowKind (rel) {
  const s = String(rel || '')
  if (s.includes('..')) return null
  if (s === 'board.html') return 'board'
  if (BLOB.test(s)) return 'blob'
  if (RUN.test(s)) return 'run'
  if (/^spec\/.+/.test(s)) return 'spec'
  return null
}
```

In `tools/serve-board.mjs`:
- line 94: delete `const RUNDIR = join(SPEC, '_runs')`; import `RUNDIR, resolveRel` from `./spec-store.mjs`; import `allowKind` from `./static-allow.mjs`.
- static block: replace

```js
  const allowed = rel === 'board.html' || rel.startsWith('spec/')
  …
  const file = join(ROOT, rel)
  if (!allowed || !file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
```

with

```js
  const kind = allowKind(rel)
  …
  const file = kind === 'board' ? join(ROOT, 'board.html') : kind ? resolveRel(rel) : null
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
```

- CSP: `const csp = (kind === 'spec' || kind === 'blob') && rel.endsWith('.html') ? { … } : {}` (the same header value as today).
- CORS: `const cors = (kind === 'blob' && /\.(woff2?|ttf|otf|css)$/.test(rel)) || /^spec\/.*\/_fonts\/[^/]+$/.test(rel) ? { 'access-control-allow-origin': '*' } : {}`.
- the whole-log link (line ~846): the server tests `existsSync(join(RUNDIR, runId, 'run.log'))` — unchanged; the client's href becomes `'/runs/' + eh(h.runId) + '/run.log'` (client.js:4845).
- the prune at line 309 already iterates `RUNDIR`; unchanged.

Run `node --check tools/board/client.js` after the client edit.

- [ ] **Step 4: Verify with the board spec on a free port**

Run: `node --test tools/static-allow.test.mjs` → passing.
Run: `export SPECBOARD_HOME=$(mktemp -d); BOARD_PORT=4199 npx playwright test --config=playwright.board.ts spec/conflicts/test.spec.ts spec/board/test.spec.ts`
Expected: green; the board's reader tests (the beat-row / Expected tests in `spec/board/test.spec.ts`) load frames and replicas over `/blob/…`. If a reader test fails on a missing picture, `curl -I http://localhost:4199/blob/<name>` for one rel out of `$SPECBOARD_HOME/*/index.json` and read the 404 reason before touching the test (rule 4).

- [ ] **Step 5: Commit**

```bash
git add tools/static-allow.mjs tools/static-allow.test.mjs tools/serve-board.mjs tools/board/client.js
git commit -m "feat(serve): /blob/<sha>.<ext> and /runs/<id>/… join the allowlist; the record dir moves with the data home"
```

---

### Task 9: `viz-derive` and `proof-integrity` read the store

**Files:**
- Modify: `tools/viz-derive.mjs:44-110`
- Modify: `tools/proof-integrity.mjs:190-330` (`checkMirrors`, `checkReplicas`)
- Test: `tools/proof-integrity.test.mjs` (extend)

**Interfaces:**
- Consumes: `VIZ_DIR`, `RESULTS_INDEX`, `resolveRel`, `momentsOf` (Task 5)
- Produces: `checkReplicas(index = readResults())` — rows `{ screen, id, file, ok, why, gaps }` for every moment with a `replica` in the index, `file` = its blob rel; `checkMirrors(vizDir = VIZ_DIR)`.

- [ ] **Step 1: Write the failing test** (append to `tools/proof-integrity.test.mjs`; read its existing fixture style first and reuse its helpers)

```js
test('checkReplicas walks the INDEX, not a directory: a moment with a replica and no skeleton is refused', async () => {
  const home = mkdtempSync(join(tmpdir(), 'kgpi-'))
  process.env.SPECBOARD_HOME = home
  const { putBlob } = await import('./store.mjs')
  const { DATA_HOME } = await import('./spec-store.mjs?home=' + encodeURIComponent(home))
  const { checkReplicas } = await import('./proof-integrity.mjs?home=' + encodeURIComponent(home))
  const replica = putBlob(DATA_HOME, Buffer.from('<div data-replica-layout="deadbeef" data-replica-gaps="0"></div>'), 'html')
  const index = { board: { evidence: { R1: { beats: [{ n: 1, replicaExpectedBefore: replica, layoutBefore: null }] } } } }
  const rows = checkReplicas(index)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].file, replica)
  assert.equal(rows[0].ok, false)
  assert.match(rows[0].why, /no layout skeleton/)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/proof-integrity.test.mjs`
Expected: FAIL — `checkReplicas` ignores its argument and reads `spec/`

- [ ] **Step 3: Implement**

`checkReplicas(index = readResults())`: replace the directory walk with

```js
  for (const screen of Object.keys(index || {}).filter(s => !s.startsWith('_')).sort()) {
    for (const [id, entry] of Object.entries((index[screen] && index[screen].evidence) || {})) {
      for (const m of momentsOf(entry)) {
        if (!m.replica) continue
        const row = { screen, id, file: m.replica, side: 'expected', ok: true, why: '', gaps: [] }
        rows.push(row)
        let html = ''
        try { html = readFileSync(resolveRel(m.replica), 'utf8') } catch { html = '' }
        // … the existing checks, unchanged, with `layPath` replaced by:
        let lay = null
        if (m.layout) { try { lay = JSON.parse(readFileSync(resolveRel(m.layout), 'utf8')) } catch { lay = null } }
        // … (the rest of the body as today)
      }
    }
  }
```

The `.actual.html` "retired file" branch is dead now (the index never names one); delete it and its `side` field usage, or leave `side: 'expected'` constant if a printer reads it.

`checkMirrors(vizDir = VIZ_DIR)`: the screens are the subdirectories of `vizDir`; each `.svg` under `vizDir/<screen>/` is checked as today.

`tools/viz-derive.mjs`: `harvestIndex(screen)` → returns the ids harvested from the index:

```js
import { readResults, VIZ_DIR, momentsOf } from './spec-store.mjs'
const harvestedIds = screen => {
  const idx = readResults()
  const out = new Set()
  for (const [id, e] of Object.entries((idx[screen] && idx[screen].evidence) || {})) {
    if (momentsOf(e).some(m => m.layout || m.replica)) out.add(id)
  }
  return out
}
```

and `harvested(files, id)` becomes `harvestedIds(screen).has(id)`; the output dir (line 65) becomes `join(VIZ_DIR, s.name)`.

Also `tools/proof-integrity.mjs` `lint` (the `existsSync('spec')` walks at lines ~878–897) reads authored files only — unchanged.

- [ ] **Step 4: Verify**

Run: `node --test tools/proof-integrity.test.mjs` → passing.
Run, with the temp home from Task 8 still exported: `npm run proof mirror && npm run proof lint`
Expected: the mirror census reads the two screens harvested in Task 8, green (or the same gap list the fold printed — never a new "no layout skeleton" row: that would mean a landing in Task 7 dropped a layout).
Run: `node tools/viz-derive.mjs conflicts` → writes under `$SPECBOARD_HOME/*/viz/conflicts/` only for requirements with no replica; `git status --short spec/` shows nothing new.

- [ ] **Step 5: Commit**

```bash
git add tools/viz-derive.mjs tools/proof-integrity.mjs tools/proof-integrity.test.mjs
git commit -m "feat(gates): the replica gate and the sketch pass read the index and the data home, never a directory listing"
```

---

### Task 10: `playwright.board.ts` writes the raw report into the data home

**Files:**
- Modify: `playwright.board.ts` (the `reporter` json `outputFile`)

- [ ] **Step 1: Edit**

```ts
import { dataHome } from './tools/store.mjs'
// …
const manifest = (() => { try { return JSON.parse(readFileSync('./spec/_specboard.json', 'utf8')) } catch { return null } })()
const HOME = dataHome(process.cwd(), manifest)
// …
    ['json', { outputFile: process.env.BOARD_RESULTS || `${HOME}/results.json` }],
```

- [ ] **Step 2: Verify**

Run: `export SPECBOARD_HOME=$(mktemp -d); BOARD_PORT=4199 npx playwright test --config=playwright.board.ts spec/conflicts/test.spec.ts`
Expected: `ls $SPECBOARD_HOME/*/results.json` exists; `spec/_results.json` is untouched (`git status --short spec/_results.json` empty — it is still tracked until Task 11).

- [ ] **Step 3: Commit**

```bash
git add playwright.board.ts
git commit -m "chore(playwright): the raw json report lands in the data home"
```

---

### Task 11: this repo and demo/todo stop tracking their harvest

**Files:**
- Modify: `.gitignore`, `demo/todo/.gitignore`, `spec/.gitignore` (create if absent), `CLAUDE.md` (Architecture block + THE LAYOUT RULE paragraph)
- Remove from the index (not from disk yet): every tracked file matching `spec/*/evidence/**`, `spec/*/viz/**`, `spec/*/screen.png`, `board.html`, `spec/_runs.json`, `spec/_results.json`, `spec/_results-index.json`, and the same under `demo/todo/`

- [ ] **Step 1: Import both harvests into their data homes** (no `SPECBOARD_HOME` override — the real home)

```bash
unset SPECBOARD_HOME
node tools/store-import.mjs
(cd demo/todo && node tools/store-import.mjs)
ls ~/.specboard/
```

Expected: two project dirs (this repo's fallback id `claude-plugin-spec-<8hex>`; demo/todo's is its manifest id if Task 4's scaffold has run — otherwise `todo-<8hex>`; give demo/todo an `id` by adding `"id": "tsumiki-<6hex>"` to `demo/todo/spec/_specboard.json` BEFORE importing, so the home is named for the project), each with `index.json`, `blobs/`, and no `missing` lines beyond what `git status` already shows as deleted.

- [ ] **Step 2: Ignore, then untrack**

Append to `.gitignore`:

```
# DERIVED — decision A (the human, 2026-09-05): the harvest, the fold, the run log and the generated
# board live in ~/.specboard/<project>/, never in git. Only the authored spec is committed.
board.html
spec/_results.json
spec/_results-index.json
spec/_runs.json
spec/_runs/
spec/*/evidence/
spec/*/viz/
spec/*/screen.png
spec/*/crawl.png
```

In `demo/todo/.gitignore`: replace the paragraph that says evidence + the index are committed ("since 0.25.1 evidence is committed by default …") with the same eight lines and a one-line reason.

Then:

```bash
git rm -r --cached --quiet board.html spec/_results.json spec/_results-index.json spec/_runs.json $(git ls-files | grep -E '^spec/[^_][^/]*/(evidence|viz)/|^spec/[^_][^/]*/screen\.png$')
(cd demo/todo && git rm -r --cached --quiet $(git ls-files | grep -E '/(evidence|viz)/|screen\.png$|board\.html$|_results(-index)?\.json$|_runs\.json$'))
git status --short | grep -c '^D'
```

Expected: about 938 + 189 deletions staged. Nothing else staged (another session shares this checkout — check `git status --short | grep -v '^D'` shows only the two `.gitignore`s and the plan's own files).

- [ ] **Step 3: Delete the working copies of the derived tree and rebuild from the store**

```bash
rm -rf spec/*/evidence spec/*/viz demo/todo/spec/*/evidence demo/todo/spec/*/viz
rm -f board.html demo/todo/board.html spec/_results.json spec/_results-index.json spec/_runs.json
npm run board:build && ls -la board.html
```

Expected: `board.html` rebuilt from `~/.specboard/<id>/index.json`; open `http://localhost:4173` (the human's live board self-restarts on `spec-store.mjs`; if not, `lsof -ti :4173` and relaunch `npm run board`) and confirm a beat row shows its Expected and Actual. **Show it:** screenshot one beat row of `board` R1 into the scratchpad and attach it to the commit message body as a path.

- [ ] **Step 4: Full suite + both gates, on a free port**

```bash
BOARD_PORT=4199 npm run e2e
```

Wait for the fold. Then `npm run proof mirror && npm run proof lint && npm run test:tools`.
Expected: green. A failure here is either a landing this plan broke (fix in the task that owns it) or a test that pinned the old paths (rule 4 — decide, then fix the side that is wrong).

- [ ] **Step 5: Correct CLAUDE.md in place**

In the Architecture block, the `spec/<screen>/evidence/` line becomes:

```
~/.specboard/<projectId>/       THE DATA HOME (decision A, 2026-09-05; tools/store.mjs): index.json (the fold),
                             runs.json, results.json, runs/<id>/ (records), blobs/<sha256>.<ext> (every frame,
                             replica, skeleton, font, video — content-addressed, gc'd by reference at the fold),
                             viz/<screen>/*.svg (the sketches). NOTHING derived is committed anywhere any more;
                             spec/<screen>/evidence/ and spec/<screen>/viz/ no longer exist.
```

Replace `spec/_results-index.json` and `spec/<screen>/viz/*.svg` lines accordingly, and rewrite **THE LAYOUT RULE** paragraph: the folder is `specboard/` inside the app repo and is **committed, authored files only** (prd, test, steps, narration, `_conflict-decisions.json`, `_specboard.json`; `_config.json` stays ignored — a sign-in script may carry a credential); the vendored code is ignored inside the folder; the harvest lives in the data home. Attach the reason and the date: the human's 2026-09-05 rule ("only store things in codebase if it's necessary") and the flow page. Keep the history of the 2026-09-04 rulings in one sentence, superseded.

- [ ] **Step 6: Commit**

```bash
git add .gitignore demo/todo/.gitignore demo/todo/spec/_specboard.json CLAUDE.md
git commit -m "chore(storage): stop tracking the harvest, the fold, the run log and board.html — imported into ~/.specboard; decision A (2026-09-05)"
```

(The staged `D` entries from Step 2 ride in this commit.)

---

## Phase 3 — scaffold, update, skills; dojostack migrates

### Task 12: the skeleton's lists — vendored code ignored inside the folder, the folder itself committed

**Files:**
- Modify: `tools/_skeleton.mjs:12-140` (`FILES`, `SPEC_IGNORE`, `boardIgnoreLines`)
- Modify: `tools/scaffold.mjs:63-86`
- Test: `tools/skeleton-ignore.test.mjs`, `tools/sidecar.test.mjs`

**Interfaces:**
- Produces: `FILES` includes `'tools/store.mjs'`, `'tools/store-import.mjs'`, `'tools/static-allow.mjs'`; `SPEC_IGNORE` = the transient set + `'_results.json', '_results-index.json', '_runs.json', '*/evidence/', '*/viz/', '*/screen.png'` and **without** `'_conflict-decisions.json'`; `boardIgnoreLines()` = `['node_modules/', 'test-results/', 'spec/.auth/', '.DS_Store', 'board.html', 'package-lock.json', ...FILES.map(f => '/' + f), '# specboard update scratch', ...ROOT_IGNORE]`.

- [ ] **Step 1: Write the failing tests**

In `tools/skeleton-ignore.test.mjs` (read it; it pins `SPEC_IGNORE`) replace the pin that says evidence is NOT ignored with:

```js
test('the derived files are ignored inside spec/ and the human’s decisions are not', () => {
  for (const p of ['_results.json', '_results-index.json', '_runs.json', '_runs/', '*/evidence/', '*/viz/', '*/screen.png', '_config.json', '_auth-state.json']) {
    assert.ok(SPEC_IGNORE.includes(p), p)
  }
  assert.equal(SPEC_IGNORE.includes('_conflict-decisions.json'), false)
})
```

In `tools/sidecar.test.mjs`, the `boardIgnoreLines` pin becomes:

```js
test('the board folder ignores its vendored code and generated files, so a committed folder holds authored files only', () => {
  const lines = boardIgnoreLines()
  for (const f of FILES) assert.ok(lines.includes('/' + f), f)
  for (const p of ['node_modules/', 'test-results/', 'board.html', 'spec/.auth/']) assert.ok(lines.includes(p), p)
  assert.equal(lines.includes('/specboard/'), false)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tools/skeleton-ignore.test.mjs tools/sidecar.test.mjs`
Expected: FAIL on the new pins

- [ ] **Step 3: Implement**

`tools/_skeleton.mjs`: add the three files to `FILES` (with a one-line reason each, in the file's own style); set

```js
// What a scaffolded project's git must NOT track (decision A, 2026-09-05): the transient run state
// AND every derived file — the harvest and the fold now live in ~/.specboard/<id>/ and the two
// pictures tests still write here are regenerated by any run. NOT _specboard.json (the release and
// the project's id), NOT _conflict-decisions.json (the human's rulings are authored). _config.json
// stays out: it is per machine and its sign-in script may carry a credential.
export const SPEC_IGNORE = [
  '_state-snapshot.*.json', '_dir-snapshot.*.json', '_run-report.json', '_runs/',
  '_conflicts.json', '_config.json', '_crawl.json', 'crawl.png', '_auth-state.json',
  '_results.json', '_results-index.json', '_runs.json', '*/evidence/', '*/viz/', '*/screen.png'
]
export function boardIgnoreLines () {
  return ['node_modules/', 'test-results/', 'spec/.auth/', '.DS_Store', 'board.html', 'package-lock.json',
    ...FILES.map(f => '/' + f), '# specboard update scratch', ...ROOT_IGNORE]
}
```

Rewrite the `NESTED` comment: the folder is committed, authored files only; the app's `.gitignore` is NOT touched by the scaffold any more.

`tools/scaffold.mjs`: delete the `if (NESTED_HERE) appendIgnore(join(APP, '.gitignore'), ['/' + NESTED + '/'], …)` line; keep the folder's own `.gitignore` append (now with the vendored code in it) and the `spec/.gitignore` write. Add, after the ignores, a printed line: `if (NESTED_HERE) console.log('specboard/ is meant to be COMMITTED (authored files only — its .gitignore keeps the vendored code out); if your .gitignore has a "/specboard/" line from an earlier release, remove it')`.

- [ ] **Step 4: Verify**

Run: `node --test tools/skeleton-ignore.test.mjs tools/sidecar.test.mjs tools/update.test.mjs` → passing.
Run a scaffold into a temp app: `d=$(mktemp -d); git -C $d init -q; node tools/scaffold.mjs $d >/dev/null; cat $d/specboard/.gitignore | head -12; grep -c specboard $d/.gitignore || true; cat $d/specboard/spec/_specboard.json | head -4`
Expected: the folder's ignore lists `/tools/spec-store.mjs` etc.; the app's `.gitignore` has no `/specboard/` line; the manifest has an `id`.

- [ ] **Step 5: Commit**

```bash
git add tools/_skeleton.mjs tools/scaffold.mjs tools/skeleton-ignore.test.mjs tools/sidecar.test.mjs
git commit -m "feat(scaffold): specboard/ is committed, authored files only — the vendored code and every derived file are ignored inside it"
```

---

### Task 13: the skills and the docs say the new rule, with the reason

**Files:**
- Modify: `skills/kg-staff/SKILL.md:8-14`, `skills/kg-deep/SKILL.md:8-14`, `skills/kg-e2e/SKILL.md:8-14`, `skills/kg-update/SKILL.md:8-14`, `skills/kg-init/SKILL.md` (its layout paragraph — grep `specboard/`)
- Modify: `docs/storage-paths-2026-09-05.html` §7 (decisions) — add the ruling
- Modify: the memory file `specboard-sidecar-layout.md` and `storage-design-open-2026-09-05.md` (the human's memory dir)

- [ ] **Step 1: Replace the "Where the board lives" note in all five skills with**

```markdown
> **Where the board lives.** THE RULE (the human, 2026-09-05 — "we only store things in codebase if
> it's necessary, otherwise find a way to store somewhere else"): a project's board is the folder
> **`specboard/` inside the app repo, COMMITTED, authored files only** — `spec/<screen>/prd.md`,
> `test.spec.ts`, `steps.ts`, `narration.json`, `spec/_conflict-decisions.json`, `spec/_specboard.json`.
> The vendored `tools/`, `board.html` and `node_modules` sit in the same folder but its own `.gitignore`
> keeps them out; `spec/_config.json` stays out too (per machine; its sign-in script may carry a
> credential). **Everything a run derives lives in `~/.specboard/<project id>/`** — the fold
> (`index.json`), the run log, the run records and every frame, replica, skeleton, font and video as
> `blobs/<sha256>.<ext>`, gc'd by reference at each fold. Nothing derived is ever committed. From the app
> repo, **`cd specboard`** for every command below. (Supersedes the 2026-09-04 whole-folder ignore.)
```

- [ ] **Step 2: The storage doc** — append to §7 of `docs/storage-paths-2026-09-05.html`:

```html
<div class="dec"><b>Ruled 2026-09-05 (later the same day):</b> D1 yes, with a refinement — authored files in the app repo, <span class="k">_config.json</span> stays ignored; D2 deferred until a team asks (the database arrives with the team store, Postgres, not SQLite on a laptop — <span class="k">storage-userflow-2026-09-05.html</span> §4 option A); D3 untouched. Implemented by <span class="k">docs/superpowers/plans/2026-09-05-storage-data-home.md</span>.</div>
```

- [ ] **Step 3: Memory** — rewrite `specboard-sidecar-layout.md`'s body to the new rule (keep the history in one sentence), and `storage-design-open-2026-09-05.md` to "decided: A; plan at …; done through task N" (update the task number as tasks land).

- [ ] **Step 4: Commit**

```bash
git add skills/*/SKILL.md docs/storage-paths-2026-09-05.html
git commit -m "docs(skills): the board folder is committed, authored only; the harvest lives in ~/.specboard — rule corrected in place with the reason"
```

---

### Task 14: release 0.45.0; demo/todo re-vendors; dojostack migrates

**Files:**
- Modify: `.claude-plugin/plugin.json` (`version`)
- Run: `demo/todo` `npm run setup`; dojostack `node <plugin>/tools/update.mjs ~/workspace/dojostack/dojostack_main`

- [ ] **Step 1: Bump and push the plugin**

```bash
sed -i '' 's/"version": "0.44.2"/"version": "0.45.0"/' .claude-plugin/plugin.json
npm run test:tools
git add .claude-plugin/plugin.json && git commit -m "release: 0.45.0 — the data home" && git push
```

- [ ] **Step 2: demo/todo**

```bash
(cd demo/todo && npm run setup && node tools/store-import.mjs && BOARD_PORT=4198 npm run e2e)
```

Wait for the fold; `git -C demo/todo status --short` shows only the manifest hash changes and the re-vendored ignore; commit them:

```bash
git add demo/todo/spec/_specboard.json demo/todo/.gitignore demo/todo/spec/.gitignore
git commit -m "chore(demo): tsumiki on 0.45.0 — harvest in its data home" && git push
```

Restart the demo board if it is up (`lsof -ti :4175`, kill by pid, relaunch detached).

- [ ] **Step 3: dojostack** (the human's app repo; commit locally, do NOT push — their CI and their branch)

```bash
cd ~/workspace/dojostack/dojostack_main
node ~/workspace/claude-plugin-spec/tools/update.mjs .        # lands in specboard/ (resolveProject)
cd specboard
node tools/store-import.mjs                                     # 99 MB of harvest → ~/.specboard/<id>/
```

Expected: the import prints new blobs and zero or few missing paths. Then:

```bash
# the folder's own ignore now lists the vendored code (update.mjs merges boardIgnoreLines — if it left a .gitignore.new, merge by hand: keep every line of the new one)
cd ~/workspace/dojostack/dojostack_main
sed -i '' '/^# specboard lives here/d; /^\/specboard\/$/d' .gitignore
git add .gitignore specboard/.gitignore specboard/spec/.gitignore specboard/spec/_specboard.json 'specboard/spec/*/prd.md' 'specboard/spec/*/test.spec.ts' 'specboard/spec/*/steps.ts' 'specboard/spec/*/narration.json' specboard/spec/_conflict-decisions.json specboard/package.json
git status --short | grep -v '^A' | head       # nothing derived may appear: no evidence/, no viz/, no board.html, no tools/
git commit -m "specboard: the board's authored files, committed (specboard 0.45.0, decision A 2026-09-05); harvest lives in ~/.specboard"
launchctl kickstart -k gui/$(id -u)/com.dojostack.specboard
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4174/
```

Expected: `git status` clean of anything derived; the board answers 200 and a beat row shows its pictures. **Show it:** screenshot one dojostack beat row.

- [ ] **Step 4: Record**

Update the memory files (`specboard-sidecar-layout.md`: dojostack committed the folder on this date; `dojostack-chain-testing.md`: framework 0.45.0).

---

## Phase 4 — step 5 of the flow: CI

### Task 15: CI keeps the runner's harvest as an artifact; the project gets a CI template

**Files:**
- Modify: `.github/workflows/e2e.yml`
- Create: `templates/specboard-ci.yml`; add `'templates/specboard-ci.yml'` to `FILES` so a scaffolded project receives it (as `specboard/templates/specboard-ci.yml`, to copy into the app's `.github/workflows/` by hand — the scaffold never writes into a user's `.github/`)
- Test: `tools/skeleton-ignore.test.mjs` (the FILES pin, if one exists) / `tools/update.test.mjs` (every-relative-import-vendored guard is unaffected; a yml has no imports)

- [ ] **Step 1: `.github/workflows/e2e.yml`** — after the two gates, replace the failure-only upload with:

```yaml
      # THE HARVEST IS A CI ARTIFACT, never a commit (decision A, 2026-09-05). The fold and every
      # blob the run landed live in the runner's data home; keep them 14 days so a PR's pictures can
      # be opened (download, then `SPECBOARD_HOME=<dir> npm run board`). A team that wants the board
      # without downloading is the team-store step, not this one.
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: specboard-harvest
          path: ~/.specboard/
          retention-days: 14
          if-no-files-found: warn
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: test-results/
          retention-days: 7
```

- [ ] **Step 2: `templates/specboard-ci.yml`** — the same job shape for a scaffolded project, with `working-directory: specboard` on every `run:`, `node-version: 20`, `npm ci`, `npx playwright install --with-deps chromium`, `npx playwright test --config=playwright.board.ts $(node tools/ci-select.mjs)`, `npm run proof mirror`, `npm run proof lint`, and the two uploads above. Head comment: how to enable it (copy to `.github/workflows/specboard.yml`; set `BOARD_URL` to the preview URL as a repository variable; choose the screens in `specboard/spec/_ci.json`).

- [ ] **Step 3: Verify**

Run: `npm run test:tools` → green. Push a branch and open a PR to see the `e2e-gate` job upload `specboard-harvest`; download it once and confirm `index.json` is inside. (Read the job's log; do not merge on a red job.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/e2e.yml templates/specboard-ci.yml tools/_skeleton.mjs
git commit -m "ci: the harvest is an artifact of the run, 14 days; a scaffolded project gets the same workflow as a template" && git push
```

---

### Task 16: retire `storage.where = git` — run shots on a branch is the anti-pattern this plan removes

**Files:**
- Modify: `tools/spec-store.mjs:716-761` (`DEFAULT_CONFIG.storage`, `cleanConfig`)
- Modify: `tools/serve-board.mjs:25,823-827` (the `shipToGit` branch and import)
- Modify: `tools/ship-record.mjs` (delete `shipToGit`; keep `shipToBucket`)
- Modify: `tools/board/client.js:4099-4130,4205-4215` (the Setup storage control: `setStore`, `initgitbranch`, `push`)
- Test: `tools/config.test.mjs`
- Read first: `spec/init/prd.md` and `spec/init/test.spec.ts` — if a requirement names the git option, the wording is the human's (rule 5): stop and ask before this task; the code change waits with it.

**Interfaces:**
- Produces: `cleanConfig` clamps `storage.where` to `['local', 'bucket']`, keeps `bucketUrl`, drops `gitBranch` and `push` from the written object.

- [ ] **Step 1: Write the failing test** (append to `tools/config.test.mjs`)

```js
test('storage has two homes, local and bucket — a git branch is not one (decision A, 2026-09-05)', () => {
  const c = cleanConfig({ storage: { where: 'git', gitBranch: 'shots', push: true, bucketUrl: '' } }, {})
  assert.equal(c.storage.where, 'local')
  assert.equal('gitBranch' in c.storage, false)
  assert.equal('push' in c.storage, false)
  assert.equal(cleanConfig({ storage: { where: 'bucket', bucketUrl: 'https://b' } }, {}).storage.where, 'bucket')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tools/config.test.mjs`
Expected: FAIL — `where` is `'git'`, `gitBranch` present

- [ ] **Step 3: Implement**

`tools/spec-store.mjs`: `storage: { where: 'local', bucketUrl: '' }` in `DEFAULT_CONFIG` (comment: `'local'` = the data home; `'bucket'` = a base URL uploads are PUT to — the team store's first half); in `cleanConfig`:

```js
    storage: {
      where: ['local', 'bucket'].includes(src.storage?.where) ? src.storage.where : 'local',
      bucketUrl: str(src.storage?.bucketUrl, 400).trim()
    }
```

`tools/serve-board.mjs`: delete the `if (store.where === 'git' …) { archive = { where: 'git', ...shipToGit(…) } } else` head so the bucket branch stands alone; import only `shipToBucket`.
`tools/ship-record.mjs`: delete `shipToGit` and the `git` helper; rewrite the head comment (one destination now, the bucket; the branch went with decision A — a run record is a cache and git keeps forever).
`tools/board/client.js`: remove the git radio/option and the `initgitbranch`/push fields from the Setup storage control and from the payload it saves; `node --check tools/board/client.js`. If `tools/build-board.mjs` emits the matching markup (grep `initgitbranch`), remove it there too and rebuild (`npm run board:build` must pass the `new Function()` guard).

- [ ] **Step 4: Verify**

Run: `node --test tools/config.test.mjs` → passing. `BOARD_PORT=4199 npx playwright test --config=playwright.board.ts spec/init/test.spec.ts` → green (if a Setup test asserts the git option, see "Read first" above — that is the human's call, not a test to edit).

- [ ] **Step 5: Commit**

```bash
git add tools/spec-store.mjs tools/serve-board.mjs tools/ship-record.mjs tools/board/client.js tools/build-board.mjs tools/config.test.mjs
git commit -m "chore(storage): retire the git-branch shipper — local or bucket, nothing in git"
```

---

## Self-review (done while writing)

- **Spec coverage.** Flow page §3 tree: authored committed (Tasks 11–14), data home with index/blobs/runs (1–10), viz out of the repo (9), `storage.where = git` removed (16), CI (15).
- **Placeholder scan.** Task 7's Step 3 describes edits by pattern against a 260-line function rather than reprinting it; the worker must read `harvestEvidence` in full first. Task 11 Step 5's CLAUDE.md text is given.
- **Type consistency.** `momentsOf` gains `phase` in Task 5 Step 3's note; Task 9 uses `m.layout`/`m.replica` only. `resolveRel` returns `string|null` everywhere. `harvestEvidence(harvest, ranAt)` keeps its signature. `RUNDIR` is exported from spec-store from Task 5 on and imported by serve-board in Task 8 and the reporter in Task 7.
- **Scope.** One plan, one subsystem (where derived files live). The team store, the database and the history rewrite are explicitly out.
