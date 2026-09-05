// tools/store.mjs — THE DATA HOME AND THE STORE (the human, 2026-09-05: "we only store things in
// codebase if it's necessary, otherwise find a way to store somewhere else"; the final shape,
// 2026-09-06, in three rulings: "like Langfuse hosted locally", "media local-but-out-of-repo or a
// cloud blob url", "test records into local db / remote db — team = remote db url + cloud blob url").
//
// Everything a run DERIVES — frames, replicas, skeletons, fonts, videos, the fold, the run log, the
// raw report — lives OUTSIDE every repository, in `~/.specboard/<projectId>/` (claude-mem's home-dir
// pattern; `SPECBOARD_HOME` overrides it for tests, CI and review). The authored files — prd.md,
// test.spec.ts, steps.ts — stay in the app repo, because the coding agent reads them in the checkout
// and CI runs the test from it.
//
// TWO SWITCHES, ONE INTERFACE. Both are committed manifest fields, so a team agrees once:
//   db:    "local"  → sqlite  (board.db in the data home, the default)   | "remote" → pg  (SPECBOARD_DB_URL)
//   media: "local"  → fs      (blobs/<sha256>.<ext>, served at /blob/…)  | "cloud"  → s3  (the same
//                                                                          sha-named object in a bucket)
// Turning a solo board into a team's shared record is those two values and no rewrite. Which is why
// EVERY door here is async from day one even though the local drivers could be synchronous: the pg
// and s3 drivers fit behind the same signatures. (The pure address math — dataHome, blobName,
// isBlobSrc, blobPath, referencedBlobs — stays synchronous: it is arithmetic on strings, has no
// driver behind it, and is used as path math by callers that are not themselves async.)
//
// A remote mode whose credentials are missing THROWS. It never falls back to the local disk: a silent
// fallback forks the team's record in two and calls it success (rule 3).
//
// ─── THE SCHEMA ───────────────────────────────────────────────────────────────────────────────────
// Close to the shape of the old `spec/_results-index.json`, with ONE change of key: per the human's
// C2 ruling (2026-09-06) EVIDENCE IS KEYED BY THE COVERING TEST, not by the requirement. That is what
// retires the I5 collision — `spec/init`'s flow tags `board:R1`, and when it ran alone it overwrote
// the board's own harvest of that beat. Now the flow's harvest and the home screen's are two rows.
//
//   meta(k, v)                                   — schemaVersion, projectId, createdAt
//   screens(screen PK, total, failed, ran_at,    — one row per screen's fold entry
//           src_hashes JSON, proven_hashes JSON, extra JSON)
//   tests(screen, title PK, seq, file, ok, ms,   — the run's per-test result, as the fold recorded it,
//         error, line)                             `seq` keeping the order the fold handed them in
//   coverage(screen, title, req_id PK, verdict)  — the many-to-many tag fold: pass | fail | not-reached
//   evidence(test_file, screen, req_id PK,       — C2: the TEST owns its harvest of a requirement.
//            test_title, run_id, at, entry JSON)   `screen` is the requirement's HOME screen, so a
//                                                   flow in another file is a second row, never a
//                                                   replacement. `entry` is the beat/value/claim tree
//                                                   exactly as the reader reads it, its picture fields
//                                                   holding srcs (blob rel or url).
//   runs(run_id PK, at, screen, ms, total,       — the run log; `record` is the whole run object
//        failed, ok, record JSON)                  (shotsByTest, steps, logs) — append-only in practice
//   reports(run_id PK, at, report JSON)          — the raw Playwright report of that run
//
// Deep structure stays JSON (beats, claims, steps — the reader wants the tree, and no query slices
// into it); what IS queried gets a real column: screen, test file, requirement id, run id, verdict.
//
// GC BY REFERENCE, WITH NO REFCOUNT TABLE. `referencedBlobs` walks the retained records themselves
// and collects every src; `gcBlobs` deletes every stored blob nothing names. A refs table would be a
// second answer that can drift from the first — the whole point of a content address is that the
// records ARE the refcount (tools/store.test.mjs proves a shared blob survives one owner's pruning).
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { dataHome, dataHomeRoot, projectId, sha256, blobName, blobPath, isBlobRel, isBlobSrc } from './store-address.mjs'
import { openSqlite } from './store-db-sqlite.mjs'
import { openPg } from './store-db-pg.mjs'
import { openFsBlobs } from './store-blob-fs.mjs'
import { openS3Blobs } from './store-blob-s3.mjs'

export { dataHome, dataHomeRoot, projectId, sha256, blobName, blobPath, isBlobRel, isBlobSrc }

export const SCHEMA_VERSION = 1

export const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
  `CREATE TABLE IF NOT EXISTS screens (
     screen TEXT PRIMARY KEY,
     total INTEGER, failed INTEGER, ran_at INTEGER,
     src_hashes TEXT, proven_hashes TEXT, extra TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS tests (
     screen TEXT NOT NULL, title TEXT NOT NULL, seq INTEGER,
     file TEXT, ok INTEGER, ms INTEGER, error TEXT, line INTEGER,
     PRIMARY KEY (screen, title)
   )`,
  `CREATE TABLE IF NOT EXISTS coverage (
     screen TEXT NOT NULL, title TEXT NOT NULL, req_id TEXT NOT NULL, verdict TEXT NOT NULL,
     PRIMARY KEY (screen, title, req_id)
   )`,
  'CREATE INDEX IF NOT EXISTS coverage_req ON coverage (req_id)',
  `CREATE TABLE IF NOT EXISTS evidence (
     test_file TEXT NOT NULL, screen TEXT NOT NULL, req_id TEXT NOT NULL,
     test_title TEXT, run_id TEXT, at TEXT, entry TEXT NOT NULL,
     PRIMARY KEY (test_file, screen, req_id)
   )`,
  'CREATE INDEX IF NOT EXISTS evidence_req ON evidence (screen, req_id)',
  'CREATE INDEX IF NOT EXISTS evidence_run ON evidence (run_id)',
  `CREATE TABLE IF NOT EXISTS runs (
     run_id TEXT PRIMARY KEY, at TEXT, screen TEXT,
     ms INTEGER, total INTEGER, failed INTEGER, ok INTEGER, record TEXT NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS runs_at ON runs (at)',
  'CREATE TABLE IF NOT EXISTS reports (run_id TEXT PRIMARY KEY, at TEXT, report TEXT NOT NULL)'
]

const TABLES = ['reports', 'runs', 'evidence', 'coverage', 'tests', 'screens', 'meta']

const json = v => (v == null ? null : JSON.stringify(v))
const unjson = (v, fallback = null) => { if (v == null) return fallback; try { return JSON.parse(v) } catch { return fallback } }
const bit = v => (v ? 1 : 0)

// ─── blobs, without a store ───────────────────────────────────────────────────────────────────────
// The same two drivers, reachable by anyone holding a data home: the reporter lands bytes this way
// before a store is open, and the gates read them back the same way.
export async function openBlobs ({ home, media = 'local', bucket = null, env = process.env, fetch = globalThis.fetch } = {}) {
  const mode = String(media || 'local').toLowerCase()
  if (mode === 'cloud' || mode === 's3') return openS3Blobs({ bucket, env, fetch })
  if (mode === 'local' || mode === 'fs') return openFsBlobs({ home })
  throw new Error(`unknown media mode: ${media}`)
}

export async function putBlob (home, bytes, ext, opts = {}) {
  return (await openBlobs({ home, ...opts })).put(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes), ext)
}

export async function getBlob (home, src, opts = {}) {
  return (await openBlobs({ home, ...opts })).get(src)
}

export async function removeBlob (home, src, opts = {}) {
  return (await openBlobs({ home, ...opts })).remove(src)
}

export async function listBlobs (home, opts = {}) {
  return (await openBlobs({ home, ...opts })).list()
}

// ─── the store ────────────────────────────────────────────────────────────────────────────────────
export async function openStore ({ root = process.cwd(), home = null, manifest = null, env = process.env, pool = null, fetch = globalThis.fetch } = {}) {
  const id = projectId(root, manifest)
  const HOME = home || dataHome(root, manifest, env, homedir())
  mkdirSync(HOME, { recursive: true })
  const dbMode = String((manifest && manifest.db) || 'local').toLowerCase()
  const db = dbMode === 'remote' || dbMode === 'pg'
    ? await openPg({ env, pool })
    : await openSqlite({ file: join(HOME, 'board.db') })
  const blobs = await openBlobs({ home: HOME, media: (manifest && manifest.media) || 'local', bucket: (manifest && manifest.bucket) || null, env, fetch })

  for (const ddl of SCHEMA) await db.exec(ddl)
  const setMeta = async (k, v) => db.run('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v', [k, String(v)])
  await setMeta('schemaVersion', SCHEMA_VERSION)
  await setMeta('projectId', id)
  const created = await db.get('SELECT v FROM meta WHERE k = ?', ['createdAt'])
  if (!created) await setMeta('createdAt', new Date().toISOString())

  const store = {
    home: HOME,
    projectId: id,
    dbDriver: db.kind,
    blobDriver: blobs.mode,

    // bytes
    async putBlob (bytes, ext) { return blobs.put(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes), ext) },
    async getBlob (src) { return blobs.get(src) },
    async removeBlob (src) { return blobs.remove(src) },
    async listBlobs () { return blobs.list() },

    // meta
    async getMeta (k) { const r = await db.get('SELECT v FROM meta WHERE k = ?', [k]); return r ? r.v : null },
    async setMeta (k, v) { await setMeta(k, v); return true },

    // the fold, per screen
    async putScreen (screen, entry) {
      const e = entry || {}
      const { total, failed, ranAt, srcHashes, provenHashes, tests, ...extra } = e
      await db.run(
        `INSERT INTO screens (screen, total, failed, ran_at, src_hashes, proven_hashes, extra)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (screen) DO UPDATE SET total = excluded.total, failed = excluded.failed,
           ran_at = excluded.ran_at, src_hashes = excluded.src_hashes,
           proven_hashes = excluded.proven_hashes, extra = excluded.extra`,
        [screen, total ?? null, failed ?? null, ranAt ?? null, json(srcHashes), json(provenHashes), json(Object.keys(extra).length ? extra : null)]
      )
      // a screen's tests are REPLACED by its own fold and by nothing else — another screen's run
      // never touches these rows (the per-screen run is a documented workflow, CLAUDE.md)
      await db.run('DELETE FROM coverage WHERE screen = ?', [screen])
      await db.run('DELETE FROM tests WHERE screen = ?', [screen])
      let seq = 0
      for (const t of (Array.isArray(tests) ? tests : [])) {
        if (!t || !t.title) continue
        await db.run('INSERT INTO tests (screen, title, seq, file, ok, ms, error, line) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [screen, t.title, seq++, t.file ?? null, bit(t.ok), t.ms ?? null, t.error ?? null, t.line ?? null])
        for (const [reqId, verdict] of Object.entries(t.reqs || {})) {
          await db.run('INSERT INTO coverage (screen, title, req_id, verdict) VALUES (?, ?, ?, ?)', [screen, t.title, reqId, String(verdict)])
        }
      }
      return true
    },
    async getScreen (screen) {
      const row = await db.get('SELECT * FROM screens WHERE screen = ?', [screen])
      if (!row) return null
      const tests = await db.all('SELECT * FROM tests WHERE screen = ? ORDER BY seq, title', [screen])
      const cov = await db.all('SELECT * FROM coverage WHERE screen = ?', [screen])
      const byTitle = new Map()
      for (const c of cov) {
        if (!byTitle.has(c.title)) byTitle.set(c.title, {})
        byTitle.get(c.title)[c.req_id] = c.verdict
      }
      return {
        screen,
        total: row.total,
        failed: row.failed,
        ranAt: row.ran_at,
        srcHashes: unjson(row.src_hashes),
        provenHashes: unjson(row.proven_hashes),
        ...(unjson(row.extra) || {}),
        tests: tests.map(t => ({ title: t.title, file: t.file, ok: !!t.ok, ms: t.ms, error: t.error, line: t.line, reqs: byTitle.get(t.title) || {} }))
      }
    },
    async listScreens () { return (await db.all('SELECT screen FROM screens ORDER BY screen', [])).map(r => r.screen) },
    async deleteScreen (screen) {
      await db.run('DELETE FROM coverage WHERE screen = ?', [screen])
      await db.run('DELETE FROM tests WHERE screen = ?', [screen])
      await db.run('DELETE FROM screens WHERE screen = ?', [screen])
      return true
    },

    // the harvest — keyed by the covering TEST (C2)
    async putEvidence ({ testFile, screen, reqId, testTitle = null, runId = null, at = null, entry = {} }) {
      if (!testFile || !screen || !reqId) throw new Error('putEvidence needs testFile, screen and reqId — evidence is keyed by the covering test (C2)')
      await db.run(
        `INSERT INTO evidence (test_file, screen, req_id, test_title, run_id, at, entry)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (test_file, screen, req_id) DO UPDATE SET test_title = excluded.test_title,
           run_id = excluded.run_id, at = excluded.at, entry = excluded.entry`,
        [testFile, screen, reqId, testTitle, runId, at, JSON.stringify(entry || {})]
      )
      return true
    },
    async getEvidence ({ testFile, screen, reqId }) {
      const r = await db.get('SELECT * FROM evidence WHERE test_file = ? AND screen = ? AND req_id = ?', [testFile, screen, reqId])
      return r ? evidenceRow(r) : null
    },
    async listEvidence (filter = {}) {
      const where = []
      const params = []
      if (filter.testFile) { where.push('test_file = ?'); params.push(filter.testFile) }
      if (filter.screen) { where.push('screen = ?'); params.push(filter.screen) }
      if (filter.reqId) { where.push('req_id = ?'); params.push(filter.reqId) }
      if (filter.runId) { where.push('run_id = ?'); params.push(filter.runId) }
      const sql = `SELECT * FROM evidence${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY screen, req_id, test_file`
      return (await db.all(sql, params)).map(evidenceRow)
    },
    async deleteEvidence ({ testFile, screen, reqId }) {
      await db.run('DELETE FROM evidence WHERE test_file = ? AND screen = ? AND req_id = ?', [testFile, screen, reqId])
      return true
    },

    // the run log and the raw report
    async putRun (run) {
      const r = run || {}
      if (!r.runId) throw new Error('putRun needs a runId')
      await db.run(
        `INSERT INTO runs (run_id, at, screen, ms, total, failed, ok, record)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (run_id) DO UPDATE SET at = excluded.at, screen = excluded.screen, ms = excluded.ms,
           total = excluded.total, failed = excluded.failed, ok = excluded.ok, record = excluded.record`,
        [String(r.runId), r.at ?? null, r.screen ?? null, r.ms ?? null, r.total ?? null, r.failed ?? null, bit(r.ok), JSON.stringify(r)]
      )
      return true
    },
    async getRun (runId) {
      const r = await db.get('SELECT record FROM runs WHERE run_id = ?', [String(runId)])
      return r ? unjson(r.record) : null
    },
    async listRuns ({ limit = 0 } = {}) {
      const rows = await db.all(`SELECT record FROM runs ORDER BY at DESC, run_id DESC${limit ? ` LIMIT ${Number(limit) | 0}` : ''}`, [])
      return rows.map(r => unjson(r.record)).filter(Boolean)
    },
    async deleteRun (runId) {
      await db.run('DELETE FROM reports WHERE run_id = ?', [String(runId)])
      await db.run('DELETE FROM runs WHERE run_id = ?', [String(runId)])
      return true
    },
    async putReport (runId, report, at = new Date().toISOString()) {
      await db.run(
        `INSERT INTO reports (run_id, at, report) VALUES (?, ?, ?)
         ON CONFLICT (run_id) DO UPDATE SET at = excluded.at, report = excluded.report`,
        [String(runId), at, JSON.stringify(report ?? null)]
      )
      return true
    },
    async getReport (runId) {
      const r = await db.get('SELECT report FROM reports WHERE run_id = ?', [String(runId)])
      return r ? unjson(r.report) : null
    },

    async dropAll () { for (const t of TABLES) await db.exec(`DROP TABLE IF EXISTS ${t}`) },
    async close () { await db.close(); await blobs.close() }
  }
  return store
}

function evidenceRow (r) {
  return { testFile: r.test_file, screen: r.screen, reqId: r.req_id, testTitle: r.test_title, runId: r.run_id, at: r.at, entry: unjson(r.entry, {}) }
}
