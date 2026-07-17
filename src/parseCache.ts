import { parse } from "yaml";
import { nsId, type Repos } from "./config";
import type { CacheKind, GraphEdge, GraphNode, ParseResult } from "./types";

interface RawCache {
  id: string;
  key?: string;
  kind?: string;
  ttl?: string;
  populate?: string;
  invalidate?: string[];
  status?: string;
  features?: string[];
  note?: string;
}

const KINDS = new Set<CacheKind>(["fe-query", "fe-store", "be-redis", "be-lru"]);
const STATUSES = new Set(["covered", "stale", "ttl", "untested"]);

/**
 * Parse a `*.cache.yaml` registry into `cache-entry` nodes + `tags` edges to features.
 * Each entry declares a real cache key, its store kind, TTL, what populates it, and the
 * real invalidation sites — the graph derives the surface, so it can't drift from the code.
 * Tolerates a non-list root so one malformed file can't abort the whole build.
 */
export function parseCache(input: { path: string; content: string }, repos: Repos): ParseResult {
  const parsed = parse(input.content);
  const entries: RawCache[] = Array.isArray(parsed) ? parsed : [];
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const c of entries) {
    if (!c?.id) continue;
    const id = nsId(input.path, String(c.id), repos);
    const kind = c.kind && KINDS.has(String(c.kind) as CacheKind) ? (String(c.kind) as CacheKind) : undefined;
    nodes.push({
      id,
      type: "cache-entry",
      title: String(c.key ?? c.id),
      path: input.path,
      status: c.status && STATUSES.has(String(c.status)) ? String(c.status) : undefined,
      cacheKind: kind,
      ttl: c.ttl ? String(c.ttl) : undefined,
      populate: c.populate ? String(c.populate) : undefined,
      invalidate: Array.isArray(c.invalidate) ? c.invalidate.map(String) : [],
      text: c.note ? String(c.note) : undefined,
    });
    (c.features ?? []).forEach((to) => edges.push({ from: id, to: String(to), type: "tags", source: input.path }));
  }
  return { nodes, edges };
}
