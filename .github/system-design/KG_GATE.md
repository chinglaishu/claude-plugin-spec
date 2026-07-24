---
slug: kg-gate
title: The drift gate
lens: workflow
domain: dev-tooling
status: current
governs:
  - src/check.ts
  - src/sources.ts
requirements:
  - id: REQ-KG-01
    text: The committed graph always matches a rebuild from source — nothing in
      knowledge-graph.json, viewer.html, report.md, or digest/ can drift from
      what a fresh build produces.
    covers:
      - main:src/check.test.ts
  - id: REQ-KG-04
    text: "`check` is the strict gate: any issue kind whose count rises above its
      frozen baseline fails the build, even by one — a regression cannot be
      waved through."
    covers:
      - main:src/check.test.ts
  - id: REQ-KG-GATE-01
    text: Every path that writes the graph also stamps
      `knowledge-graph.sources.json` with the exact sibling-repo commits it was
      built from, and warns — without blocking — on a pin CI could not fetch, so
      the inner loop stays usable while the lockfile never silently disagrees
      with the graph beside it.
    covers:
      - main:src/sources.test.ts
  - id: REQ-KG-GATE-02
    text: "`check --pinned` refuses to certify a graph unless the sibling checkouts
      sit exactly at the lockfile's commits, and a missing or malformed lockfile
      is refused rather than guessed at — so a `fresh ✓` verdict always means
      reproducible-from-pins, never merely that the graph happened to match one
      machine's checkout."
    covers:
      - main:src/sources.test.ts
---

## Why this exists

The gate blocks; report-only is decoration. Freshness, the ratchet, and the pins a graph was built from.

Split out of the monolithic tool PRD on 2026-07-24 (CEO). One doc governing all of `src/` meant the
agent-context pack returned every requirement for every file — too noisy to act on, and noise is what
gets a briefing ignored. Requirement text moved verbatim; only which doc owns it changed.

Parent: [[knowledge-graph-tool]]
