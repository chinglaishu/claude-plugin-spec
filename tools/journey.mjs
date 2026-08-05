// The getting-started journey — DERIVED from the tree on every build, never stored.
// Pure derivation here (unit-tested); journey() gathers the three facts from spec-store.
//
// A rail is a MAP, not a turnstile: the current step is the first one whose fact does not hold
// yet, but a later step whose fact already holds still reads done. Nothing here is a status field
// — every step's done is read off the tree at build time, so it cannot drift from what is true.
import { existsSync } from 'node:fs'
import { CONFIG, readCrawl, allScreens } from './spec-store.mjs'

export function deriveJourney ({ configSaved, crawledAt, screens }) {
  const anyPrd = screens.length > 0
  const proven = screens.some(s => s.reqs.some(r => r.state === 'proven'))
  const steps = [
    { id: 'install', title: 'Install the board', fact: 'board is serving', done: true },
    { id: 'config', title: 'Point it at your app', fact: '_config.json saved', done: !!configSaved },
    { id: 'crawl', title: 'Inventory the app', fact: 'crawl ran, or rows exist', done: !!crawledAt || anyPrd },
    { id: 'deepen', title: 'Deepen one screen', fact: 'a prd.md exists', done: anyPrd, cmd: '/kg-deep <screen>' },
    { id: 'confirm', title: 'Confirm the draft', fact: 'a prd.md without guess', done: screens.some(s => !s.guess) },
    { id: 'prove', title: 'Watch the proof', fact: 'a requirement is proven', done: proven }
  ]
  const cur = steps.find(s => !s.done)
  if (cur) cur.current = true
  // Once anything is proven the loop has been round once — the rail folds to a chip and stops
  // taking room from the board it was only ever there to get you to.
  return { steps, folded: proven }
}

export const journey = () => deriveJourney({
  configSaved: existsSync(CONFIG),
  crawledAt: readCrawl().crawledAt,
  screens: allScreens()
})
