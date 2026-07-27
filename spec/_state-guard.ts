import { readdirSync, existsSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs'
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
const TOOL_STATE = ['_conflicts.json', '_conflict-decisions.json']

const files = () => [
  ...readdirSync(SPEC)
    .filter(n => !n.startsWith('_') && statSync(join(SPEC, n)).isDirectory())
    .map(n => join(SPEC, n, 'state.json')),
  ...TOOL_STATE.map(n => join(SPEC, n))
]

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
}

export async function restoreState () {
  if (!existsSync(SNAPSHOT)) return
  const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
  for (const [f, body] of Object.entries(snap)) {
    if (body === null) { if (existsSync(f)) rmSync(f) } else writeFileSync(f, body as string)
  }
  // remove it, don't blank it — a leftover snapshot is a file the next run has to know to ignore
  rmSync(SNAPSHOT)
}

export default saveState
