import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * REQ-0 — Given any repo root supplied as configuration, the tool builds a byte-identical graph to the
 * one DojoStack's in-tree copy produces, KNOWING NOTHING ABOUT DOJOSTACK.
 *
 * This is the project's requirement zero, approved by the CEO on 2026-07-17 before any code was ported.
 * It is RED on purpose: the topology is hardcoded across twelve modules. It goes green exactly when
 * config lands (phase 2), and it is the first honest test that "reusable" is real rather than
 * aspirational — everything else this tool claims rests on it.
 *
 * Why grep, and not "build two graphs and compare": the byte-identical half is verified by the
 * fingerprint (design §8) and needs DojoStack's private repo, so it can never run in this repo's CI or
 * survive distribution (open question 1). "Knows nothing about DojoStack" is the half that CAN be
 * asserted here, forever, by anyone who installs the tool — and it is the half that actually decays.
 */

const SRC = dirname(fileURLToPath(import.meta.url));

/** Any spelling of the consuming project. A generic tool must not name the project it measures. */
const KNOWS_DOJOSTACK = /dojostack/i;

async function sourceFiles(): Promise<string[]> {
  const names = await readdir(SRC);
  // Its own name and this test are exempt: naming the thing you forbid is how you forbid it.
  return names.filter((n) => n.endsWith(".ts") && n !== "req0.test.ts");
}

describe("REQ-0 — the tool knows nothing about DojoStack", () => {
  it("names no consuming project anywhere in src/", async () => {
    const offenders: string[] = [];
    for (const name of await sourceFiles()) {
      const text = await readFile(join(SRC, name), "utf8");
      const hits = text.split("\n").filter((l) => KNOWS_DOJOSTACK.test(l)).length;
      if (hits) offenders.push(`${name} (${hits})`);
    }
    expect(offenders, `still name DojoStack: ${offenders.join(", ")}`).toEqual([]);
  });
});
