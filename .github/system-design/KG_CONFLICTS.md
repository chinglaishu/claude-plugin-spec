---
slug: kg-conflicts
title: Conflict scan and adjudication
lens: workflow
domain: dev-tooling
status: current
governs:
  - src/conflictCandidates.ts
  - src/codeCandidates.ts
  - src/conflictDecisions.ts
  - src/conflictFixPlan.ts
  - src/conflictId.ts
  - src/conflictModel.ts
  - src/conflictScanContext.ts
  - src/parseConflicts.ts
  - src/scanContext.ts
  - src/fixPlan.ts
requirements:
  - id: REQ-KG-CONF-01
    text: A conflict finding models one subject with at least two participants
      grouped into at least two positions (camps); a finding failing that
      cluster invariant is rejected, and the binary case is simply N=2 with no
      special-casing.
    covers:
      - main:src/conflictModel.test.ts
  - id: REQ-KG-CONF-02
    text: The scan's comparison surface is always enumerated, never free-hunted.
      Doc-anchored pairs come from the graph's own edges (references for
      doc-doc, governs for doc-code, covers for requirement-test), and
      code-to-code pairs come from a shared declared-symbol index over the
      project's source files, bounded to symbols declared in at least two files
      and in few enough files to be distinctive. Two files sharing no declared
      symbol never become a candidate pair, and a repo carrying no docs at all
      still yields a bounded surface.
    covers:
      - main:src/conflictCandidates.test.ts
      - main:src/codeCandidates.test.ts
    # Widened 2026-07-24 (CEO). The edge-only surface was precise and, on the customer this product is
    # for — code and an AI agent, nothing else — always empty: no docs means no `governs:`, no
    # requirements and no registries, so zero pairs. Meanwhile `kg-init` step 4 promised contradictions
    # found with no docs at all. Two sources disagreed; the CEO chose the promise. The bound moved from
    # "an edge exists" to "a declared symbol is shared" — still a handed-over list, still deterministic,
    # and the code index is scan-only so it cannot move the graph, the fingerprint or the ratchet.
  - id: REQ-KG-CONF-04
    text: graph.conflicts is a viewer-only payload deduped by content id and sorted,
      adding no nodes, edges, or issues (zero ratchet impact), so the same
      source findings always fold to byte-identical output.
    covers:
      - main:src/parseConflicts.test.ts
      - main:src/conflictsBuild.test.ts
  - id: REQ-KG-CONF-05
    text: A finding's identity is a stable hash of subject plus scope, so a re-scan
      of the same subject in the same scope yields the same id — the basis for
      dismissals and resolutions surviving a re-scan.
    covers:
      - main:src/conflictId.test.ts
  - id: REQ-KG-CONF-03
    text: Contradiction adjudication runs out-of-platform (the kg-scan-conflicts
      skill); the viewer template and the serve process never call an AI SDK or
      invoke a model.
    covers:
      - main:src/noAiInViewerServe.test.ts
  - id: REQ-KG-CONF-06
    text: Resolving a finding is choosing one canonical position; every
      non-canonical participant is then a target for a fix, a dissenting doc as
      a text edit and dissenting code via TDD plus the code-review gate, and
      only resolved findings produce a fix plan.
    covers:
      - main:src/conflictFixPlan.test.ts
---

## Why this exists

One subject, two or more positions, each quoting its source. The decision inbox lives or dies on precision.

Split out of the monolithic tool PRD on 2026-07-24 (CEO). One doc governing all of `src/` meant the
agent-context pack returned every requirement for every file — too noisy to act on, and noise is what
gets a briefing ignored. Requirement text moved verbatim; only which doc owns it changed.

Parent: [[knowledge-graph-tool]]
