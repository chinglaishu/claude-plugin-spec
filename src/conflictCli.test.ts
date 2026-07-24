// covers: REQ-KG-CONF-02, REQ-KG-CONF-06
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { conflictId } from "./conflictId";

/**
 * The two conflict entrypoints the kg-scan-conflicts / kg-fix-conflicts skills invoke.
 *
 * They resolved the graph from the TOOL's own directory (`__dirname/..`), which is §10.9's second
 * coupling class: true only while the tool lives inside the artifact dir it measures. Installed as a
 * plugin it never does, so both CLIs died with ENOENT on every project — the skills had no working
 * entrypoint at all. These tests pin the project resolution (`KG_REPO_ROOT` / cwd + `artifactDir`)
 * rather than the tool's location, so the coupling cannot come back.
 *
 * Spawned as real processes on purpose: the defect lived entirely in the CLI glue, so an in-process
 * import of the pure functions would have stayed green throughout.
 */
const run = promisify(execFile);
const TOOL = join(__dirname, "..");

let root: string;
const SUBJECT = "sales tax basis";
const SCOPE = "billing";
const ID = conflictId(SUBJECT, SCOPE);

/** A project whose artifact dir is `artifacts/` — deliberately NOT the tool's own `knowledge-graph/`,
 *  so a CLI that ignored config could not accidentally pass. */
const graph = {
  generatedAt: "2000-01-01T00:00:00.000Z",
  nodes: [
    { id: "main:billing-spec", type: "doc", title: "Billing", domain: "billing", body: "Tax on the subtotal.", path: ".github/system-design/BILLING.md" },
    { id: "main:invoice-spec", type: "doc", title: "Invoicing", domain: "billing", body: "Tax on the discounted total.", path: ".github/system-design/INVOICE.md" },
  ],
  edges: [{ from: "main:billing-spec", to: "main:invoice-spec", type: "references" }],
  issues: [],
  conflicts: [
    {
      id: ID, subject: SUBJECT, scope: SCOPE, category: "formula", severity: "high", axis: "doc", tags: [], why: "two bases",
      positions: [
        { id: "A", statement: "tax on the subtotal", heldBy: ["main:billing-spec"] },
        { id: "B", statement: "tax on the discounted total", heldBy: ["main:invoice-spec"] },
      ],
      participants: [
        { kind: "doc", ref: "main:billing-spec", quote: "Tax on the subtotal.", positionId: "A" },
        { kind: "doc", ref: "main:invoice-spec", quote: "Tax on the discounted total.", positionId: "B" },
      ],
    },
  ],
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "kg-conflict-cli-"));
  await writeFile(
    join(root, "kg.config.json"),
    JSON.stringify({ repos: [{ name: "main", subdir: "" }], artifactDir: "artifacts", e2eDir: "e2e", unitTestGlobs: [] }),
  );
  await mkdir(join(root, "artifacts", "conflicts"), { recursive: true });
  await writeFile(join(root, "artifacts", "knowledge-graph.json"), JSON.stringify(graph));
  await writeFile(
    join(root, "artifacts", "conflicts", "decisions.json"),
    JSON.stringify({ [ID]: { status: "resolved", positionId: "A", note: "subtotal is canon" } }),
  );
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

/** Spawned from the TOOL's directory with KG_REPO_ROOT pointing elsewhere — the installed-plugin
 *  shape. A CLI reading `__dirname/..` would find the tool's own graph, not the project's. */
const cli = (script: string, ...args: string[]) =>
  run("npx", ["tsx", join(TOOL, "src", script), ...args], { cwd: TOOL, env: { ...process.env, KG_REPO_ROOT: root } });

describe("scanContext CLI — the scan skill's only input", () => {
  it("reads the graph from the PROJECT's artifactDir and emits its candidate pairs", async () => {
    const { stdout } = await cli("scanContext.ts");
    const out = JSON.parse(stdout);
    expect(out.count).toBe(1);
    expect(out.items[0].pair).toMatchObject({ kind: "doc-doc" });
    // Content from the project's graph, not the tool's — this is what makes the assertion load-bearing.
    expect(out.items.map((i: { a: { ref: string } }) => i.a.ref)).toContain("main:billing-spec");
  });

  it("honours --scope, so a scan can be run one domain at a time", async () => {
    const { stdout } = await cli("scanContext.ts", "--scope", "nothing-here");
    expect(JSON.parse(stdout).count).toBe(0);
  });

  // Without this the scan skill has to guess a scope name, or hardcode a path to the graph to go
  // looking for one — the layout coupling this tool exists to remove, reintroduced in prose.
  it("lists the scannable scopes and their pair counts", async () => {
    const { stdout } = await cli("scanContext.ts", "--scopes");
    expect(JSON.parse(stdout).scopes).toEqual([{ scope: "billing", pairs: 1 }]);
  });
});

/**
 * The customer the product is actually for: code, an AI agent, and nothing else. No `governs:`, no
 * requirements, no registries — so every doc-anchored edge is absent and the scan used to return a
 * bounded set of exactly zero, while `kg-init` step 4 promised contradictions found with no docs at
 * all. This is that promise, asserted.
 */
describe("scanContext CLI — a repo that arrived with no docs", () => {
  let bare: string;
  beforeAll(async () => {
    bare = await mkdtemp(join(tmpdir(), "kg-bare-repo-"));
    await writeFile(
      join(bare, "kg.config.json"),
      JSON.stringify({ repos: [{ name: "main", subdir: "" }], artifactDir: "artifacts", e2eDir: "e2e", unitTestGlobs: [] }),
    );
    await mkdir(join(bare, "artifacts"), { recursive: true });
    // A graph with nothing in it — exactly what `npm run build` emits for a repo with no docs.
    await writeFile(join(bare, "artifacts", "knowledge-graph.json"), JSON.stringify({ generatedAt: "", nodes: [], edges: [], issues: [] }));
    await mkdir(join(bare, "src"), { recursive: true });
    // The same rule, implemented twice, disagreeing. No doc says which is right — that is the point.
    await writeFile(join(bare, "src", "checkout.ts"), 'export const TAX_BASIS = "subtotal";\nexport function applyTax(o){return o.subtotal*0.2;}\n');
    await writeFile(join(bare, "src", "invoice.py"), 'TAX_BASIS = "discounted_total"\ndef applyTax(o):\n    return o.discounted * 0.2\n');
    await writeFile(join(bare, "src", "mailer.ts"), "export function sendMail(to){return to;}\n");
  });
  afterAll(async () => { await rm(bare, { recursive: true, force: true }); });

  const bareCli = (...args: string[]) =>
    run("npx", ["tsx", join(TOOL, "src", "scanContext.ts"), ...args], { cwd: TOOL, env: { ...process.env, KG_REPO_ROOT: bare } });

  it("still yields a surface, from the code itself", async () => {
    const out = JSON.parse((await bareCli()).stdout);
    expect(out.count).toBeGreaterThan(0);
    const pair = out.items.find((i: any) => i.pair.kind === "code-code");
    expect(pair, "a repo with no docs must still produce code-code candidates").toBeTruthy();
    expect([pair.a.ref, pair.b.ref].sort()).toEqual(["src/checkout.ts", "src/invoice.py"]);
  });

  it("still pairs nothing that shares no declaration", async () => {
    const out = JSON.parse((await bareCli()).stdout);
    const refs = out.items.flatMap((i: any) => [i.a.ref, i.b.ref]);
    expect(refs).not.toContain("src/mailer.ts");
  });
});

describe("fixPlan CLI — what kg-fix-conflicts applies", () => {
  it("reads the project's graph and decisions, and plans only the dissenter", async () => {
    const { stdout } = await cli("fixPlan.ts");
    const out = JSON.parse(stdout);
    expect(out.count).toBe(1);
    expect(out.plans[0].canonicalStatement).toBe("tax on the subtotal");
    expect(out.plans[0].note).toBe("subtotal is canon");
    // Only the losing side is a target — the canonical participant must never be "fixed".
    expect(out.plans[0].targets.map((t: { ref: string }) => t.ref)).toEqual(["main:invoice-spec"]);
  });
});
