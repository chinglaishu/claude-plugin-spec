import { defineConfig } from '@playwright/test'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Fixture config for tools/prove-input.test.mjs — a real browser, one worker, no board server, no
// custom reporter, no state guard: the mechanism under test is only what spec/_base.ts's
// proveVisible READS off an element. Artifacts go to the system tmpdir so a run never litters the
// repo. (Same shape as tools/base-aggregate-fixture/.)
export default defineConfig({
  testDir: '.',
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  reporter: [['list']],
  outputDir: join(tmpdir(), 'sb-prove-input-out')
})
