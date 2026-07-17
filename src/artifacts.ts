import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderViewer } from "./viewer";
import { renderDigest } from "./digest";
import type { Delta } from "./delta";
import type { Graph } from "./types";

export function report(g: Graph, deltaLines?: string[]): string {
  const counts = g.nodes.reduce<Record<string, number>>((a, n) => ((a[n.type] = (a[n.type] ?? 0) + 1), a), {});
  const byKind = g.issues.reduce<Record<string, number>>((a, i) => ((a[i.kind] = (a[i.kind] ?? 0) + 1), a), {});
  const lines = [
    `# Knowledge graph report`, ``,
    `Generated: ${g.generatedAt}`, ``,
    `Results: ${g.lastRun ? `${g.lastRun.at} (${g.lastRun.commit})` : "none recorded"}`, ``,
    `**Nodes:** ${g.nodes.length} — ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`,
    `**Edges:** ${g.edges.length}`,
    `**Issues:** ${g.issues.length}${g.issues.length ? " — " + Object.entries(byKind).map(([k, v]) => `${v} ${k}`).join(", ") : ""}`, ``,
    ...(deltaLines?.length ? [`## Since last sync`, ``, ...deltaLines.map((l) => `- ${l}`), ``] : []),
    ...g.issues.map((i) => `- \`${i.kind}\` ${i.node ?? `${i.from} → ${i.to}`} — ${i.detail}`),
  ];
  return lines.join("\n") + "\n";
}

export async function writeArtifacts(graph: Graph, outDir: string, opts: { delta?: Delta | null; deltaLines?: string[] } = {}): Promise<void> {
  await writeFile(join(outDir, "knowledge-graph.json"), JSON.stringify(graph, null, 2) + "\n");
  await writeFile(join(outDir, "report.md"), report(graph, opts.deltaLines));
  const template = await readFile(join(outDir, "viewer.template.html"), "utf8");
  await writeFile(join(outDir, "viewer.html"), renderViewer(graph, template, opts.delta));
  const digestDir = join(outDir, "digest");
  await mkdir(digestDir, { recursive: true });
  for (const [name, content] of Object.entries(renderDigest(graph))) await writeFile(join(digestDir, name), content);
}
