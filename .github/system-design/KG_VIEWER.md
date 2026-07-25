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
      - main:src/viewer.test.ts
  - id: REQ-KG-VIEW-02
    text: The delta reports, versus the previously committed graph, nodes added and
      removed grouped and sorted by type, test pass and fail transitions only
      for ids present in both graphs, and only the issue kinds whose count
      changed; the first sync yields no delta.
    covers:
      - main:src/delta.test.ts
  - id: REQ-KG-VIEW-03
    text: digest/ is derived purely from the graph as exactly one markdown file per
      flow plus an index, each requirement shown as proven only when a
      covers-edge test or a provenBy slug resolves to a real test node,
      otherwise flagged as having no covering test.
    covers:
      - main:src/digest.test.ts
      - main:src/summarize.test.ts
  - id: REQ-KG-VIEW-04
    text: A flow's health lastVerified is the oldest runAt among its tagged e2e
      tests (worst-case honesty, not the newest), and a test tagged into
      features of more than one flow is counted once in the health totals.
    covers:
      - main:src/summarize.test.ts
  - id: REQ-KG-VIEW-05
    text: Every untrusted string the viewer renders — a test's error output and an
      AI-authored suggested fix among them — is escaped as text and never
      injected as markup, so markup arriving from a test run or a model cannot
      become live DOM in the reader's browser.
    covers:
      - main:VIEW-1
      - main:VIEW-2
      - main:VIEW-3
    # NEEDS CEO RATIFICATION. The invariant is real and already implemented — the viewer's client JS
    # routes these strings through esc() — and the two browser specs asserting it were written before
    # this repo could run them. What did not exist was any requirement stating it, so the specs proved
    # a promise no document made. Wording is mine and reversible; the behaviour is not new.
---

## Why this exists

What the graph renders as, and what changed since the last sync.

Split out of the monolithic tool PRD on 2026-07-24 (CEO). One doc governing all of `src/` meant the
agent-context pack returned every requirement for every file — too noisy to act on, and noise is what
gets a briefing ignored. Requirement text moved verbatim; only which doc owns it changed.

Parent: [[knowledge-graph-tool]]
