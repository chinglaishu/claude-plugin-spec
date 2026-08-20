import { defineConfig } from '@playwright/test'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Fixture config for tools/base-aggregate.test.mjs — real browser, one worker (like
// playwright.board.ts), but NO board server, NO custom reporter, NO state guard: the mechanism
// under test is only that spec/_base.ts's failure aggregate travels into a LATER-loaded spec file.
// Artifacts go to the system tmpdir so a run never litters the repo.
export default defineConfig({
  testDir: '.',
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  reporter: [['list']],
  outputDir: join(tmpdir(), 'sb-base-aggregate-out')
})
