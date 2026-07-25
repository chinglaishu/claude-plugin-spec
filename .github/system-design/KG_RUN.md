---
slug: kg-run
title: Test runs and results
lens: workflow
domain: dev-tooling
status: current
governs:
  - src/runSchedule.ts
  - src/recordRun.ts
  - src/treeKill.ts
  - src/ensureOrchestrated.ts
  - src/selectCases.ts
  - src/resultsFile.ts
  - src/gateDecision.ts
  - src/parseResults.ts
  - src/parsePlaywrightReport.ts
  - src/syncResults.ts
  - src/resolvePlaywrightUrls.ts
  - src/resolveBackendVenvPython.ts
  - playwright.config.ts
requirements:
  - id: REQ-KG-03
    text: Test statuses in the graph come only from a recorded Playwright/pytest run
      (kg-test-results.json), never from hand-edited status fields — a test's
      status always traces back to an actual execution.
    covers:
      - main:src/parseResults.test.ts
      - main:src/resultsFile.test.ts
  - id: REQ-KG-RUN-01
    text: A scoped run (--flow or --case) upserts only the cases it executed into
      kg-test-results.json, leaving untouched cases' status, attempts, and at
      intact; a full run replaces the map.
    covers:
      - main:src/resultsFile.test.ts
      - main:src/lastRunPipeline.test.ts
  - id: REQ-KG-RUN-02
    text: Each result entry is stamped with the commit and timestamp of the run that
      produced it (per-entry), so a scoped re-record overwrites only its own
      entries' provenance and untouched or pre-schema entries keep — and never
      fabricate — their commit, at, and error.
    covers:
      - main:src/resultsFile.test.ts
      - main:src/lastRunPipeline.test.ts
  - id: REQ-KG-RUN-03
    text: Only cases explicitly marked parallelSafe true join the concurrency pool
      (bounded by a clamped, at-least-1 integer); every other case is
      serialized, with input order preserved in both lists.
    covers:
      - main:src/runSchedule.test.ts
  - id: REQ-KG-RUN-04
    text: A spawned Playwright run is terminated as a whole process tree (taskkill
      /T /F on Windows, SIGTERM on POSIX) so no orphaned worker or headed
      browser survives a cancelled or closed run.
    covers:
      - main:src/treeKill.test.ts
  - id: REQ-KG-RUN-05
    text: A run only spawns after a frontend and backend readiness gate — proceeding
      when healthy or when nothing is wedged, waiting within the timeout window,
      and giving up with an honest serverNotReady past the timeout, never a
      silent hang or a fabricated result.
    covers:
      - main:src/gateDecision.test.ts
---

## Why this exists

A status in the graph always traces back to an actual execution — never a hand-edited field.

Split out of the monolithic tool PRD on 2026-07-24 (CEO). One doc governing all of `src/` meant the
agent-context pack returned every requirement for every file — too noisy to act on, and noise is what
gets a briefing ignored. Requirement text moved verbatim; only which doc owns it changed.

Parent: [[knowledge-graph-tool]]
