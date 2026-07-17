import matter from "gray-matter";
import { basename } from "node:path";
import { slugify } from "./ids";
import { nsId } from "./repo";
import type { DocSection, GraphEdge, GraphNode, ParseResult } from "./types";

const WIKILINK = /\[\[([^\]]+)\]\]/g;
const REQ_ID = /REQ-[A-Z]+(?:-[A-Z0-9]+)*-\d+/g;
const DECISION_RE = /\b(?:Decision needed|DECISION:|Locked decision)\b/i;
const OPEN_QUESTION_RE = /\bOpen Questions?\b|\bOQ-\d+\b/i;

/**
 * GitHub-style heading slug (matches what marked.js / the viewer reproduce so anchors
 * line up): lowercase, strip anything that isn't a letter/digit/space/hyphen/underscore,
 * then turn runs of whitespace into a single hyphen. Unlike `slugify()` (used for doc/case
 * ids elsewhere), this KEEPS underscores verbatim — GitHub's own heading-anchor algorithm
 * does not strip them.
 */
export function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "-");
}

/**
 * Deterministic per-section classification (contract 4). Precedence when a section
 * matches more than one heuristic: decision > requirement > open-question > knowledge —
 * a section that locks a decision *about* a requirement is documenting the decision, not
 * defining the requirement, so "decision" wins.
 */
function classifySection(heading: string, body: string): DocSection["kind"] {
  const text = `${heading}\n${body}`;
  if (DECISION_RE.test(text)) return "decision";
  if (REQ_ID.test(text)) return "requirement";
  if (OPEN_QUESTION_RE.test(text)) return "open-question";
  return "knowledge";
}

/**
 * Normalize a frontmatter `last_reviewed` value to a bare `YYYY-MM-DD` date. gray-matter's YAML
 * engine hands back a JS `Date` for an unquoted timestamp (`last_reviewed: 2026-07-01`) and a
 * plain string for a quoted one (`"2026-07-01"` / `"2026-07-01T12:00:00Z"`) — both collapse to the
 * first 10 chars of the ISO form. Anything else (absent, empty, non-date type) → undefined so the
 * caller leaves the field off the node.
 */
function normalizeReviewDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 10);
  return undefined;
}

/** Split the doc body into H2/H3 sections (heading text + the content up to the next H2/H3). */
function parseSections(body: string): DocSection[] {
  const HEADING = /^(#{2,3})[ \t]+(.+?)[ \t]*$/gm;
  const matches = [...body.matchAll(HEADING)];
  if (!matches.length) return [];
  const sections: DocSection[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const title = m[2].trim();
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? body.length : body.length;
    const text = body.slice(start, end);
    const combined = `${title}\n${text}`;
    REQ_ID.lastIndex = 0;
    const reqIds = [...new Set([...combined.matchAll(REQ_ID)].map((r) => r[0]))];
    sections.push({ anchor: githubSlug(title), title, kind: classifySection(title, text), reqIds });
  }
  return sections;
}

export function parseDoc(input: { path: string; content: string }): ParseResult {
  const { data, content } = matter(input.content);
  // `slug` wins over `id`: the backend corpus carries a catalog `id:` (SD-nn) plus a human `slug:`,
  // and every cross-doc `related:` reference targets the slug. Keying off `id:` left those docs
  // unreachable at `backend:SD-nn`. Docs whose `id:` is already slug-like carry no `slug:` and are
  // unaffected by the fallback.
  const bare = String(data.slug ?? data.id ?? slugify(basename(input.path).replace(/\.md$/i, "")));
  const id = nsId(input.path, bare);
  const source = input.path;

  const node: GraphNode = {
    id, type: "doc",
    title: String(data.title ?? bare),
    path: input.path,
    lens: data.lens, domain: data.domain, status: data.status ?? "current",
    entrypoint: data.entrypoint === true,
    governs: Array.isArray(data.governs) ? data.governs.map(String) : [],
    body: content.trim() || undefined,
  };
  const reviewedAt = normalizeReviewDate(data.last_reviewed);
  if (reviewedAt) node.reviewedAt = reviewedAt;
  const sections = content.trim() ? parseSections(content) : [];
  if (sections.length) node.sections = sections;

  const nodes: GraphNode[] = [node];
  const edges: GraphEdge[] = [];

  for (const g of node.governs ?? []) edges.push({ from: id, to: g, type: "governs", source });

  // references: related[] + [[wikilinks]] in body (deduped)
  const refs = new Set<string>();
  if (Array.isArray(data.related)) data.related.forEach((r) => refs.add(String(r)));
  for (const m of content.matchAll(WIKILINK)) refs.add(slugify(m[1]));
  for (const to of refs) edges.push({ from: id, to, type: "references", source });

  // requirements: specifies + requirement nodes. `covers:` (case/test slugs proving it) is
  // carried on the node as `provenBy` — the same convention *.features.yaml requirements use
  // (parseFeatures.ts) — so a doc-authored requirement (e.g. the tool's own PRD) can be proven
  // by real test-node slugs and resolved identically by the assembler / viewer.
  if (Array.isArray(data.requirements)) {
    for (const req of data.requirements) {
      const rid = String(req.id ?? req);
      nodes.push({
        id: rid, type: "requirement",
        title: String(req.text ?? rid),
        text: req.text ? String(req.text) : undefined,
        provenBy: Array.isArray(req.covers) ? req.covers.map(String) : [],
      });
      edges.push({ from: id, to: rid, type: "specifies", source });
    }
  }
  return { nodes, edges };
}
