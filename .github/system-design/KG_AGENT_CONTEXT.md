---
slug: kg-agent-context
title: Agent context — the briefing before an edit
lens: workflow
domain: dev-tooling
status: current
governs:
  - src/agentContext.ts
  - src/agentContextCli.ts
  - src/ungovernedBaseline.ts
  - src/ungovernedBaselineCli.ts
requirements:
  - id: REQ-KG-CTX-01
    text: Given any file path in a project, the agent-context pack lists that path's
      governing docs, the requirements they specify, the tests covering those
      requirements, and any conflicts touching them — resolved from the
      project's own graph and config, knowing nothing about any particular
      project's layout. When nothing governs the path, the pack halts rather
      than warning.
    covers:
      - main:src/agentContext.test.ts
---

## Why this exists

The gold (founding design §5): a perfect graph nobody consults is an expensive lint. This is what makes it consulted.

Split out of the monolithic tool PRD on 2026-07-24 (CEO). One doc governing all of `src/` meant the
agent-context pack returned every requirement for every file — too noisy to act on, and noise is what
gets a briefing ignored. Requirement text moved verbatim; only which doc owns it changed.

Parent: [[knowledge-graph-tool]]
