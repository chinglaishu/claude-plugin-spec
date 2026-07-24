---
slug: kg-evidence
title: Evidence and screenshots
lens: workflow
domain: dev-tooling
status: current
governs:
  - src/applyEvidence.ts
  - src/evidenceUrl.ts
  - src/shotsUpload.ts
  - src/shotsUploadHook.ts
  - src/blobStore.ts
requirements:
  - id: REQ-KG-05
    text: Run screenshots are stored outside the committed graph at exactly one
      declared destination — a project-supplied S3 bucket, the tool-managed
      GitHub evidence branch, or the local device when none is declared. The
      config names coordinates only and never a credential. Evidence is
      addressed by URL; screenshot binaries never enter the committed graph JSON
      or the working branch.
    covers:
      - main:src/applyEvidence.test.ts
  - id: REQ-KG-EVID-01
    text: A raw.githubusercontent.com evidence URL is deterministically rewritten
      into a GitHub Contents API URL with each path segment and the ref
      URL-encoded (slashes preserved); an already-API URL passes through, and
      any non-raw or malformed URL returns null so the viewer falls through to
      the local or placeholder tiers instead of firing an authenticated fetch at
      a bad target.
    covers:
      - main:tools/knowledge-graph/src/evidenceUrl.test.ts
  - id: REQ-KG-EVID-02
    text: Contents-API base64 content is stripped of GitHub's 60-char line wraps and
      shaped into a data:image/png;base64 URL (empty or non-string content
      becomes null), consumed only as an img src and never injected as HTML.
    covers:
      - main:tools/knowledge-graph/src/evidenceUrl.test.ts
  - id: REQ-KG-EVID-03
    text: The evidence index keys each case's shots map by the original bare
      screenshot filename (the exact string a step's screenshot carries),
      confining the remote ordinal prefix to the URL path, so the viewer's exact
      evidence-by-filename lookup resolves.
    covers:
      - main:tools/knowledge-graph/src/shotsUpload.test.ts
  - id: REQ-KG-EVID-04
    text: Ingesting the evidence index attaches the shot-URL map only onto e2e-kind
      nodes matched by case-insensitive bare id, never a non-e2e node on a
      bare-id collision; a missing or malformed index leaves the graph unchanged
      (deterministic).
    covers:
      - main:tools/knowledge-graph/src/applyEvidence.test.ts
---

## Why this exists

Screenshots live outside the committed graph at exactly one declared destination. Binaries never enter the graph.

Split out of the monolithic tool PRD on 2026-07-24 (CEO). One doc governing all of `src/` meant the
agent-context pack returned every requirement for every file — too noisy to act on, and noise is what
gets a briefing ignored. Requirement text moved verbatim; only which doc owns it changed.

Parent: [[knowledge-graph-tool]]
