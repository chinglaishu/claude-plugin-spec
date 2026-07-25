// covers: REQ-KG-CTX-01, REQ-KG-CONF-02
// The briefing's governed/grandfathered/halt verdicts, and the scan surface reaching code with no
// docs — both asserted end to end here, from outside, against a repo that is not this one.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * The plugin, exercised the way a stranger installs it: from OUTSIDE, against a repo that is not this
 * one, with `KG_REPO_ROOT` pointing elsewhere.
 *
 * Every unit test in this suite builds graphs in-process, which cannot catch the class of defect that
 * has actually shipped here — entrypoints resolving paths from the tool's own directory, a config
 * error surfacing as a raw stack trace, the freeze sweeping the tool's own artifacts into the
 * baseline. All three were found by running this sequence by hand; this is that walkthrough, kept.
 *
 * The fixture is deliberately a repo with NO docs, NO tests and NO config — the founding design's
 * customer (§1), and the state in which every other test's assumptions are least true.
 */
const run = promisify(execFile);
const TOOL = join(__dirname, "..");

let repo: string;
/** Spawned from the TOOL's own directory, so a path resolved from `__dirname` would find the wrong tree. */
const kg = (script: string, ...args: string[]) =>
  run("npx", ["tsx", join(TOOL, "src", script), ...args], { cwd: TOOL, env: { ...process.env, KG_REPO_ROOT: repo } });

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), "kg-fresh-install-"));
  await mkdir(join(repo, "src"), { recursive: true });
  await mkdir(join(repo, "lib"), { recursive: true });
  // The same rule implemented twice, disagreeing on both the rate and the basis. No doc says which is
  // right — that is the point, and it is where a bare repo's first requirement comes from.
  await writeFile(join(repo, "src", "pricing.ts"),
    "export const TAX_RATE = 0.2;\nexport function applyTax(o: any) { return o.subtotal * (1 + TAX_RATE); }\n");
  await writeFile(join(repo, "lib", "invoice.ts"),
    "export const TAX_RATE = 0.15;\nexport function applyTax(o: any) { return (o.subtotal - o.discount) * (1 + TAX_RATE); }\n");
  await writeFile(join(repo, "src", "mailer.ts"), "export function sendReceipt(to: string) { return to; }\n");
});
afterAll(async () => { await rm(repo, { recursive: true, force: true }); });

describe("a fresh install, on somebody else's repo", () => {
  // The tool must never guess a layout — guessing wrong emits a complete, confident, wrong graph. But
  // the refusal has to READ like an instruction, not like a crash: this is kg-init step 2, so it is
  // the first thing a new user sees on the likeliest mistake.
  it("refuses to build without a config, and says what to do about it", async () => {
    const err: any = await kg("build.ts").catch((e) => e);
    expect(err.code, "build must fail without a config, not guess one").not.toBe(0);
    expect(err.stderr).toMatch(/kg\.config\.json/);
    expect(err.stderr).toMatch(/kg-init/);
    // The message is useless if it arrives wrapped in a stack trace nobody reads to the end of.
    expect(err.stderr).not.toMatch(/at .*\(.*:\d+:\d+\)/);
  });

  it("builds an honestly empty graph once the topology is declared", async () => {
    await writeFile(join(repo, "kg.config.json"), JSON.stringify({
      repos: [{ name: "main", subdir: "" }], e2eDir: "e2e", artifactDir: "knowledge-graph", unitTestGlobs: [],
    }));
    const { stdout } = await kg("build.ts");
    // A repo with no docs and no registered tests HAS no nodes. Thin is the honest answer here.
    expect(stdout).toMatch(/kg: 0 nodes/);
  });

  it("freezes only the project's own files, never the artifacts it just generated", async () => {
    await kg("ungovernedBaselineCli.ts");
    const frozen: string[] = JSON.parse(await readFile(join(repo, "knowledge-graph", "ungoverned-baseline.json"), "utf8"));
    expect(frozen).toContain("src/pricing.ts");
    expect(frozen).toContain("lib/invoice.ts");
    // The graph, viewer, report and digest are rebuilt every run; freezing them records the tool's own
    // output as excused code and pads the count with churn.
    expect(frozen.filter((p) => p.startsWith("knowledge-graph/"))).toEqual([]);
  });

  it("grandfathers what already existed and halts on what comes next", async () => {
    const existing = await kg("agentContextCli.ts", "src/pricing.ts");
    expect(existing.stdout).toMatch(/grandfathered/i);
    const fresh = await kg("agentContextCli.ts", "src/checkout.ts");
    expect(fresh.stdout).toMatch(/STOP/);
  });

  // The differentiated claim: contradictions found with no docs at all, which is the only way a repo
  // in this state gets a first requirement.
  it("finds a code-vs-code contradiction with no docs in the repo", async () => {
    const out = JSON.parse((await kg("scanContext.ts")).stdout);
    const pair = out.items.find((i: any) => i.pair.kind === "code-code");
    expect(pair, "a bare repo must still yield a candidate surface").toBeTruthy();
    expect([pair.a.ref, pair.b.ref].sort()).toEqual(["lib/invoice.ts", "src/pricing.ts"]);
    expect(pair.pair.sharedSymbols).toContain("TAX_RATE");
    // Precision is the product: a file sharing no declaration is never dragged in.
    expect(out.items.flatMap((i: any) => [i.a.ref, i.b.ref])).not.toContain("src/mailer.ts");
  });

  // The accretion step — the whole point of the previous one. Writing the adjudication down as a
  // requirement is what turns an ungoverned file into a governed one and shrinks the ratchet.
  it("governs the file once a requirement is written, and the baseline falls", async () => {
    await mkdir(join(repo, ".github", "system-design"), { recursive: true });
    await writeFile(join(repo, ".github", "system-design", "PRICING.md"),
      ["---", "slug: pricing", "title: Pricing", "domain: shop", "status: current", "entrypoint: true",
       "governs:", "  - src/pricing.ts", "  - lib/invoice.ts",
       "requirements:", "  - id: REQ-SHOP-01", "    text: Tax applies to the discounted total.", "---", "", "## Basis", ""].join("\n"));
    await kg("build.ts");

    const pack = await kg("agentContextCli.ts", "src/pricing.ts");
    expect(pack.stdout).toMatch(/## Governed by/);
    expect(pack.stdout).toMatch(/REQ-SHOP-01/);
    expect(pack.stdout).not.toMatch(/grandfathered/i);

    const { stdout } = await kg("ungovernedBaselineCli.ts", "--prune");
    expect(stdout).toMatch(/dropped 2 now-governed/);
  });
});
