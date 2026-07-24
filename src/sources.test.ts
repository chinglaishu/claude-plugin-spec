// covers: REQ-KG-GATE-01, REQ-KG-GATE-02
import { describe, it, expect } from "vitest";
import { REPOS, SOLO } from "./topology.fixture";
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
    const sha = cwd.endsWith("svc_backend") ? SHA_B : SHA_F;
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
    const info = await readSources("/repo", REPOS, fakeGit());
    expect(toSources(info)).toEqual({ backend: SHA_B, frontend: SHA_F });
  });

  // readSources reports FACTS; callers apply policy. build warns and proceeds, check blocks — per
  // the tool's standing split ("`sync` never blocking regardless of ratchet state", PRD §7). A
  // build that hard-failed on an unpushed sibling would break the inner loop on every feature
  // branch, which is the normal state of work.
  it("reports whether each sha is reachable on origin instead of throwing", async () => {
    const info = await readSources("/repo", REPOS, fakeGit({ pushed: { [SHA_B]: false } }));
    expect(info.backend).toEqual({ sha: SHA_B, onOrigin: false });
    expect(info.frontend).toEqual({ sha: SHA_F, onOrigin: true });
  });

  it("still throws when a sibling sha cannot be read at all — that is not a policy call", async () => {
    const brokenGit: GitCmd = async () => null;
    await expect(readSources("/repo", REPOS, brokenGit)).rejects.toThrow(/backend/i);
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
    const a = serializeSources({ backend: SHA_B, frontend: SHA_F }, REPOS);
    const b = serializeSources({ frontend: SHA_F, backend: SHA_B } as any, REPOS);
    expect(a).toBe(b);
    expect(a.endsWith("\n")).toBe(true);
    expect(a.indexOf("backend")).toBeLessThan(a.indexOf("frontend"));
  });
  it("round-trips through parsePinned", () => {
    expect(parsePinned(serializeSources({ backend: SHA_B, frontend: SHA_F }, REPOS), REPOS)).toEqual({ backend: SHA_B, frontend: SHA_F });
  });
});

// A malformed lockfile must read as "no usable pin", never as a partial one — half a pin would let
// check compare against a fiction and pass.
describe("parsePinned", () => {
  it("rejects a lockfile missing a sibling", () => {
    expect(parsePinned(JSON.stringify({ backend: SHA_B }), REPOS)).toBeNull();
  });
  it("rejects a non-sha value", () => {
    expect(parsePinned(JSON.stringify({ backend: "HEAD", frontend: SHA_F }), REPOS)).toBeNull();
  });
  it("rejects unparseable json rather than throwing", () => {
    expect(parsePinned("{not json", REPOS)).toBeNull();
    expect(parsePinned("", REPOS)).toBeNull();
  });
});

// The lockfile must be stamped wherever the graph is WRITTEN (build and sync both call
// writeArtifacts) — a graph written without a matching lockfile is itself a drift source, which
// would be a fine irony to build into the fix for drift. One shared helper, so the two can't skew.
describe("stampSources", () => {
  it("writes the lockfile beside the graph and returns the pins", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kg-sources-"));
    const pins = await stampSources("/repo", dir, REPOS, fakeGit());
    expect(pins).toEqual({ backend: SHA_B, frontend: SHA_F });
    expect(await readFile(join(dir, SOURCES_FILE), "utf8")).toBe(serializeSources(pins, REPOS));
  });

  it("still stamps when a pin is unpushed — build warns, it does not block", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kg-sources-"));
    const pins = await stampSources("/repo", dir, REPOS, fakeGit({ pushed: { [SHA_B]: false } }));
    expect(pins.backend).toBe(SHA_B);
    expect(parsePinned(await readFile(join(dir, SOURCES_FILE), "utf8"), REPOS)).toEqual(pins);
  });
});

// REQ-KG-GATE-02. The whole decision, pure, taking the raw lockfile text — so check.ts's un-testable
// isMain block shrinks to a file read plus an exit, instead of growing more untested wiring (the
// class of gap §7 already tracks, and the one that let REQ-KG-04 be false).
describe("pinnedGateDecision", () => {
  const actual = { backend: SHA_B, frontend: SHA_F };

  it("passes when the checkout sits exactly on the pins", () => {
    const d = pinnedGateDecision(serializeSources(actual, REPOS), actual, REPOS);
    expect(d.ok).toBe(true);
  });

  it("fails when there is no lockfile at all, and says how to make one", () => {
    const d = pinnedGateDecision(null, actual, REPOS);
    expect(d.ok).toBe(false);
    expect(d.messages.join(" ")).toMatch(/build/i);
  });

  it("fails on a malformed lockfile rather than guessing a pin", () => {
    expect(pinnedGateDecision("{not json", actual, REPOS).ok).toBe(false);
    expect(pinnedGateDecision(JSON.stringify({ backend: SHA_B }), actual, REPOS).ok).toBe(false);
  });

  it("fails naming every repo whose checkout drifted from its pin", () => {
    const d = pinnedGateDecision(serializeSources({ backend: "c".repeat(40), frontend: "d".repeat(40) }, REPOS), actual, REPOS);
    expect(d.ok).toBe(false);
    expect(d.messages.join(" ")).toMatch(/backend/);
    expect(d.messages.join(" ")).toMatch(/frontend/);
  });
});

/**
 * The single-repo case, which a three-repo project can never exercise (founding design §8) and which
 * decides whether "reusable" is real. A project with no siblings has nothing a lockfile could assert:
 * there is no independently-branching repo that could drift out from under the graph. Demanding a
 * lockfile anyway would fail `check --pinned` on a project that is correct by construction — the gate
 * blocking on the absence of a problem it cannot have.
 */
describe("a single-repo project — no siblings, nothing to pin", () => {
  it("reads no sources and never spawns git", async () => {
    let called = 0;
    const countingGit: GitCmd = async () => { called++; return null; };
    expect(await readSources("/repo", SOLO, countingGit)).toEqual({});
    expect(called).toBe(0);
  });

  it("passes the pinned gate with no lockfile at all", () => {
    const d = pinnedGateDecision(null, {}, SOLO);
    expect(d.ok).toBe(true);
    expect(d.messages.join(" ")).toMatch(/single-repo|no sibling/i);
  });

  it("serializes an empty lockfile that round-trips", () => {
    const text = serializeSources({}, SOLO);
    expect(parsePinned(text, SOLO)).toEqual({});
  });
});

describe("sourcesMatch", () => {
  const pinned = { backend: SHA_B, frontend: SHA_F };

  it("reports no mismatch when the checkout sits exactly on the pins", () => {
    expect(sourcesMatch(pinned, { backend: SHA_B, frontend: SHA_F }, REPOS)).toEqual([]);
  });

  it("names each repo whose checkout differs from its pin", () => {
    const drift = sourcesMatch(pinned, { backend: "c".repeat(40), frontend: SHA_F }, REPOS);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatch(/backend/);
  });

  it("reports every drifted repo, not just the first", () => {
    expect(sourcesMatch(pinned, { backend: "c".repeat(40), frontend: "d".repeat(40) }, REPOS)).toHaveLength(2);
  });
});
