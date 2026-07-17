import { parse } from "yaml";
import { nsId } from "./repo";
import type { GraphEdge, GraphNode, ParseResult } from "./types";

interface RawReq {
  id?: string;
  text: string;
  detail?: string;      // markdown body — the "content" behind the one-line statement
  criteria?: string[];  // acceptance-criteria bullets
  covers?: string[];    // case/test slugs that prove this requirement
}
interface RawFeature {
  id: string;
  label?: string;
  flow?: string;
  paths?: string[];
  page?: boolean;
  star?: boolean;
  requirements?: RawReq[];
}

/** Stable REQ id when the author didn't give one: derived from the NAMESPACED feature id
 *  + index, so the same authored feature id in two repos can't collide. */
function autoReqId(fid: string, i: number): string {
  return "REQ-" + fid.replace(/[^a-zA-Z0-9]+/g, "-").toUpperCase() + "-" + (i + 1);
}

/**
 * Parse a `*.features.yaml` registry into `feature` nodes and, when an entry declares
 * `requirements:`, `requirement` nodes (the "how it should work" acceptance criteria)
 * linked to the feature by a `specifies` edge. A requirement's `covers:` list (case/test
 * slugs that prove it) is carried on the node as `provenBy` and resolved in the viewer.
 * Tag edges (test → feature) are DERIVED later from globs / case `features:` — not here.
 */
export function parseFeatures(input: { path: string; content: string }): ParseResult {
  // A registry is a YAML list; tolerate an empty/null doc or a mis-authored
  // mapping/scalar root (which would otherwise throw on `for...of`) so one bad
  // file can't abort the whole graph build.
  const parsed = parse(input.content);
  const feats: RawFeature[] = Array.isArray(parsed) ? parsed : [];
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const f of feats) {
    if (!f?.id) continue;
    const fid = nsId(input.path, String(f.id));
    nodes.push({
      id: fid,
      type: "feature",
      title: String(f.label ?? f.id),
      path: input.path,
      flow: f.flow ? String(f.flow) : undefined,
      paths: Array.isArray(f.paths) ? f.paths.map(String) : [],
      page: f.page === true ? true : undefined,
      star: f.star === true ? true : undefined,   // truthy flag: only `star: true` sets it; false/omitted normalise to undefined
    });
    if (Array.isArray(f.requirements)) {
      f.requirements.forEach((r, i) => {
        if (!r?.text) return;
        const rid = r.id ? String(r.id) : autoReqId(fid, i);
        nodes.push({
          id: rid,
          type: "requirement",
          title: String(r.text),
          text: String(r.text),
          body: r.detail ? String(r.detail) : undefined,
          criteria: Array.isArray(r.criteria) ? r.criteria.map(String) : undefined,
          path: input.path,
          provenBy: Array.isArray(r.covers) ? r.covers.map(String) : [],
        });
        edges.push({ from: fid, to: rid, type: "specifies", source: input.path });
      });
    }
  }
  return { nodes, edges };
}
