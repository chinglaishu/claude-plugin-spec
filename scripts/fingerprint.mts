// scripts/fingerprint.mts — the phase-2 oracle.
//
// The graph is a PURE FUNCTION OF THE TREE. That is the property the whole genericization rests on: a
// config refactor must leave the graph byte-identical, so if this hash moves, behaviour changed and the
// refactor is wrong. Proven 2026-07-17 to be identical across darwin-arm64, linux-arm64 and linux-x64.
//
// THE CONTRACT IS THE METHOD, NOT ANY PARTICULAR HASH — the fingerprint moves whenever the target tree
// changes. So each phase: capture from an UNMODIFIED tree, refactor without touching indexed content,
// assert unchanged. Never compare against a hash written down on another day.
//
//   npx tsx scripts/fingerprint.mts <repo-root> [config.json]
//
// Normalization mirrors check.ts's normalizeForCompare exactly (blank generatedAt and per-node git
// created/updated; keep reviewedAt) — so this measures precisely what graphsMatch() compares.
//
// The config defaults to the DojoStack fixture beside this script, because the target tree does not
// carry a kg.config.json until phase 5 rewires it — and phase 2 must not touch the tree it measures.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph } from "../src/discover";
import { parseConfig } from "../src/config";

const root = process.argv[2] ?? process.env.KG_REPO_ROOT;
if (!root) {
  console.error("usage: npx tsx scripts/fingerprint.mts <repo-root> [config.json]");
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const configPath = process.argv[3] ?? join(here, "dojostack.kg.config.json");
const config = parseConfig(await readFile(configPath, "utf8"));

const FIXED = "2000-01-01T00:00:00.000Z"; // pin the clock so only content differs

const g: any = await buildGraph(root, FIXED, config);

const normalized = {
  ...g,
  generatedAt: "",
  nodes: g.nodes.map((n: any) => {
    if (!("created" in n) && !("updated" in n)) return n;
    const c = { ...n };
    if ("created" in c) c.created = "";
    if ("updated" in c) c.updated = "";
    return c;
  }),
};

const json = JSON.stringify(normalized);
console.log(`root   : ${root}`);
console.log(`config : ${configPath}`);
console.log(`nodes  : ${g.nodes.length}`);
console.log(`edges  : ${g.edges.length}`);
console.log(`issues : ${g.issues.length}`);
console.log(`bytes  : ${json.length}`);
console.log(`SHA256 : ${createHash("sha256").update(json).digest("hex")}`);
