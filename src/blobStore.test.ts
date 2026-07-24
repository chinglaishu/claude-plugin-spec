// covers: REQ-KG-05
import { describe, it, expect } from "vitest";
import { objectKey, objectUrl, uploadArgs, listArgs, pruneArgs, presignArgs, PRESIGN_TTL_SECONDS } from "./blobStore";
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
