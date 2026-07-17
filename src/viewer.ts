import type { Graph } from "./types";
import type { Delta } from "./delta";

const START = "/*__KG_DATA__*/";
const END = "/*__KG_END__*/";
const D_START = "/*__KG_DELTA__*/";
const D_END = "/*__KG_END_DELTA__*/";

export function renderViewer(graph: Graph, template: string, delta?: Delta | null): string {
  const s = template.indexOf(START);
  const e = template.indexOf(END);
  if (s < 0 || e < 0) throw new Error("viewer template missing markers " + START + " … " + END);
  const data = JSON.stringify(graph).replace(/<\/script>/gi, "<\\/script>");
  const tail = template.slice(e + END.length); // everything AFTER the just-inlined data blob
  let out = template.slice(0, s) + data + tail;
  // Find the DELTA markers ONLY within `tail` (the real template, never the just-inlined graph
  // JSON). A node field (e.g. a self-indexed *.test.ts's `source`) can legitimately contain the
  // literal marker text (this tool's own check.test.ts/viewer.test.ts fixtures test the marker
  // syntax itself) — searching the whole `out` string would find that spurious occurrence INSIDE
  // the data blob first and splice the delta mid-JSON-string, corrupting the page (regression:
  // see viewer.test.ts "marker collision with node content").
  const dsInTail = tail.indexOf(D_START), deInTail = tail.indexOf(D_END);
  if (delta != null && dsInTail >= 0 && deInTail >= 0) {
    const dj = JSON.stringify(delta).replace(/<\/script>/gi, "<\\/script>");
    const prefixLen = template.slice(0, s).length + data.length;
    const ds = prefixLen + dsInTail, de = prefixLen + deInTail;
    out = out.slice(0, ds) + D_START + dj + out.slice(de);
  }
  return out;
}
