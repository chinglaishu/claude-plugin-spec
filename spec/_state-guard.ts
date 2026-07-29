import { readdirSync, existsSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The suite drives real gates, so it writes real approvals into spec/*/state.json — the same
// files your own decisions live in. Left alone, running the tests silently approves screens you
// never looked at, which would make the board lie about the one thing it exists to be honest
// about. Snapshot every state file before the run and put them all back afterwards.

const SPEC = dirname(fileURLToPath(import.meta.url))

// The conflict files are the same kind of thing as an approval pin: a record of a decision a
// human made. The conflicts specs seed a known findings file and settle it, so without these two
// here a test run would wipe a real scan and leave behind a resolution nobody chose.
const TOOL_STATE = ['_conflicts.json', '_conflict-decisions.json', '_config.json', '_crawl.json']

const screenDirs = () => readdirSync(SPEC)
  .filter(n => !n.startsWith('_') && statSync(join(SPEC, n)).isDirectory())

const files = () => [
  ...screenDirs().map(n => join(SPEC, n, 'state.json')),
  ...TOOL_STATE.map(n => join(SPEC, n))
]

// The set of screens that existed before the run, so any row a crawl creates during it can be
// removed after. The init spec crawls the board's own server and materialises new rows; without
// this they survive the run and the board gains screens nobody wrote — the mirror image of the
// conflict-fixture leak, and just as much a lie about what the project contains.
const DIRSNAP = join(SPEC, `_dir-snapshot.${process.pid}.json`)

// PER PROCESS, not one shared file. The board can run the suite while a suite is already running
// — the dispatch spec drives a real sub-run through the panel to prove it streams — and two
// playwright processes sharing one snapshot file means the second one's setup overwrites the
// first one's saved state, so the first one restores garbage. setup and teardown run in the same
// runner process, so its pid names a file only it touches.
const SNAPSHOT = join(SPEC, `_state-snapshot.${process.pid}.json`)

// null means "this file did not exist", which has to be restorable too. The conflicts specs
// CREATE spec/_conflicts.json out of nothing; putting back only the files that were there leaves
// a hand-written fixture on disk looking exactly like a real scan result — a fake green in the
// one place the tool is supposed to be honest.
export async function saveState () {
  const snap: Record<string, string | null> = {}
  for (const f of files()) snap[f] = existsSync(f) ? readFileSync(f, 'utf8') : null
  writeFileSync(SNAPSHOT, JSON.stringify(snap))
  writeFileSync(DIRSNAP, JSON.stringify(screenDirs()))
}

export async function restoreState () {
  if (existsSync(DIRSNAP)) {
    const before = new Set(JSON.parse(readFileSync(DIRSNAP, 'utf8')))
    for (const n of screenDirs()) if (!before.has(n)) rmSync(join(SPEC, n), { recursive: true, force: true })
    rmSync(DIRSNAP)
  }
  if (!existsSync(SNAPSHOT)) return
  const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
  for (const [f, body] of Object.entries(snap)) {
    if (body === null) { if (existsSync(f)) rmSync(f) } else writeFileSync(f, body as string)
  }
  // remove it, don't blank it — a leftover snapshot is a file the next run has to know to ignore
  rmSync(SNAPSHOT)
}

// GOLDEN-DATA SEED HOOK. A data-driven screen can only assert EXACT values (this tile reads 12,340;
// this filter lists exactly these items) if the data is deterministic — so a project seeds a
// dedicated "golden" fixture once, before the suite, and asserts it thereafter. This runs that seed,
// and is a NO-OP for any project without one, so unauthenticated / no-golden-data targets — and
// specboard's own suite — are unaffected.
//
// Precedence, and WHY: a `seed:e2e` npm script wins over spec/_seed.ts. The scaffold vendors
// spec/_seed.ts as an inert stub into EVERY project, so "does _seed.ts exist" is always true; were the
// stub to take precedence, a project whose seed lives in another toolchain (a `seed:e2e` script
// calling a backend seeder, say) would be silently shadowed by the do-nothing stub. So: run the
// explicit script if the project declared one; otherwise run spec/_seed.ts (the stub, or the
// project's edit of it). A project uses exactly one of the two.
async function runSeed () {
  const root = join(SPEC, '..')
  let script = ''
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    script = String(pkg.scripts?.['seed:e2e'] || '').trim()
  } catch { /* no package.json, or unreadable — that is fine; fall through to _seed.ts */ }

  if (script) {
    // The project owns HOW its seed runs (node, tsx, a call into a backend seeder, another language);
    // we only trigger it. A failed seed must FAIL setup — a suite that asserts golden values against
    // an unseeded app is worse than an honest red at the gate.
    const r = spawnSync('npm', ['run', 'seed:e2e'], { cwd: root, stdio: 'inherit' })
    if (r.status !== 0) throw new Error(`seed:e2e exited ${r.status ?? r.signal} — golden data not seeded`)
    return
  }

  // spec/_seed.ts is TypeScript, so Playwright's own loader — already active in this process — is what
  // makes it runnable; a `node spec/_seed.ts` subprocess could not. Import it and call its default.
  if (existsSync(join(SPEC, '_seed.ts'))) {
    const mod: any = await import('./_seed.ts')
    const fn = mod?.default ?? mod?.seed
    if (typeof fn === 'function') await fn()
  }
}

// globalSetup: seed the golden data (if any), THEN snapshot the gate state. Seeding first means a
// broken seed fails the run before we bother snapshotting; the snapshot/restore is unaffected by the
// seed either way, because the seed touches the APP's own data store, never spec/*/state.json.
export default async function globalSetup () {
  await runSeed()
  await saveState()
}
