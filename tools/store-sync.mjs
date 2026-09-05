// tools/store-sync.mjs — THE STORE, READ SYNCHRONOUSLY (the local db only).
//
// Everything that WRITES the store is async and driver-agnostic (tools/store.mjs): the fold, the run
// record, the raw report. Everything that READS it for a page — build-board's `allScreens()`, the
// server's every request, the gates — is synchronous top to bottom and has been since before there
// was a store, so making the read path async would ripple through the builder, the server and every
// pure reader beneath them for no gain a local board can feel.
//
// better-sqlite3 IS synchronous, so the default driver can answer synchronously without pretending:
// this opens the same `board.db` READ-ONLY and runs the same SELECTs, mapping rows through the same
// pure `screenFromRows`/`evidenceRow` the async store uses. One shape, two transports.
//
// A REMOTE db (pg) has no synchronous door at all. It THROWS here, naming the async one, rather than
// falling back to a local file it would then render as if it were the team's record (rule 3, and the
// same "never a silent local fallback" rule the store's header states). Rendering a board from a
// remote db is the hosted step (T13), not this one.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { screenFromRows, evidenceRow } from './store.mjs'

export const isRemoteDb = manifest => {
  const mode = String((manifest && manifest.db) || 'local').toLowerCase()
  return mode === 'remote' || mode === 'pg'
}

// { screens: [screen…], evidence: [row…], runs: [record…] } — or null when this project has no
// store yet (a fresh checkout that has never folded reads as an empty board, never as a crash).
export function readStoreSync (home, { manifest = null } = {}) {
  if (isRemoteDb(manifest)) {
    throw new Error('this board reads a REMOTE database (spec/_specboard.json db: "remote"), which has no synchronous door — use the async store (tools/store.mjs openStore)')
  }
  const file = join(String(home || ''), 'board.db')
  if (!home || !existsSync(file)) return null
  let Database
  try {
    Database = require('better-sqlite3')
  } catch (err) {
    throw new Error(`the sqlite driver needs better-sqlite3 (npm install): ${err && err.message}`)
  }
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    const all = (sql) => { try { return db.prepare(sql).all() } catch { return [] } }
    const tests = all('SELECT * FROM tests ORDER BY screen, seq, title')
    const cov = all('SELECT * FROM coverage')
    const byScreen = (rows) => {
      const m = new Map()
      for (const r of rows) { if (!m.has(r.screen)) m.set(r.screen, []); m.get(r.screen).push(r) }
      return m
    }
    const t = byScreen(tests)
    const c = byScreen(cov)
    const screens = all('SELECT * FROM screens ORDER BY screen')
      .map(row => screenFromRows(row, t.get(row.screen) || [], c.get(row.screen) || []))
      .filter(Boolean)
    const evidence = all('SELECT * FROM evidence ORDER BY screen, req_id, test_file').map(evidenceRow)
    const runs = all('SELECT record FROM runs ORDER BY at DESC, run_id DESC')
      .map(r => { try { return JSON.parse(r.record) } catch { return null } })
      .filter(Boolean)
    return { screens, evidence, runs }
  } finally {
    db.close()
  }
}

// better-sqlite3 is CommonJS and this module is ESM; `createRequire` is the one synchronous way in.
// (`await import()` would make every caller async — the whole point of this module is that they are
// not.) Kept at the bottom so the pure exports above read first.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
