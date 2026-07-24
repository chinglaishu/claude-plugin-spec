---
slug: kg-core
title: Graph core — discovery, parsing, ids
lens: workflow
domain: dev-tooling
status: current
governs:
  - src/discover.ts
  - src/buildGraph.ts
  - src/ids.ts
  - src/config.ts
  - src/parseDoc.ts
  - src/parseFeatures.ts
  - src/parseCases.ts
  - src/parseCache.ts
  - src/parseUnitTests.ts
  - src/parseConfig.ts
  - src/deriveTags.ts
  - src/untrackedE2e.ts
  - src/artifacts.ts
  - src/topology.fixture.ts
requirements:
  - id: REQ-KG-02
    text: A new e2e spec cannot land without a linked case entry carrying at least
      one of verifies/covers/tags — a bare, untracked Playwright test is
      flagged, not silently ignored.
    covers:
      - main:tools/knowledge-graph/src/untrackedE2e.test.ts
  - id: REQ-KG-06
    text: A system-design doc's markdown sections are classified deterministically
      (requirement / decision / open-question / knowledge) from content alone,
      so the viewer can navigate and tag them without any hand-authored
      per-section metadata.
    covers:
      - main:tools/knowledge-graph/src/parseDoc.test.ts
  - id: REQ-KG-07
    text: A doc is identified by its frontmatter `slug` when it declares one,
      falling back to `id` and then the filename — so a corpus that carries a
      catalog id (SD-nn) alongside a human slug stays cross-referenceable by the
      name its siblings actually cite.
    covers:
      - main:tools/knowledge-graph/src/parseDoc.test.ts
  - id: REQ-KG-CORE-01
    text: A bare cross-reference resolves only when exactly one namespaced id shares
      its slug (auto-resolved); a slug matching two or more nodes is
      ambiguous-link and one matching zero is broken-link, and only node-target
      edges are link-validated (code-path edges like governs or exercises are
      never broken-link).
    covers:
      - main:tools/knowledge-graph/src/buildGraph.test.ts
  - id: REQ-KG-CORE-02
    text: Every path-bearing node id is namespaced repo:bare with repo classified
      purely by path prefix (dojostack_backend to backend, dojostack_frontend to
      frontend, else main), and auto-generated requirement ids embed the
      namespaced feature id, so the same authored id in two repos can never
      collide.
    covers:
      - main:tools/knowledge-graph/src/repo.test.ts
      - main:tools/knowledge-graph/src/parseFeatures.test.ts
      - main:tools/knowledge-graph/src/parseConfig.test.ts
  - id: REQ-KG-CORE-03
    text: A unit test's feature membership is derived by glob-matching its path
      against registered feature paths — a file under no feature derives none;
      e2e tests are never glob-derived (they carry explicit features), and a
      features.yaml registry emits zero tag edges of its own.
    covers:
      - main:tools/knowledge-graph/src/deriveTags.test.ts
      - main:tools/knowledge-graph/src/parseFeatures.test.ts
  - id: REQ-KG-CORE-04
    text: Each discovered source file is routed to exactly one parser by path
      pattern (else ignored), and only files matching the unit-test globs
      (including the tool's own src tests) are unit-test candidates — a non-test
      file in a matched directory is never indexed, keeping the graph bounded.
    covers:
      - main:tools/knowledge-graph/src/discover.test.ts
  - id: REQ-KG-CORE-05
    text: A requirement is proven only via an inbound covers edge or a provenBy slug
      resolving to a real test node (else uncovered-requirement); a doc is
      unverified-doc unless a test verifies it or every requirement it specifies
      is independently proven — the self-proven escape can never launder a doc
      with zero or any unproven requirement.
    covers:
      - main:tools/knowledge-graph/src/buildGraph.test.ts
---

## Why this exists

How a tree becomes a graph: which file goes to which parser, how ids are namespaced, and what counts as proven.

Split out of the monolithic tool PRD on 2026-07-24 (CEO). One doc governing all of `src/` meant the
agent-context pack returned every requirement for every file — too noisy to act on, and noise is what
gets a briefing ignored. Requirement text moved verbatim; only which doc owns it changed.

Parent: [[knowledge-graph-tool]]
