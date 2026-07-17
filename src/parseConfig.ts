import matter from "gray-matter";
import { basename } from "node:path";
import { slugify } from "./ids";
import { nsId, type Repos } from "./config";
import type { GraphEdge, GraphNode, ParseResult } from "./types";

const IMPORT = /^@(\S+\.md)\s*$/gm;

export function parseInstruction(input: { path: string; content: string }, repos: Repos): ParseResult {
  const { data, content } = matter(input.content);
  const bare = slugify(basename(input.path).replace(/\.md$/i, ""));
  const id = nsId(input.path, bare, repos);
  const source = input.path;
  const node: GraphNode = { id, type: "instruction", title: String(data.title ?? bare), path: input.path, body: content.trim() || undefined };
  const edges: GraphEdge[] = [];
  for (const g of ([] as string[]).concat(data.applyTo ?? []))
    edges.push({ from: id, to: String(g), type: "applies-to", source });
  for (const m of content.matchAll(IMPORT))
    edges.push({ from: id, to: slugify(basename(m[1]).replace(/\.md$/i, "")), type: "imports", source });
  return { nodes: [node], edges };
}

export function parseAgent(input: { path: string; content: string }, repos: Repos): ParseResult {
  const { data } = matter(input.content);
  const bare = String(data.name ?? slugify(basename(input.path).replace(/\.(agent\.)?md$/i, "")));
  const id = nsId(input.path, bare, repos);
  return { nodes: [{ id, type: "agent", title: bare, path: input.path, text: data.description ? String(data.description) : undefined }], edges: [] };
}

export function parseHooks(input: { path: string; content: string }, repos: Repos): ParseResult {
  const source = input.path;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let settings: any;
  try { settings = JSON.parse(input.content); } catch { return { nodes, edges }; }
  const hooks = settings?.hooks ?? {};
  for (const [event, groups] of Object.entries<any>(hooks)) {
    const id = nsId(input.path, `hook:${event}`, repos);
    nodes.push({ id, type: "hook", title: `${event} hook`, path: input.path });
    edges.push({ from: id, to: event, type: "activates-on", source });
    for (const group of ([] as any[]).concat(groups)) {
      for (const h of group?.hooks ?? []) {
        const m = String(h.command ?? "").match(/([a-z0-9-]+)\s+agent/i);
        if (m) edges.push({ from: id, to: m[1].toLowerCase(), type: "triggers", source });
      }
    }
  }
  return { nodes, edges };
}
