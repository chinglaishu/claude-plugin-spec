---
slug: kg-viewer
title: Viewer, digest and delta
lens: workflow
domain: dev-tooling
status: current
governs:
  - src/viewer.ts
  - src/digest.ts
  - src/delta.ts
  - src/summarize.ts
  - src/typeVisibility.ts
requirements:
  - id: REQ-KG-VIEW-01
    text: The since-last-sync delta is injected only at the real __KG_DELTA__
      template markers in the post-data tail — never at a marker string inside
      the inlined graph JSON — and a build passed no delta leaves the region
      null.
    covers:
      - main:tools/knowledge-graph/src/viewer.test.ts
  - id: REQ-KG-VIEW-02
    text: The delta reports, versus the previously committed graph, nodes added and
      removed grouped and sorted by type, test pass and fail transitions only
      for ids present in both graphs, and only the issue kinds whose count
      changed; the first sync yields no delta.
    covers:
      - main:tools/knowledge-graph/src/delta.test.ts
  - id: REQ-KG-VIEW-03
    text: digest/ is derived purely from the graph as exactly one markdown file per
      flow plus an index, each requirement shown as proven only when a
      covers-edge test or a provenBy slug resolves to a real test node,
      otherwise flagged as having no covering test.
    covers:
      - main:tools/knowledge-graph/src/digest.test.ts
      - main:tools/knowledge-graph/src/summarize.test.ts
  - id: REQ-KG-VIEW-04
    text: A flow's health lastVerified is the oldest runAt among its tagged e2e
      tests (worst-case honesty, not the newest), and a test tagged into
      features of more than one flow is counted once in the health totals.
    covers:
      - main:tools/knowledge-graph/src/summarize.test.ts
---

## Why this exists

What the graph renders as, and what changed since the last sync.

Split out of the monolithic tool PRD on 2026-07-24 (CEO). One doc governing all of `src/` meant the
agent-context pack returned every requirement for every file — too noisy to act on, and noise is what
gets a briefing ignored. Requirement text moved verbatim; only which doc owns it changed.

Parent: [[knowledge-graph-tool]]
