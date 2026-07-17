import { describe, it, expect } from "vitest";
import micromatch from "micromatch";
import { classify, UNIT_GLOBS } from "./discover";
import type { GitRunner } from "./gitDates";

describe("classify", () => {
  it("routes paths to parsers", () => {
    expect(classify("dojostack_backend/.github/system-design/00_platform/X.md")).toBe("doc");
    expect(classify("dojostack_frontend/.github/memories/y.md")).toBe("doc");
    expect(classify("dojostack_frontend/e2e/cases/house-view.cases.yaml")).toBe("cases");
    expect(classify("dojostack_frontend/e2e/features/house-view.features.yaml")).toBe("features");
    expect(classify("dojostack_frontend/e2e/cache/house-view.cache.yaml")).toBe("cache");
    expect(classify("CLAUDE.md")).toBe("instruction");
    expect(classify(".github/instructions/frontend.instructions.md")).toBe("instruction");
    expect(classify(".claude/agents/code-review.md")).toBe("agent");
    expect(classify(".claude/skills/ui-ux-pro-max/SKILL.md")).toBe("agent");
    expect(classify(".claude/settings.json")).toBe("hook");
    expect(classify("dojostack_frontend/src/app/page.tsx")).toBeNull();
  });
});

// The KG tool's own vitest files are candidates for unit-fe indexing (so the tool's own PRD
// can honestly `provenBy` real test-node slugs — spec §5 item 6 / ratchet constraint).
describe("UNIT_GLOBS — tool's own vitest files", () => {
  it("matches tools/knowledge-graph/src/*.test.ts", () => {
    expect(micromatch.isMatch("tools/knowledge-graph/src/check.test.ts", UNIT_GLOBS)).toBe(true);
    expect(micromatch.isMatch("tools/knowledge-graph/src/shotsUpload.test.ts", UNIT_GLOBS)).toBe(true);
  });
  it("does not match a non-test file in the same directory", () => {
    expect(micromatch.isMatch("tools/knowledge-graph/src/check.ts", UNIT_GLOBS)).toBe(false);
  });
});

// Wiring test: buildGraph() must inline every discovered *.features.yaml into
// graph.registries (basename → raw text) so the viewer can render the registry
// as an in-viewer document. Runs against a throwaway fixture repo so it proves
// the discover → assemble seam, not just the pure assemble behaviour.
describe("buildGraph — inlines feature registries into graph.registries", () => {
  it("carries basename → byte-exact raw yaml for discovered registries", async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { buildGraph } = await import("./discover");

    const root = await mkdtemp(join(tmpdir(), "kg-registries-"));
    try {
      const featDir = join(root, "dojostack_frontend", "e2e", "features");
      await mkdir(featDir, { recursive: true });
      const rawA = "- id: uw.deal\n  label: Deal return\n  flow: uw\n  paths: []\n";
      const rawB = "- id: add.map\n  label: Mapping\n  flow: add\n  paths: []\n";
      await writeFile(join(featDir, "underwriting.features.yaml"), rawA);
      await writeFile(join(featDir, "add-property.features.yaml"), rawB);

      const graph = await buildGraph(root, "2026-07-05T00:00:00Z");
      expect(graph.registries).toBeDefined();
      expect(Object.keys(graph.registries!)).toEqual(["add-property.features.yaml", "underwriting.features.yaml"]);
      expect(graph.registries!["underwriting.features.yaml"]).toBe(rawA);
      expect(graph.registries!["add-property.features.yaml"]).toBe(rawB);
      // registries is payload-only: the feature nodes still come from parsing, not from this map
      expect(graph.nodes.some((n) => n.id === "frontend:uw.deal")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

// Wiring test: buildGraph() must stamp file-backed knowledge nodes (doc/instruction/agent) with
// git created/updated dates via docDates. Uses an INJECTED git runner returning canned output so
// the test is deterministic and independent of the temp dir's (absent) git history.
const NUL = "\x00";

describe("buildGraph — stamps git created/updated onto file-backed knowledge nodes", () => {
  async function withDocRepo(fn: (root: string) => Promise<void>) {
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = await mkdtemp(join(tmpdir(), "kg-dates-"));
    try {
      const docDir = join(root, "dojostack_backend", ".github", "system-design");
      await mkdir(docDir, { recursive: true });
      await writeFile(join(docDir, "foo.md"), "---\nid: foo\ntitle: Foo\n---\nBody.\n");
      await fn(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  it("stamps created (oldest) and updated (newest) from the injected git runner", async () => {
    const { buildGraph } = await import("./discover");
    await withDocRepo(async (root) => {
      const runner: GitRunner = async (cwd) =>
        cwd.endsWith("dojostack_backend")
          ? `${NUL}2026-07-10T00:00:00Z\n.github/system-design/foo.md\n\n${NUL}2026-01-01T00:00:00Z\n.github/system-design/foo.md\n`
          : "";
      const graph = await buildGraph(root, "2026-07-11T00:00:00Z", runner);
      const doc = graph.nodes.find((n) => n.path === "dojostack_backend/.github/system-design/foo.md")!;
      expect(doc).toBeDefined();
      expect(doc.type).toBe("doc");
      expect(doc.created).toBe("2026-01-01");
      expect(doc.updated).toBe("2026-07-10");
    });
  });

  it("is a no-op (no created/updated) when the git runner yields nothing — git-absence safe", async () => {
    const { buildGraph } = await import("./discover");
    await withDocRepo(async (root) => {
      const runner: GitRunner = async () => null; // git failure / non-git dir
      const graph = await buildGraph(root, "2026-07-11T00:00:00Z", runner);
      const doc = graph.nodes.find((n) => n.path === "dojostack_backend/.github/system-design/foo.md")!;
      expect(doc).toBeDefined();
      expect(doc.created).toBeUndefined();
      expect(doc.updated).toBeUndefined();
    });
  });

  // hook nodes (from .claude/settings*.json) are rendered as docs by the viewer (isDoc treats
  // `hook` like a doc → docDateLine), so they must be dated alongside doc/instruction/agent or
  // their date line renders blank while sibling docs show one.
  it("stamps a file-backed hook node (.claude/settings.json) too", async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { buildGraph } = await import("./discover");
    const root = await mkdtemp(join(tmpdir(), "kg-hook-dates-"));
    try {
      await mkdir(join(root, ".claude"), { recursive: true });
      await writeFile(join(root, ".claude", "settings.json"), JSON.stringify({ hooks: { Stop: [] } }));
      const runner: GitRunner = async (cwd) =>
        cwd === root
          ? `${NUL}2026-06-06T00:00:00Z\n.claude/settings.json\n\n${NUL}2026-02-02T00:00:00Z\n.claude/settings.json\n`
          : "";
      const graph = await buildGraph(root, "2026-07-11T00:00:00Z", runner);
      const hook = graph.nodes.find((n) => n.type === "hook" && n.path === ".claude/settings.json")!;
      expect(hook).toBeDefined();
      expect(hook.created).toBe("2026-02-02");
      expect(hook.updated).toBe("2026-06-06");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
