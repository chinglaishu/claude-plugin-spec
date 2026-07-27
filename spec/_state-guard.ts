import { readdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The suite drives real gates, so it writes real approvals into spec/*/state.json — the same
// files your own decisions live in. Left alone, running the tests silently approves screens you
// never looked at, which would make the board lie about the one thing it exists to be honest
// about. Snapshot every state file before the run and put them all back afterwards.

const SPEC = dirname(fileURLToPath(import.meta.url))
const files = () => readdirSync(SPEC)
  .filter(n => !n.startsWith('_') && statSync(join(SPEC, n)).isDirectory())
  .map(n => join(SPEC, n, 'state.json'))

const SNAPSHOT = join(SPEC, '_state-snapshot.json')

export async function saveState () {
  const snap: Record<string, string> = {}
  for (const f of files()) if (existsSync(f)) snap[f] = readFileSync(f, 'utf8')
  writeFileSync(SNAPSHOT, JSON.stringify(snap))
}

export async function restoreState () {
  if (!existsSync(SNAPSHOT)) return
  const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
  for (const [f, body] of Object.entries(snap)) writeFileSync(f, body as string)
  writeFileSync(SNAPSHOT, '{}')
}

export default saveState
