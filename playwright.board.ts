import { defineConfig } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { buildAuthProjects } from './tools/auth-projects.mjs'
// WHERE THE RAW JSON REPORT GOES (the data home, 2026-09-05/06). Nothing derived is written into the
// repo any more: Playwright's json reporter can only write a file, so it writes this scratch inside
// the project's data home and spec/_results-reporter.mjs files it as a `reports` row in `onExit` —
// after every reporter has finished — then removes it. A board-started run still points BOARD_RESULTS
// at its own record dir, so a scoped run and the suite can never overwrite each other's report.
import { RESULTS_SCRATCH } from './tools/spec-store.mjs'

// Tests live NEXT TO the screen they prove — spec/<screen>/test.spec.ts — because that is the
// only arrangement where a screen with no test is visibly a screen with no test. A central
// tests/ directory lets coverage rot silently; here the gap is a hole in the row.
//
// Each spec writes spec/<screen>/screen.png. That is deliberate: column 3 of the board is a
// BYPRODUCT of column 4, never a separate capture step. A screenshot that no test produced is a
// picture of something nobody checked.

// WHERE TO POINT THE TESTS. A project usually already has a dev server running on a port it
// chose, and starting a second one is how you end up testing a stale copy on the wrong port.
//   BOARD_URL   — drive an ALREADY-RUNNING site; nothing is started or stopped for you
//   BOARD_PORT  — same board server, different port (default 4173)
// With BOARD_URL set we deliberately do not manage the server at all: something you did not
// start is something you must not kill.
const PORT = process.env.BOARD_PORT || process.env.PORT || '4173'
const EXTERNAL = process.env.BOARD_URL
const baseURL = EXTERNAL || `http://localhost:${PORT}`

// AUTH, only when the target needs it. Document-mode tests hit the REAL app, which is usually behind
// a login. When spec/_config.json carries a signIn script, split the run into a 'setup' project that
// signs in once and saves the session, and a 'screens' project that reuses it — so every test starts
// authenticated. With NO signIn (specboard's own suite, or any unauthenticated target) there are no
// projects and the suite runs as a single default one, exactly as before — this must stay invisible
// to the no-auth case, which is why it is a spread, not an always-on projects list.
//
// A target with a fixture only a SECOND account can reach (an isolated org, an admin area) declares
// that login as a named `authProfiles` entry in _config.json (name + signIn + the screen dirs it
// owns). buildAuthProjects then gives that account its own setup+screens pair, so it too signs in ONCE
// and its screens reuse the session instead of re-logging-in inside every test's beforeEach. The
// mapping is a pure, unit-tested function (tools/auth-projects.test.mjs).
const cfg = (() => {
  try {
    const p = './spec/_config.json'
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}
  } catch { return {} }
})()
const authProjects = buildAuthProjects(String(cfg.signIn || '').trim(), cfg.authProfiles)

export default defineConfig({
  testDir: './spec',
  testMatch: '*/test.spec.ts',
  // Real apps are data-heavy: a list waits on an API, a chart on a query. Playwright's default 5s
  // expect timeout is too tight for that and shows up as the worst kind of flake — green alone, red
  // in the suite. Give assertions room, and the whole test a generous ceiling, so a slow-but-correct
  // screen is not failed for being slow. (specboard's own specs are fast; this only bounds the wait.)
  expect: { timeout: 15000 },
  timeout: 60000,
  // Present only when the target has a signIn. Each `setup` project authenticates one account and
  // saves its session; each `screens` project reuses the matching session. Setup runs the login at
  // full speed (slowMo:0) — it is plumbing, not a scene to watch. Absent any signIn this key is gone
  // and the default single project runs. See buildAuthProjects (tools/auth-projects.mjs) for the exact
  // routing, including the second-account `authProfiles` case.
  ...(authProjects ? { projects: authProjects } : {}),
  // Your approvals are not test fixtures. The specs drive real gates, so they write real state —
  // snapshot it before and restore it after, or running the suite quietly approves screens you
  // never reviewed and the board starts lying about exactly what it exists to be honest about.
  globalSetup: './spec/_state-guard.ts',
  globalTeardown: './spec/_state-guard-teardown.ts',
  // ONE worker, not just serial-within-a-file. Every spec drives the same server and the same
  // spec/*/state.json on disk, so approving in one file while another asserts the board's counts
  // is a race — and it showed up exactly as you would fear: green alone, red in the suite.
  fullyParallel: false,
  workers: 1,
  // Three reporters. The JSON report is for humans and debugging; a board-started run points it at
  // its own file so a scoped run does not clobber the suite's. The custom reporter folds each run's
  // results into spec/_results-index.json — the per-screen source of truth the board reads, where a
  // scoped run updates one screen and leaves the rest standing. It must be a reporter, not a
  // teardown: Playwright writes the JSON file only after globalTeardown.
  reporter: [
    ['json', { outputFile: process.env.BOARD_RESULTS || RESULTS_SCRATCH }],
    ['list'],
    ['./spec/_results-reporter.mjs']
  ],
  // When the BOARD starts a run it asks for a record of it: every screenshot and video Playwright
  // captures goes into that run's own scratch directory inside the data home (~/.specboard/<id>/runs/
  // <runId>/), and what the run KEEPS lands as blobs at the fold. Off for a plain `npm run e2e`,
  // because recording every local run is a lot of disk for something nobody asked to see.
  outputDir: process.env.BOARD_RECORD || 'test-results',
  use: {
    baseURL,
    // Screenshots feed gate B, where the question is "did this change on purpose". Animation and
    // a moving caret both change pixels without anything changing, so both are pinned off.
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    screenshot: process.env.BOARD_RECORD ? 'on' : 'off',
    // Record at the app's REAL size — a bare `video: 'on'` downscales the recording to ~800px wide,
    // which turns a data-dense screen (a chart over a rent-roll grid) into an illegible thumbnail
    // (board R10). Pin the video size to the viewport so the frame shows what is being proven. The
    // narration topbar (spec/_base.ts) is burned into these frames, so they must be readable.
    video: process.env.BOARD_RECORD ? { mode: 'on', size: { width: 1440, height: 900 } } : 'off',
    // A watchable run pauses between actions so a person can follow along — the board sets
    // BOARD_SLOWMO from the Setup page's "time between steps". Zero (or unset) on a normal run,
    // because slowing a headless suite down helps no one.
    launchOptions: { slowMo: Number(process.env.BOARD_SLOWMO) || 0 }
  },
  ...(EXTERNAL ? {} : {
    webServer: {
      command: `node tools/serve-board.mjs`,
      // BOARD_PORT is the one port knob everywhere; the server reads it (falling back to PORT)
      env: { BOARD_PORT: PORT },
      url: baseURL,
      // reuse whatever is already listening — the common case is that you left npm run board up
      reuseExistingServer: true,
      timeout: 20000
    }
  })
})
