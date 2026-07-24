---
slug: kg-serve
title: Serve, routes and live updates
lens: workflow
domain: dev-tooling
status: current
governs:
  - src/serve.ts
  - src/serveArtifacts.ts
  - src/serveLock.ts
  - src/liveHub.ts
  - src/pathGuard.ts
  - src/toggleStar.ts
requirements:
  - id: REQ-KG-SERVE-01
    text: The /api/live SSE hub coalesces a burst of graph-rebuild notifications
      into exactly one debounced graph-updated broadcast, delivers it only to
      still-connected clients, keepalives idle ones, and evicts any client on
      socket close or a throwing write — one rebuild yields one re-fetch and no
      client leaks.
    covers:
      - main:src/liveHub.test.ts
  - id: REQ-KG-SERVE-02
    text: Every read-only serve route (/registry, /src, /run-artifacts, /shots,
      /evidence) confines each read within its designated root — a directory for
      the four that read files, the configured bucket prefix for /evidence,
      which resolves object keys rather than paths — rejecting raw and
      URL-encoded traversal, backslashes, absolute or drive-letter paths,
      dotfiles, .local. credential files, and non-allowlisted extensions with a
      404. A request the guard rejects is never signed.
    covers:
      - main:src/pathGuard.test.ts
      - main:src/serveProvenance.test.ts
      - main:src/serveRunArtifact.test.ts
      - main:src/serveEvidence.test.ts
  - id: REQ-KG-SERVE-03
    text: /api/graph returns the current graph read fresh from disk on every request
      (a rewrite is served on the next fetch) and 404s a missing file.
    covers:
      - main:src/serveGraph.test.ts
  - id: REQ-KG-SERVE-04
    text: Star curation writes back only the targeted feature entry —
      depth-anchored, idempotent, never matching a prefix or substring sibling
      or a nested star key, and throws on an unknown id.
    covers:
      - main:src/toggleStar.test.ts
  - id: REQ-KG-SERVE-05
    text: The serve spawn-lock enforces single-owner server management — a lock held
      by a live process yields contended (no double-spawn), a stale, dead-owner,
      or corrupt lock is atomically reclaimed with the wx flag, and release only
      removes the caller's own lock.
    covers:
      - main:src/serveLock.test.ts
  - id: REQ-KG-SERVE-06
    text: A run client disconnect is detected via the ServerResponse close event
      (not the request) and tree-kills the spawned run, guarded by an exited
      flag so normal completion never fires a kill.
    covers:
      - main:src/serverDisconnect.test.ts
---

## Why this exists

Read-only routes confined to their roots, an SSE hub that coalesces rebuilds, and single-owner spawn locking.

Split out of the monolithic tool PRD on 2026-07-24 (CEO). One doc governing all of `src/` meant the
agent-context pack returned every requirement for every file — too noisy to act on, and noise is what
gets a briefing ignored. Requirement text moved verbatim; only which doc owns it changed.

Parent: [[knowledge-graph-tool]]
