import { describe, it, expect } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSha, isOnOrigin, readSources, sourcesMatch, toSources, unfetchablePins, serializeSources, parsePinned, stampSources, SOURCES_FILE, pinnedGateDecision, type GitCmd } from "./sources";

const SHA_B = "a".repeat(40);
const SHA_F = "b".repeat(40);

/** Injected git: answers rev-parse with a per-repo sha and reports both shas as pushed. */
const fakeGit =
  (opts: { pushed?: Record<string, boolean> } = {}): GitCmd =>
  async (cwd, args) => {
    const sha = cwd.endsWith("dojostack_backend") ? SHA_B : SHA_F;
    if (args[0] === "rev-parse") return `${sha}\n`;
    if (args[0] === "branch") return (opts.pushed?.[sha] ?? true) ? "  origin/main\n" : "";
    return null;
  };

describe("parseSha", () => {
  it("trims a rev-parse sha", () => {
    expect(parseSha(`${SHA_B}\n`)).toBe(SHA_B);
  });
  it("rejects anything that is not a 40-hex sha", () => {
    expect(parseSha("not-a-sha\n")).toBeNull();
    expect(parseSha("")).toBeNull();
    expect(parseSha(null)).toBeNull();
  });
});

describe("isOnOrigin", () => {
  it("is true when a remote branch contains the commit", () => {
    expect(isOnOrigin("  origin/main\n  origin/feat/x\n")).toBe(true);
  });
  it("is false for empty output — a local-only commit CI could never fetch", () => {
    expect(isOnOrigin("")).toBe(false);
    expect(isOnOrigin("   \n")).toBe(false);
  });
  it("is false when git failed, rather than assuming pushed", () => {
    expect(isOnOrigin(null)).toBe(false);
  });
});

describe("readSources", () => {
  it("records the sibling repos' HEAD shas", async () => {
    const info = await readSources("/repo", fakeGit());
    expect(toSources(info)).toEqual({ backend: SHA_B, frontend: SHA_F });
  });

  // readSources reports FACTS; callers apply policy. build warns and proceeds, check blocks — per
  // the tool's standing split ("`sync` never blocking regardless of ratchet state", PRD §7). A
  // build that hard-failed on an unpushed sibling would break the inner loop on every feature
  // branch, which is the normal state of work.
  it("reports whether each sha is reachable on origin instead of throwing", async () => {
    const info = await readSources("/repo", fakeGit({ pushed: { [SHA_B]: false } }));
    expect(info.backend).toEqual({ sha: SHA_B, onOrigin: false });
    expect(info.frontend).toEqual({ sha: SHA_F, onOrigin: true });
  });

  it("still throws when a sibling sha cannot be read at all — that is not a policy call", async () => {
    const brokenGit: GitCmd = async () => null;
    await expect(readSources("/repo", brokenGit)).rejects.toThrow(/backend/i);
  });
});

// REQ-KG-GATE-01/04: a pin CI cannot fetch is not a pin. Pure policy, so build can warn on it and
// check can block on it from one shared rule.
describe("unfetchablePins", () => {
  it("is empty when every pin is on origin", () => {
    expect(unfetchablePins({ backend: { sha: SHA_B, onOrigin: true }, frontend: { sha: SHA_F, onOrigin: true } })).toEqual([]);
  });

  it("names the repo and tells you the fix is a push", () => {
    const bad = unfetchablePins({ backend: { sha: SHA_B, onOrigin: false }, frontend: { sha: SHA_F, onOrigin: true } });
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatch(/backend/);
    expect(bad[0]).toMatch(/push/i);
  });
});

// The lockfile is committed, so its bytes must be stable — an unstable serialization would show up
// as phantom diffs on every rebuild and train people to ignore it.
describe("serializeSources", () => {
  it("is stable, key-ordered and newline-terminated", () => {
    const a = serializeSources({ backend: SHA_B, frontend: SHA_F });
    const b = serializeSources({ frontend: SHA_F, backend: SHA_B } as any);
    expect(a).toBe(b);
    expect(a.endsWith("\n")).toBe(true);
    expect(a.indexOf("backend")).toBeLessThan(a.indexOf("frontend"));
  });
  it("round-trips through parsePinned", () => {
    expect(parsePinned(serializeSources({ backend: SHA_B, frontend: SHA_F }))).toEqual({ backend: SHA_B, frontend: SHA_F });
  });
});

// A malformed lockfile must read as "no usable pin", never as a partial one — half a pin would let
// check compare against a fiction and pass.
describe("parsePinned", () => {
  it("rejects a lockfile missing a sibling", () => {
    expect(parsePinned(JSON.stringify({ backend: SHA_B }))).toBeNull();
  });
  it("rejects a non-sha value", () => {
    expect(parsePinned(JSON.stringify({ backend: "HEAD", frontend: SHA_F }))).toBeNull();
  });
  it("rejects unparseable json rather than throwing", () => {
    expect(parsePinned("{not json")).toBeNull();
    expect(parsePinned("")).toBeNull();
  });
});

// The lockfile must be stamped wherever the graph is WRITTEN (build and sync both call
// writeArtifacts) — a graph written without a matching lockfile is itself a drift source, which
// would be a fine irony to build into the fix for drift. One shared helper, so the two can't skew.
describe("stampSources", () => {
  it("writes the lockfile beside the graph and returns the pins", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kg-sources-"));
    const pins = await stampSources("/repo", dir, fakeGit());
    expect(pins).toEqual({ backend: SHA_B, frontend: SHA_F });
    expect(await readFile(join(dir, SOURCES_FILE), "utf8")).toBe(serializeSources(pins));
  });

  it("still stamps when a pin is unpushed — build warns, it does not block", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kg-sources-"));
    const pins = await stampSources("/repo", dir, fakeGit({ pushed: { [SHA_B]: false } }));
    expect(pins.backend).toBe(SHA_B);
    expect(parsePinned(await readFile(join(dir, SOURCES_FILE), "utf8"))).toEqual(pins);
  });
});

// REQ-KG-GATE-02. The whole decision, pure, taking the raw lockfile text — so check.ts's un-testable
// isMain block shrinks to a file read plus an exit, instead of growing more untested wiring (the
// class of gap §7 already tracks, and the one that let REQ-KG-04 be false).
describe("pinnedGateDecision", () => {
  const actual = { backend: SHA_B, frontend: SHA_F };

  it("passes when the checkout sits exactly on the pins", () => {
    const d = pinnedGateDecision(serializeSources(actual), actual);
    expect(d.ok).toBe(true);
  });

  it("fails when there is no lockfile at all, and says how to make one", () => {
    const d = pinnedGateDecision(null, actual);
    expect(d.ok).toBe(false);
    expect(d.messages.join(" ")).toMatch(/build/i);
  });

  it("fails on a malformed lockfile rather than guessing a pin", () => {
    expect(pinnedGateDecision("{not json", actual).ok).toBe(false);
    expect(pinnedGateDecision(JSON.stringify({ backend: SHA_B }), actual).ok).toBe(false);
  });

  it("fails naming every repo whose checkout drifted from its pin", () => {
    const d = pinnedGateDecision(serializeSources({ backend: "c".repeat(40), frontend: "d".repeat(40) }), actual);
    expect(d.ok).toBe(false);
    expect(d.messages.join(" ")).toMatch(/backend/);
    expect(d.messages.join(" ")).toMatch(/frontend/);
  });
});

describe("sourcesMatch", () => {
  const pinned = { backend: SHA_B, frontend: SHA_F };

  it("reports no mismatch when the checkout sits exactly on the pins", () => {
    expect(sourcesMatch(pinned, { backend: SHA_B, frontend: SHA_F })).toEqual([]);
  });

  it("names each repo whose checkout differs from its pin", () => {
    const drift = sourcesMatch(pinned, { backend: "c".repeat(40), frontend: SHA_F });
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatch(/backend/);
  });

  it("reports every drifted repo, not just the first", () => {
    expect(sourcesMatch(pinned, { backend: "c".repeat(40), frontend: "d".repeat(40) })).toHaveLength(2);
  });
});
