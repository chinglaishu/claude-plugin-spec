// tools/store-db-pg.mjs — THE TEAM DB DRIVER: the same schema and the same statements as the sqlite
// one, issued against a Postgres the whole team shares (the final shape, 2026-09-06: "team = remote
// db url + cloud blob url"). Turning it on is two values and no rewrite — `db: "remote"` in the
// committed manifest, `SPECBOARD_DB_URL` in the environment, which carries a password and is
// therefore NEVER committed.
//
// It refuses to exist without that url (rule 3: a remote mode that quietly wrote to the local file
// would fork the team's record in silence). The pool is injectable so the SQL this driver issues can
// be unit-tested without a server — tools/store-remote.test.mjs drives it that way, and connects for
// real only when SPECBOARD_TEST_PG_URL names a database.

// The store writes ONE dialect of SQL, with `?` placeholders (sqlite's). Postgres wants $1, $2 — so
// the driver rewrites them, skipping anything inside a single-quoted string so a literal '?' in a
// value survives. Pure; unit-tested.
export function toPgPlaceholders (sql) {
  let out = ''
  let n = 0
  let inStr = false
  const s = String(sql || '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "'") { inStr = !inStr; out += c; continue }
    if (c === '?' && !inStr) { out += `$${++n}`; continue }
    out += c
  }
  return out
}

export async function openPg ({ url, env = process.env, pool = null } = {}) {
  const dsn = String(url || (env && env.SPECBOARD_DB_URL) || '').trim()
  if (!pool) {
    if (!dsn) throw new Error('db: "remote" needs SPECBOARD_DB_URL (a postgres:// url) — refusing to fall back to the local board.db')
    if (!/^postgres(ql)?:\/\//.test(dsn)) throw new Error(`SPECBOARD_DB_URL is not a postgres url: ${dsn.slice(0, 16)}…`)
  }
  let p = pool
  if (!p) {
    let pg
    try {
      pg = await import('pg')
    } catch (err) {
      throw new Error(`the pg driver needs the pg package (npm install): ${err && err.message}`)
    }
    const Pool = pg.default ? pg.default.Pool : pg.Pool
    p = new Pool({ connectionString: dsn })
  }
  const query = async (sql, params = []) => p.query(toPgPlaceholders(sql), params)
  return {
    kind: 'pg',
    url: dsn,
    async exec (sql) { await query(sql, []) },
    async run (sql, params = []) { await query(sql, params); return true },
    async all (sql, params = []) { return (await query(sql, params)).rows },
    async get (sql, params = []) { return (await query(sql, params)).rows[0] || null },
    async close () { if (p.end) await p.end() }
  }
}
