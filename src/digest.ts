import type { Graph } from "./types";
import { provingTestsOf, reqFlowOf } from "./summarize";

const bare = (id: string) => (id.includes(":") ? id.slice(id.indexOf(":") + 1) : id).toLowerCase();

/** Per-flow markdown digests for AI/context consumption. ~100 lines each, derived only. */
export function renderDigest(g: Graph): Record<string, string> {
  const h = g.health;
  if (!h) throw new Error("renderDigest requires graph.health (build attaches it)");
  const stamp = `synced ${g.generatedAt.slice(0, 10)}, results ${g.lastRun ? g.lastRun.at.slice(0, 10) : "never"}`;
  const files: Record<string, string> = {};
  const proving = provingTestsOf(g);
  const reqFlow = reqFlowOf(g);
  const reqsOfFlow = (flow: string) =>
    g.nodes.filter((n) => n.type === "requirement").filter((r) => (reqFlow.get(r.id) ?? "other") === flow);

  for (const f of h.flows) {
    const lines = [`# ${f.label} — knowledge digest (${stamp})`, ""];
    lines.push(`Capabilities: ${f.capabilities} · with tests: ${f.tested} · promises: ${f.reqTotal} (proven ${f.reqProven})`, "");
    lines.push(`## Requirements`);
    for (const r of reqsOfFlow(f.flow)) {
      const provers = proving.get(r.id) ?? [];
      const status = provers.length
        ? `Proven by: ${provers.map((t) => `${t.title} (${t.kind}, ${t.status ?? "?"})`).join(" · ")}`
        : "⚠ NO COVERING TEST";
      lines.push(`- ${bare(r.id).toUpperCase()}: ${r.text ?? r.title}`, `  ${status}`);
    }
    if (f.failing.length) lines.push("", `Failing now: ${f.failing.map((t) => t.title).join(", ")}`);
    if (f.flaky.length) lines.push(`Flaky: ${f.flaky.map((t) => t.title).join(", ")}`);
    if (f.untested.length) lines.push(`Untested capabilities: ${f.untested.join(", ")}`);
    files[`${f.flow}.md`] = lines.join("\n") + "\n";
  }
  const idx = [`# Knowledge digest index (${stamp})`, "", `Read the file for the area you are working on BEFORE changing it.`, ""];
  for (const f of h.flows)
    idx.push(`- [${f.label}](${f.flow}.md) — ${f.capabilities} capabilities, ${f.reqProven}/${f.reqTotal} promises proven, ${f.failing.length} failing`);
  files["index.md"] = idx.join("\n") + "\n";
  return files;
}
