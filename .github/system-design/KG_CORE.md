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
  - src/types.ts
requirements:
  - id: REQ-KG-02
    text: A new e2e spec cannot land without a linked case entry carrying at least
      one of verifies/covers/tags — a bare, untracked Playwright test is
      flagged, not silently ignored.
    covers:
      - main:src/untrackedE2e.test.ts
  - id: REQ-KG-06
    text: A system-design doc's markdown sections are classified deterministically
      (requirement / decision / open-question / knowledge) from content alone,
      so the viewer can navigate and tag them without any hand-authored
      per-section metadata.
    covers:
      - main:src/parseDoc.test.ts
  - id: REQ-KG-07
    text: A doc is identified by its frontmatter `slug` when it declares one,
      falling back to `id` and then the filename — so a corpus that carries a
      catalog id (SD-nn) alongside a human slug stays cross-referenceable by the
      name its siblings actually cite.
    covers:
      - main:src/parseDoc.test.ts
  - id: REQ-KG-CORE-01
    text: A bare cross-reference resolves only when exactly one namespaced id shares
      its slug (auto-resolved); a slug matching two or more nodes is
      ambiguous-link and one matching zero is broken-link, and only node-target
      edges are link-validated (code-path edges like governs or exercises are
      never broken-link).
    covers:
      - main:src/buildGraph.test.ts
  - id: REQ-KG-CORE-02
    text: Every path-bearing node id is namespaced repo:bare, with the repo decided
      solely by the project's declared topology — the longest declared subdir
      matching on a path boundary wins, and the repo declared at the workspace
      root is the fallback — and auto-generated requirement ids embed the
      namespaced feature id, so the same authored id in two repos can never
      collide.
    # Rewritten 2026-07-24 (CEO): the text still described a fixed table of three
    # named repo directories, which REQ-0 deleted from the code well before the PRD
    # split moved this requirement here verbatim. The code and config.test.ts had
    # derived the namespace from `repos[].subdir` since phase 2; only the sentence
    # describing them was stale. Conforming the doc to the code is normally how a
    # requirement quietly becomes false — here the code was already what the CEO
    # had approved, and the doc was the copy nobody re-read.
    # `repo.test.ts` did not move with the port — it was RETIRED by REQ-0, which collapsed repo.ts
    # into config.ts. Its successor is config.test.ts, which tests the same `repoOf`/`nsId` and
    # already declares `covers: REQ-KG-CORE-02` itself.
    covers:
      - main:src/config.test.ts
      - main:src/parseFeatures.test.ts
      - main:src/parseConfig.test.ts
  - id: REQ-KG-CORE-03
    text: A unit test's feature membership is derived by glob-matching its path
      against registered feature paths — a file under no feature derives none;
      e2e tests are never glob-derived (they carry explicit features), and a
      features.yaml registry emits zero tag edges of its own.
    covers:
      - main:src/deriveTags.test.ts
      - main:src/parseFeatures.test.ts
  - id: REQ-KG-CORE-04
    text: Each discovered source file is routed to exactly one parser by path
      pattern (else ignored), and only files matching the unit-test globs
      (including the tool's own src tests) are unit-test candidates — a non-test
      file in a matched directory is never indexed, keeping the graph bounded.
    covers:
      - main:src/discover.test.ts
  - id: REQ-KG-CORE-05
    text: A requirement is proven only via an inbound covers edge or a provenBy slug
      resolving to a real test node (else uncovered-requirement); a doc is
      unverified-doc unless a test verifies it or every requirement it specifies
      is independently proven — the self-proven escape can never launder a doc
      with zero or any unproven requirement.
    covers:
      - main:src/buildGraph.test.ts
  # Added 2026-07-24 (CEO). Found by wiring the S3 read route: REQ-KG-SERVE-02 cited four proofs of
  # which three named files the port had moved years-equivalent ago, and the graph said nothing —
  # 48 of this repo's own 49 cited paths were dead. An edge's target was validated from the start
  # (REQ-KG-CORE-01) while a requirement's cited proof never was.
  - id: REQ-KG-CORE-06
    text: Every proof a requirement cites must resolve to a real test node; one that
      resolves to nothing, or to a node that is not a test, is reported as
      broken-proof rather than silently discarded — and is reported per citation
      even when a sibling citation proves the requirement, because a dead path
      masked by a live one is how a stale claim survives a rename.
    covers:
      - main:src/buildGraph.test.ts
  - id: REQ-KG-CORE-07
    text: A doc with status draft is a proposal, so neither it nor the requirements
      only it specifies are counted by the ratchet as unverified or uncovered —
      a proposal has claimed nothing and so cannot have failed to prove
      anything. A requirement any non-draft doc also specifies stays counted,
      and a draft nobody links to is still an orphan.
    covers:
      - main:src/buildGraph.test.ts
    # Added 2026-07-24 (CEO) after dogfooding `kg-draft-spec` on this repo. Drafting one spec raised
    # `uncovered-requirement` by four and `unverified-doc` by one, while `check --update-baseline`
    # only ever LOWERS — so there was no sanctioned way to accept the rise, and the product's own
    # recommended first move on an unspecced repo left the gate permanently red. The only escapes
    # were deleting the draft or refreshing a baseline, and the second is the one move this project
    # never makes. Promotion to `current` is what makes a promise countable.
---

## Why this exists

How a tree becomes a graph: which file goes to which parser, how ids are namespaced, and what counts as proven.

Split out of the monolithic tool PRD on 2026-07-24 (CEO). One doc governing all of `src/` meant the
agent-context pack returned every requirement for every file — too noisy to act on, and noise is what
gets a briefing ignored. Requirement text moved verbatim; only which doc owns it changed.

Parent: [[knowledge-graph-tool]]
