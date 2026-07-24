import { describe, it, expect } from "vitest";
import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * REQ-0 — Given any repo root supplied as configuration, the tool builds a byte-identical graph to the
 * one the origin project's in-tree copy produced, KNOWING NOTHING ABOUT THAT PROJECT.
 *
 * This is the project's requirement zero, approved by the CEO on 2026-07-17 before any code was ported.
 *
 * Why grep, and not "build two graphs and compare": the byte-identical half needs the origin project's
 * private repo, so it can never run in this repo's CI or survive distribution. "Names no consuming
 * project" is the half that CAN be asserted here, forever, by anyone who installs the tool — and it is
 * the half that actually decays.
 *
 * SCOPE IS THE WHOLE REPO, not `src/`. It used to scan `src/*.ts` only, and everything outside that one
 * directory quietly kept its coupling: the SHIPPED VIEWER TEMPLATE hardcoded the origin project's repo
 * directories, GitHub org and working branch, so every installed copy rendered that project's name in
 * its title bar and built source links to directories the user does not have. A requirement text still
 * described a fixed three-repo table the code had already stopped using. None of it was caught, because
 * the guard was pointed at the one place that had already been cleaned.
 *
 * THE NAME-GREP IS GONE, and deliberately not replaced with a cleverer spelling of itself. To grep for
 * a word you must store the word — split across an array, hashed, however coy — and the CEO's
 * instruction was that the repo contain it in no form at all. Storing it split would also have put it
 * straight back into `knowledge-graph.json` and `viewer.html`, since `src/**\/*.test.ts` is indexed.
 *
 * Losing it costs less than it appears, because it was always the WEAKER half. §12.14: a name-grep
 * "goes green when the tool stops NAMING the origin project — not when the tool stops ASSUMING it."
 * That was not theoretical. Every coupling actually found on 2026-07-24 — the viewer's hardcoded repo
 * directories, its forge org and working branch, and `FLOW_LABELS`' table of another company's product
 * surfaces — contained no project name, so the grep was green throughout.
 *
 * What replaces it are guards that cannot be satisfied by a rename:
 *   - REQ-1's fixture byte-identity tests (`fixtureRepo.test.ts`), which the founding design already
 *     names REQ-0's permanent successor: a tool that assumes a layout builds the wrong fixture graph
 *     whether or not it ever names a project;
 *   - the assertions below, which forbid the SHAPES of coupling rather than one project's spelling.
 */

const SRC = dirname(fileURLToPath(import.meta.url));
const REPO = join(SRC, "..");

/** Build output, vcs internals, and the synthetic fixture projects (which are their own repos, and are
 *  already asserted clean by their committed expected graphs). */
const IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/.next/**",
  "package-lock.json",
];

/** Text files only — a binary would produce noise, not a finding. */
const TEXT = /\.(ts|tsx|mts|js|mjs|json|md|html|yaml|yml|txt|sh)$/i;

async function repoFiles(): Promise<string[]> {
  const all = await fg("**/*", { cwd: REPO, ignore: IGNORE, dot: true, unique: true, onlyFiles: true });
  return all.filter((p) => TEXT.test(p)).sort();
}

/** The shipped surface: what an installed copy actually carries. Tests are excluded — a fixture is
 *  allowed to describe a made-up project, that is what a fixture is for. */
const SHIPPED = ["viewer.template.html", "src/summarize.ts", "src/viewer.ts", "src/digest.ts", "src/serve.ts"];

describe("REQ-0 — the tool assumes nothing about the project it measures", () => {
  it("scans the shipped viewer template, the asset that escaped the old src/-only guard", async () => {
    const files = await repoFiles();
    // A guard that silently matched nothing would pass forever. Pin that it actually walked the tree.
    expect(files.length, "the lint found no files to scan — the walk is broken").toBeGreaterThan(50);
    expect(files).toContain("viewer.template.html");
  });

  // A hardcoded forge host, owner and branch sent every installed copy into a stranger's repository.
  // Unlike a project name, this survives any rename, which is why it is asserted by shape.
  it("builds no hardcoded forge URL in any shipped asset", async () => {
    const offenders: string[] = [];
    for (const rel of SHIPPED) {
      const text = await readFile(join(REPO, rel), "utf8").catch(() => "");
      const urls = text.match(/https?:\/\/(www\.)?(github|gitlab|bitbucket)\.com\/[^'"\s)]+/g) ?? [];
      // `api.github.com` is legitimate: the evidence-image fetch, whose token the user supplies.
      const bad = urls.filter((u) => !u.includes("api.github.com"));
      if (bad.length) offenders.push(`${rel}: ${bad.join(", ")}`);
    }
    expect(offenders, `shipped assets hardcode a forge: ${offenders.join(" | ")}`).toEqual([]);
  });

  // `FLOW_LABELS` was a lookup table of one project's product surfaces, rendered as everyone's flow
  // taxonomy. A flow's name belongs to whichever project declared it in its own *.features.yaml.
  it("ships no product taxonomy — flow labels come from the project, not the tool", async () => {
    const { FLOW_LABELS } = await import("./summarize");
    // `other` is the tool's OWN bucket for features declaring no flow; everything else would be borrowed.
    expect(Object.keys(FLOW_LABELS)).toEqual(["other"]);
  });

  // The name was only half of it. The shipped viewer also hardcoded a forge host, an owner and a
  // working branch, so every installed copy linked its user into a stranger's repository. The tool is
  // told none of those three, so it must construct no such URL at all — and unlike the name, a forge
  // literal would survive a rename of the origin project, which is why it gets its own assertion.
  it("the shipped viewer builds no hardcoded forge URL", async () => {
    const template = await readFile(join(REPO, "viewer.template.html"), "utf8");
    const forgeUrls = template.match(/https?:\/\/(www\.)?(github|gitlab|bitbucket)\.com\/[^'"\s)]+/g) ?? [];
    // `api.github.com` is legitimate: it is the evidence-image fetch, and the user supplies its token.
    expect(forgeUrls.filter((u) => !u.includes("api.github.com"))).toEqual([]);
  });
});
