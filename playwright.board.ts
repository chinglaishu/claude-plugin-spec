import { defineConfig } from '@playwright/test'

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
const PORT = process.env.BOARD_PORT || '4173'
const EXTERNAL = process.env.BOARD_URL
const baseURL = EXTERNAL || `http://localhost:${PORT}`

export default defineConfig({
  testDir: './spec',
  testMatch: '*/test.spec.ts',
  // Real apps are data-heavy: a list waits on an API, a chart on a query. Playwright's default 5s
  // expect timeout is too tight for that and shows up as the worst kind of flake — green alone, red
  // in the suite. Give assertions room, and the whole test a generous ceiling, so a slow-but-correct
  // screen is not failed for being slow. (specboard's own specs are fast; this only bounds the wait.)
  expect: { timeout: 15000 },
  timeout: 60000,
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
    ['json', { outputFile: process.env.BOARD_RESULTS || 'spec/_results.json' }],
    ['list'],
    ['./spec/_results-reporter.mjs']
  ],
  // When the BOARD starts a run it asks for a record of it: every screenshot and video Playwright
  // captures goes into that run's own directory under spec/_runs/<id>/, which the board then shows
  // back. Off for a plain `npm run e2e`, because recording every local run is a lot of disk for
  // something nobody asked to see.
  outputDir: process.env.BOARD_RECORD || 'test-results',
  use: {
    baseURL,
    // Screenshots feed gate B, where the question is "did this change on purpose". Animation and
    // a moving caret both change pixels without anything changing, so both are pinned off.
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    screenshot: process.env.BOARD_RECORD ? 'on' : 'off',
    video: process.env.BOARD_RECORD ? 'on' : 'off',
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
