// covers: REQ-KG-06, REQ-KG-07
import { describe, it, expect } from "vitest";
import { REPOS } from "./topology.fixture";
import matter from "gray-matter";
import { parseDoc } from "./parseDoc";

const md = `---
id: house-view-freeze
title: House View Freeze
lens: state-machine
status: current
governs: [services/house_view/]
related: [assumption-hierarchy-ux]
requirements:
  - id: REQ-HV-FREEZE-01
    text: Resolves against a published version.
---
Body links to [[live-freshness-and-freeze]] here.`;

describe("parseDoc", () => {
  const { nodes, edges } = parseDoc({ path: "svc_backend/.github/system-design/00_platform/HOUSE_VIEW_FREEZE.md", content: md }, REPOS);

  it("creates a doc node with frontmatter", () => {
    const doc = nodes.find((n) => n.type === "doc")!;
    expect(doc.id).toBe("backend:house-view-freeze");
    expect(doc.lens).toBe("state-machine");
    expect(doc.path).toBe("svc_backend/.github/system-design/00_platform/HOUSE_VIEW_FREEZE.md");
  });
  it("creates a requirement node + specifies edge", () => {
    expect(nodes.find((n) => n.id === "REQ-HV-FREEZE-01")?.type).toBe("requirement");
    expect(edges).toContainEqual({ from: "backend:house-view-freeze", to: "REQ-HV-FREEZE-01", type: "specifies", source: "svc_backend/.github/system-design/00_platform/HOUSE_VIEW_FREEZE.md" });
  });
  it("emits references from related and [[wikilinks]]", () => {
    const refs = edges.filter((e) => e.type === "references").map((e) => e.to).sort();
    expect(refs).toEqual(["assumption-hierarchy-ux", "live-freshness-and-freeze"]);
  });
  it("emits governs edge", () => {
    expect(edges).toContainEqual({ from: "backend:house-view-freeze", to: "services/house_view/", type: "governs", source: "svc_backend/.github/system-design/00_platform/HOUSE_VIEW_FREEZE.md" });
  });
  it("inlines the markdown body (post-frontmatter) on the doc node", () => {
    const doc = nodes.find((n) => n.type === "doc")!;
    expect(doc.body).toBe("Body links to [[live-freshness-and-freeze]] here.");
  });
  it("leaves body undefined when the doc has only frontmatter (no body)", () => {
    const r = parseDoc({ path: "x/y.md", content: "---\nid: y\n---\n" }, REPOS);
    expect(r.nodes[0].body).toBeUndefined();
  });
  it("defaults id to slug(filename) when omitted", () => {
    const r = parseDoc({ path: "x/My Doc.md", content: "no frontmatter" }, REPOS);
    expect(r.nodes[0].id).toBe("main:my-doc");
  });

  it("namespaces the doc id by repo but leaves reference targets bare", () => {
    const r = parseDoc({
      path: "svc_backend/.github/system-design/00_platform/HOUSE_VIEW_FREEZE.md",
      content: "---\nid: house-view-freeze\nrelated: [assumption-hierarchy-ux]\n---\nbody",
    }, REPOS);
    expect(r.nodes[0].id).toBe("backend:house-view-freeze");
    const ref = r.edges.find((e) => e.type === "references");
    expect(ref).toMatchObject({ from: "backend:house-view-freeze", to: "assumption-hierarchy-ux" });
  });

  // The backend system-design corpus identifies a doc by TWO fields: a catalog `id:` (SD-nn) and a
  // human `slug:`, and every cross-doc `related:` reference targets the SLUG — no reference anywhere
  // uses SD-nn. Keying the node off `id:` therefore made all 7 slug-bearing docs unreachable:
  // `related: [house-view-freeze]` resolved to nothing while the node sat at `backend:SD-56`,
  // reported as broken-link "target 'house-view-freeze' is not a node".
  it("prefers the frontmatter slug over a catalog id, so slug references resolve", () => {
    const r = parseDoc({
      path: "svc_backend/.github/system-design/00_platform/HOUSE_VIEW_FREEZE_AND_VERSION_RESOLUTION.md",
      content: "---\nid: SD-56\nslug: house-view-freeze\ntitle: House View Freeze\n---\nbody",
    }, REPOS);
    expect(r.nodes[0].id).toBe("backend:house-view-freeze");
  });

  it("still falls back to the catalog id when no slug is declared", () => {
    const r = parseDoc({
      path: "svc_backend/.github/system-design/00_platform/NO_SLUG.md",
      content: "---\nid: SD-99\ntitle: No Slug\n---\nbody",
    }, REPOS);
    expect(r.nodes[0].id).toBe("backend:SD-99");
  });
});

// Contract 4 — doc section metadata (frozen in 2026-07-05-kg-viewer-ux-runinfra-design.md §2).
// Deterministic per-heading classification: requirement (mentions REQ-…) / decision
// (mentions Decision needed|DECISION:|Locked decision) / open-question (heading or text
// matches Open Question|OQ-\d+) / else knowledge. Anchor = GitHub-style slug of the heading.
describe("parseDoc — section metadata (contract 4)", () => {
  const md = `---
id: underwriting-live-what-if
title: Underwriting Live What-If
---
## Overview

Some general knowledge prose describing the surface, with no special markers.

## Requirement: live recompute

This section mentions REQ-UW-LIVE-01 and REQ-UW-LIVE-02 as the requirements it defines.

### Decision needed: debounce window

DECISION: the debounce window is 400ms, locked after the 2026-06 review.

## Open Questions

- OQ-1: should the debounce window be user-configurable?

## Mixed section referencing REQ-UW-LIVE-03

Locked decision: this section both cites a requirement and states a locked decision — decision wins per heuristic precedence (decision > requirement > open-question > knowledge) since a section that locks a decision about a requirement is documenting the decision, not defining it.
`;
  const { nodes } = parseDoc({ path: "svc_backend/.github/system-design/40_financial_engine/UNDERWRITING_LIVE_WHAT_IF.md", content: md }, REPOS);
  const doc = nodes.find((n) => n.type === "doc")!;

  it("emits one section per H2/H3 heading with a GitHub-style slug anchor", () => {
    expect(doc.sections?.map((s) => s.anchor)).toEqual([
      "overview",
      "requirement-live-recompute",
      "decision-needed-debounce-window",
      "open-questions",
      "mixed-section-referencing-req-uw-live-03",
    ]);
  });

  it("classifies a section with no markers as knowledge", () => {
    expect(doc.sections?.find((s) => s.anchor === "overview")).toMatchObject({ kind: "knowledge", title: "Overview", reqIds: [] });
  });

  it("classifies a section mentioning REQ-… ids as requirement and collects the ids", () => {
    expect(doc.sections?.find((s) => s.anchor === "requirement-live-recompute")).toMatchObject({
      kind: "requirement",
      reqIds: ["REQ-UW-LIVE-01", "REQ-UW-LIVE-02"],
    });
  });

  it("classifies a section with DECISION:/Decision needed/Locked decision as decision", () => {
    expect(doc.sections?.find((s) => s.anchor === "decision-needed-debounce-window")).toMatchObject({ kind: "decision", reqIds: [] });
  });

  it("classifies a section whose heading or text matches Open Question(s)|OQ-\\d+ as open-question", () => {
    expect(doc.sections?.find((s) => s.anchor === "open-questions")).toMatchObject({ kind: "open-question", reqIds: [] });
  });

  it("gives decision precedence over requirement when a section matches both heuristics", () => {
    const mixed = doc.sections?.find((s) => s.anchor === "mixed-section-referencing-req-uw-live-03");
    expect(mixed).toMatchObject({ kind: "decision" });
    expect(mixed?.reqIds).toEqual(["REQ-UW-LIVE-03"]);
  });

  it("omits sections when the doc body has no H2/H3 headings", () => {
    const r = parseDoc({ path: "x/y.md", content: "---\nid: y\n---\nJust a paragraph, no headings." }, REPOS);
    expect(r.nodes[0].sections).toBeUndefined();
  });

  it("slugifies duplicate-looking headings the same GitHub way (lowercase, spaces to hyphens, punctuation stripped)", () => {
    const r = parseDoc({
      path: "x/y.md",
      content: "---\nid: y\n---\n## Hello, World! (v2)\nbody\n## Already-hyphenated_and_underscored\nbody",
    }, REPOS);
    expect(r.nodes[0].sections?.map((s) => s.anchor)).toEqual(["hello-world-v2", "already-hyphenated_and_underscored"]);
  });
});

// A doc-authored requirement can carry `covers:` (case/test slugs proving it), the same
// convention *.features.yaml requirements use (parseFeatures.ts) — carried on the node as
// `provenBy` and resolved to real test nodes by the assembler / viewer, exactly like a
// feature-registry requirement. This lets a system-design doc (e.g. the tool's own PRD)
// author requirements proven by real unit-test-node slugs.
describe("parseDoc — requirement provenBy (covers:)", () => {
  it("carries requirements[].covers as provenBy on the requirement node", () => {
    const md = `---
id: claude-plugin-spec
title: Knowledge Graph Tool
requirements:
  - id: REQ-KG-01
    text: The committed graph always matches a rebuild from source.
    covers: [tools/knowledge-graph/src/check.test.ts]
---
body`;
    const { nodes } = parseDoc({ path: "svc_main/.github/system-design/KNOWLEDGE_GRAPH_TOOL.md", content: md }, REPOS);
    const req = nodes.find((n) => n.id === "REQ-KG-01")!;
    expect(req.provenBy).toEqual(["tools/knowledge-graph/src/check.test.ts"]);
  });

  it("defaults provenBy to an empty array when covers is omitted (matches parseFeatures' default)", () => {
    const md = `---
id: claude-plugin-spec
requirements:
  - id: REQ-KG-02
    text: Some requirement with no covers list.
---
body`;
    const { nodes } = parseDoc({ path: "x/y.md", content: md }, REPOS);
    expect(nodes.find((n) => n.id === "REQ-KG-02")?.provenBy).toEqual([]);
  });
});

// reviewedAt is the frontmatter `last_reviewed` value normalized to YYYY-MM-DD. gray-matter's
// YAML engine hands back a JS Date for a bare `last_reviewed: 2026-07-01` timestamp and a plain
// string for a quoted `"2026-07-01"` — parseDoc must normalize BOTH to the same 10-char date, and
// leave the field undefined when the key is absent so downstream staleness signals stay honest.
describe("parseDoc — reviewedAt (last_reviewed frontmatter)", () => {
  it("normalizes a quoted string last_reviewed to YYYY-MM-DD", () => {
    const md = `---
id: y
last_reviewed: "2026-07-01"
---
body`;
    const { nodes } = parseDoc({ path: "x/y.md", content: md }, REPOS);
    expect(nodes[0].reviewedAt).toBe("2026-07-01");
  });

  it("normalizes an ISO string with a time component to just the date", () => {
    const md = `---
id: y
last_reviewed: "2026-07-01T12:34:56Z"
---
body`;
    const { nodes } = parseDoc({ path: "x/y.md", content: md }, REPOS);
    expect(nodes[0].reviewedAt).toBe("2026-07-01");
  });

  it("normalizes a YAML Date object (unquoted timestamp) to YYYY-MM-DD", () => {
    const md = `---
id: y
last_reviewed: 2026-07-01
---
body`;
    const { data } = matter(md);
    // Guard the premise: the YAML engine really did hand us a Date, not a string.
    expect(data.last_reviewed instanceof Date).toBe(true);
    const { nodes } = parseDoc({ path: "x/y.md", content: md }, REPOS);
    expect(nodes[0].reviewedAt).toBe("2026-07-01");
  });

  it("leaves reviewedAt undefined when last_reviewed is absent", () => {
    const md = `---
id: y
title: No review date
---
body`;
    const { nodes } = parseDoc({ path: "x/y.md", content: md }, REPOS);
    expect(nodes[0].reviewedAt).toBeUndefined();
  });
});
