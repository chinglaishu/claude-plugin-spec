// tools/store-db-sqlite.mjs — THE DEFAULT DB DRIVER: one `board.db` file in the project's data home
// (the final shape, 2026-09-06: "like Langfuse hosted locally"). better-sqlite3 is synchronous, but
// every method here returns a promise anyway — the interface is the pg driver's interface, so the
// switch from a solo board to a team's shared database is a manifest field and nothing else.
//
// The module is loaded LAZILY by tools/store.mjs (a dynamic import inside the factory) so that the
// pure half of the store — path math, blob addresses, the reference walk — stays importable on a
// machine where the native module was never built.
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export async function openSqlite ({ file }) {
  if (!file) throw new Error('openSqlite: no database file')
  let Database
  try {
    ({ default: Database } = await import('better-sqlite3'))
  } catch (err) {
    throw new Error(`the sqlite driver needs better-sqlite3 (npm install): ${err && err.message}`)
  }
  mkdirSync(dirname(file), { recursive: true })
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return {
    kind: 'sqlite',
    file,
    async exec (sql) { db.exec(sql) },
    async run (sql, params = []) { db.prepare(sql).run(params); return true },
    async all (sql, params = []) { return db.prepare(sql).all(params) },
    async get (sql, params = []) { return db.prepare(sql).get(params) || null },
    async close () { db.close() }
  }
}
