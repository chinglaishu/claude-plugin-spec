// covers: REQ-KG-05, REQ-KG-SERVE-02
import { describe, it, expect } from "vitest";
import {
  objectKey, objectUrl, uploadArgs, listArgs, pruneArgs, presignArgs, parseShaDirs,
  keyOf, evidenceRef, evidenceKeyFromPath, blobAdapter, EVIDENCE_ROUTE, PRESIGN_TTL_SECONDS,
} from "./blobStore";
import { runUpload, blobRef, type ShotDirEntry, type FsLike } from "./shotsUpload";
import type { Evidence } from "./config";

/**
 * The S3 evidence transport, tested as COMMANDS rather than as uploads — the same idiom as
 * treeKillCommand and buildRunArgs, and for the same reason: the subprocess is the untestable part,
 * the argv is where the bugs live.
 *
 * Credentials never appear here. They resolve at run time from the standard AWS chain, so every
 * command below is safe to assert on verbatim (REQ-KG-05).
 */
const S3: Extract<Evidence, { kind: "blob" }> = { kind: "blob", bucket: "acme-kg", prefix: "kg-cases", region: "us-east-1" };
const ROOT: Extract<Evidence, { kind: "blob" }> = { kind: "blob", bucket: "acme-kg", prefix: "", region: "us-east-1" };

describe("objectKey — mirrors the github branch layout so destinations stay comparable", () => {
  it("composes prefix/case/sha/file", () => {
    expect(objectKey(S3, "checkout", "a1b2c3d", "01-start.png")).toBe("kg-cases/checkout/a1b2c3d/01-start.png");
  });

  it("omits the prefix segment when the bucket root is used", () => {
    expect(objectKey(ROOT, "checkout", "a1b2c3d", "01-start.png")).toBe("checkout/a1b2c3d/01-start.png");
  });

  // Bare ids are lower-cased everywhere in the graph; a key that disagreed would make the viewer's
  // lookup miss silently rather than loudly.
  it("lower-cases the case id, matching the graph's bare-id convention", () => {
    expect(objectKey(S3, "CheckOut", "a1b2c3d", "01.png")).toBe("kg-cases/checkout/a1b2c3d/01.png");
  });
});

describe("objectUrl — durable address, composed from coordinates", () => {
  it("uses the regional virtual-hosted form", () => {
    expect(objectUrl(S3, "kg-cases/checkout/a1/01.png")).toBe(
      "https://acme-kg.s3.us-east-1.amazonaws.com/kg-cases/checkout/a1/01.png",
    );
  });
});

describe("aws argv", () => {
  it("uploads a single object with its region", () => {
    expect(uploadArgs(S3, "/tmp/01.png", "kg-cases/checkout/a1/01.png")).toEqual([
      "s3", "cp", "/tmp/01.png", "s3://acme-kg/kg-cases/checkout/a1/01.png", "--region", "us-east-1",
    ]);
  });

  it("lists a case's shas so pruning and index rebuilding still work", () => {
    expect(listArgs(S3, "checkout")).toEqual([
      "s3", "ls", "s3://acme-kg/kg-cases/checkout/", "--region", "us-east-1",
    ]);
  });

  it("prunes one sha directory recursively", () => {
    expect(pruneArgs(S3, "checkout", "old1234")).toEqual([
      "s3", "rm", "s3://acme-kg/kg-cases/checkout/old1234/", "--recursive", "--region", "us-east-1",
    ]);
  });

  // The bucket stays PRIVATE. A browser <img> cannot send an auth header, so serve.ts mints a
  // short-lived signed GET on demand. Expiry is a feature here, not the flaw it was for upload:
  // the URL is generated per view and never committed.
  it("presigns a read with a short ttl", () => {
    expect(presignArgs(S3, "kg-cases/checkout/a1/01.png")).toEqual([
      "s3", "presign", "s3://acme-kg/kg-cases/checkout/a1/01.png",
      "--expires-in", String(PRESIGN_TTL_SECONDS), "--region", "us-east-1",
    ]);
  });

  it("keeps the presign ttl short enough that a leaked url dies quickly", () => {
    expect(PRESIGN_TTL_SECONDS).toBeLessThanOrEqual(900);
  });
});

describe("parseShaDirs — reads sha dirs out of `aws s3 ls` output", () => {
  it("takes the PRE entries and drops their trailing slash", () => {
    const out = ["                           PRE a1b2c3d/", "                           PRE 9f8e7d6/"].join("\n");
    expect(parseShaDirs(out)).toEqual(["a1b2c3d", "9f8e7d6"]);
  });

  it("ignores object lines, which are files rather than sha dirs", () => {
    const out = ["2026-07-24 12:00:00       1234 stray.png", "                           PRE a1b2c3d/"].join("\n");
    expect(parseShaDirs(out)).toEqual(["a1b2c3d"]);
  });

  it("returns nothing for an empty listing (a case never uploaded before)", () => {
    expect(parseShaDirs("")).toEqual([]);
    expect(parseShaDirs("\n  \n")).toEqual([]);
  });
});

describe("keyOf — the seam between runUpload's remote path and an object key", () => {
  // `runUpload` composes `kg-cases/<case>/<sha>/<file>` — the GitHub branch's layout, and the ONLY
  // shape either adapter is handed. S3 roots the same tree at the CONFIGURED prefix instead, so the
  // whole mapping is: drop the branch root, prepend the prefix. Asserted against `objectKey` rather
  // than a literal, because the thing that must hold is that the two agree — a key composed one way
  // that disagreed with the other would upload to a path the index never points at.
  it("agrees with objectKey for the same case/sha/file", () => {
    expect(keyOf(S3, "kg-cases/checkout/a1b2c3d/01-start.png")).toBe(
      objectKey(S3, "checkout", "a1b2c3d", "01-start.png"),
    );
  });

  it("drops the segment entirely at the bucket root", () => {
    expect(keyOf(ROOT, "kg-cases/checkout/a1b2c3d/01-start.png")).toBe("checkout/a1b2c3d/01-start.png");
  });
});

describe("evidenceRef / evidenceKeyFromPath — what the committed index stores, and how it is read back", () => {
  // The index stores the KEY behind serve.ts's route, never a URL: a pre-signed URL would expire
  // long before the committed index does, and the bucket is private so the durable objectUrl cannot
  // load in an <img>. One constant owns both ends, so the writer and the reader cannot drift.
  it("addresses a shot through the serve route, carrying the key verbatim", () => {
    expect(evidenceRef("kg-cases/checkout/a1/01.png")).toBe("/evidence/kg-cases/checkout/a1/01.png");
    expect(evidenceRef("x.png").startsWith(EVIDENCE_ROUTE)).toBe(true);
  });

  it("round-trips a key written by the uploader back out of a request path", () => {
    const key = objectKey(S3, "CheckOut", "a1b2c3d", "01-start.png");
    expect(evidenceKeyFromPath(S3, evidenceRef(key))).toBe(key);
  });

  // REQ-KG-SERVE-02's confinement, in key space rather than path space: a request can only ever
  // name an object under the CONFIGURED prefix, so the route can never be used as a generic signer
  // for the rest of someone's bucket.
  it("refuses a key outside the configured prefix, including a sibling that merely shares its name", () => {
    expect(evidenceKeyFromPath(S3, "/evidence/other/checkout/a1/01.png")).toBeNull();
    expect(evidenceKeyFromPath(S3, "/evidence/kg-cases-evil/checkout/a1/01.png")).toBeNull();
  });

  it("refuses traversal, raw and URL-encoded", () => {
    for (const p of [
      "/evidence/kg-cases/../../secrets/01.png",
      "/evidence/kg-cases/%2e%2e/%2e%2e/secrets/01.png",
      "/evidence/kg-cases/checkout/..%2Fa1/01.png",
    ]) expect(evidenceKeyFromPath(S3, p), p).toBeNull();
  });

  it("refuses backslashes, drive letters, dotfiles, empty segments and malformed percent-encoding", () => {
    for (const p of [
      "/evidence/kg-cases\\checkout\\a1\\01.png",
      "/evidence/kg-cases/C:/a1/01.png",
      "/evidence/kg-cases/.env/01.png",
      "/evidence/kg-cases//a1/01.png",
      "/evidence/kg-cases/checkout/%zz.png",
      "/evidence/",
      "/shots/kg-cases/checkout/a1/01.png",
    ]) expect(evidenceKeyFromPath(S3, p), p).toBeNull();
  });

  it("refuses a non-image object — evidence is screenshots, and nothing else needs signing", () => {
    expect(evidenceKeyFromPath(S3, "/evidence/kg-cases/checkout/a1/creds.json")).toBeNull();
    expect(evidenceKeyFromPath(S3, "/evidence/kg-cases/checkout/a1/shot.jpeg")).toBe("kg-cases/checkout/a1/shot.jpeg");
  });

  it("treats the bucket root as the root when no prefix is configured", () => {
    expect(evidenceKeyFromPath(ROOT, "/evidence/checkout/a1/01.png")).toBe("checkout/a1/01.png");
    expect(evidenceKeyFromPath(ROOT, "/evidence/../01.png")).toBeNull();
  });
});

/**
 * The adapter — the only part of the S3 transport that touches a subprocess, tested through an
 * injected runner so the argv stays asserted verbatim and no test ever shells out to `aws`.
 *
 * All three assertions below are traps found by READING `shotsUpload.ts`'s github adapter rather
 * than by guessing at the aws equivalent; each one fails in a way that looks like success.
 */
describe("blobAdapter", () => {
  const spy = () => {
    const calls: string[][] = [];
    const wrote: Buffer[] = [];
    const warnings: string[] = [];
    return { calls, wrote, warnings };
  };
  const deps = (s: ReturnType<typeof spy>, aws?: (args: string[]) => Promise<string>) => ({
    aws: aws ?? (async (args: string[]) => { s.calls.push(args); return ""; }),
    withRawTempFile: async <T>(bytes: Buffer, fn: (path: string) => Promise<T>): Promise<T> => {
      s.wrote.push(bytes);
      return fn(`/tmp/kg-blob-${s.wrote.length}.png`);
    },
    warn: (m: string) => { s.warnings.push(m); },
  });

  // TRAP 1. `withTempBodyFile` in shotsUpload.ts is a `gh api --input` JSON body writer, NOT a
  // raw-bytes writer. Reusing it here would upload the JSON wrapper in place of the PNG — and the
  // upload would still exit 0, so the bucket would fill with plausible-looking garbage.
  it("hands the PNG bytes themselves to the temp file, and uploads that exact file", async () => {
    const s = spy();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    await blobAdapter(S3, deps(s)).putFile("kg-cases/add-3/abc1234/01-x.png", png);
    expect(s.wrote[0]).toEqual(png);
    expect(s.calls[0]).toEqual(uploadArgs(S3, "/tmp/kg-blob-1.png", "kg-cases/add-3/abc1234/01-x.png"));
  });

  // TRAP 2. putFile/deleteDir are handed a repo-relative remotePath, not a case id — the builders
  // compose from (caseId, sha, filename), which fits listCaseShas and neither of these.
  it("prunes a sha dir addressed as a remote path, under the configured prefix", async () => {
    const s = spy();
    await blobAdapter(S3, deps(s)).deleteDir("kg-cases/add-3/old1234");
    expect(s.calls[0]).toEqual(pruneArgs(S3, "add-3", "old1234"));
  });

  // TRAP 3. `aws s3 ls` EXITS NON-ZERO on a prefix with no objects, which is exactly the state of
  // every case's first upload. A throw here would fail the run before a single file was written.
  it("reports no existing shas when the case has never been uploaded (`aws s3 ls` exits non-zero)", async () => {
    const s = spy();
    const gh = blobAdapter(S3, deps(s, async () => { throw new Error("An error occurred (NoSuchKey)"); }));
    await expect(gh.listCaseShas("brand-new")).resolves.toEqual([]);
  });

  it("lists a case's existing shas from the aws listing", async () => {
    const s = spy();
    const gh = blobAdapter(S3, deps(s, async (args) => {
      s.calls.push(args);
      return "                           PRE a1b2c3d/\n                           PRE 9f8e7d6/\n";
    }));
    expect(await gh.listCaseShas("checkout")).toEqual(["a1b2c3d", "9f8e7d6"]);
    expect(s.calls[0]).toEqual(listArgs(S3, "checkout"));
  });

  // Pruning is best-effort in the github adapter for a reason: evidence that uploaded fine must not
  // be reported as a failed run because an old dir could not be removed.
  it("warns rather than throwing when a prune fails, so a good upload is never failed by it", async () => {
    const s = spy();
    const gh = blobAdapter(S3, deps(s, async () => { throw new Error("AccessDenied"); }));
    await expect(gh.deleteDir("kg-cases/add-3/old1234")).resolves.toBeUndefined();
    expect(s.warnings.join(" ")).toContain("AccessDenied");
  });

  // End to end through the real orchestrator: this is what pins the `kg-cases/…` layout literal in
  // runUpload to keyOf's understanding of it. If either side moved, the uploaded key and the key the
  // index points at would silently disagree.
  it("drives a real runUpload — uploaded key, pruned dir and index reference all agree", async () => {
    const s = spy();
    const fs: FsLike & { readFile: NonNullable<FsLike["readFile"]> } = {
      listDir: async () => [],
      readFile: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    };
    const local: ShotDirEntry[] = [{ caseId: "ADD-3", dir: "/shots/ADD-3", files: ["add3-1-rent-roll.png"] }];
    const gh = blobAdapter(S3, deps(s, async (args) => {
      s.calls.push(args);
      return args[1] === "ls" ? "                           PRE sha3/\n                           PRE sha2/\n                           PRE sha1/\n" : "";
    }));
    const result = await runUpload({
      ref: blobRef(S3), local, graphCaseIds: new Set(["add-3"]), sha: "shaNEW",
      dryRun: false, fs, gh, now: "2026-07-24T00:00:00.000Z",
    });

    const key = objectKey(S3, "add-3", "shaNEW", "01-add3-1-rent-roll.png");
    expect(s.calls[0]).toEqual(uploadArgs(S3, "/tmp/kg-blob-1.png", key));
    expect(s.calls).toContainEqual(pruneArgs(S3, "add-3", "sha1"));
    expect(s.calls).not.toContainEqual(pruneArgs(S3, "add-3", "sha2"));
    // The committed index points at the key that was actually uploaded — through the route, so the
    // signature can be minted per view rather than frozen into a file.
    expect(result.index.cases["add-3"].shots["add3-1-rent-roll.png"]).toBe(evidenceRef(key));
    expect(evidenceKeyFromPath(S3, result.index.cases["add-3"].shots["add3-1-rent-roll.png"])).toBe(key);
    // Nothing that expires, and no bucket host, reaches the committed file.
    expect(JSON.stringify(result.index)).not.toContain("amazonaws.com");
    expect(result.index.branch).toBeUndefined();
  });
});
