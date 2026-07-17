import { parse } from "yaml";
import { nsId } from "./repo";
import type { GraphEdge, GraphNode, ParseResult, TestStep } from "./types";

interface RawStep { action: string; expected: string; screenshot?: string }
interface RawCase {
  id: string; title?: string; status?: string; spec?: string;
  verifies?: string[]; covers?: string[]; exercises?: string[]; features?: string[];
  steps?: RawStep[];
  playwrightTitle?: string;
  parallelSafe?: boolean;
  kind?: "flow" | "feature";
}

export function parseCases(input: { path: string; content: string }): ParseResult {
  const cases = (parse(input.content) ?? []) as RawCase[];
  const source = input.path;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const c of cases) {
    if (!c?.id) continue;
    const id = nsId(input.path, String(c.id));
    const steps: TestStep[] | undefined = Array.isArray(c.steps) && c.steps.length
      ? c.steps.map((s) => ({
          action: String(s.action ?? ""),
          expected: String(s.expected ?? ""),
          screenshot: s.screenshot ? String(s.screenshot) : undefined,
        }))
      : undefined;
    const e2eKind: "flow" | "feature" = c.kind === "flow" ? "flow" : "feature";
    nodes.push({ id, type: "test", kind: "e2e", title: c.title ?? c.id, path: input.path, status: c.status ?? "todo", spec: c.spec, steps, playwrightTitle: c.playwrightTitle ? String(c.playwrightTitle) : undefined, parallelSafe: c.parallelSafe === true ? true : undefined, e2eKind });
    const link = (arr: string[] | undefined, type: GraphEdge["type"]) =>
      (arr ?? []).forEach((to) => edges.push({ from: id, to: String(to), type, source }));
    link(c.verifies, "verifies");
    link(c.covers, "covers");
    link(c.exercises, "exercises");
    link(c.features, "tags");   // explicit feature tags for e2e cases
  }
  return { nodes, edges };
}
