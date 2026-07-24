// covers: REQ-KG-05, REQ-KG-SERVE-02
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { ServerResponse } from "node:http";
import { serveEvidence } from "./serve";
import { objectKey, evidenceRef, PRESIGN_TTL_SECONDS } from "./blobStore";
import type { Evidence } from "./config";

/**
 * GET /evidence/<objectKey> — the READ half of the S3 evidence transport (REQ-KG-05).
 *
 * Why a route at all: the bucket is private, so an <img> cannot load it — an <img> sends no auth
 * header, and the durable object URL 403s. Committing a pre-signed URL instead is not an option
 * either, since one would expire months before the index does. So the committed index stores the
 * KEY, and the signature is minted here, per view. Without this route uploads succeed and no
 * evidence image ever renders — a failure that presents as a viewer bug.
 *
 * Confinement is REQ-KG-SERVE-02's, which names this route as its fifth (CEO 2026-07-24) — one step
 * removed from the other four, since with no filesystem read to confine the guard runs in KEY space
 * against the configured bucket prefix. The guard's exhaustive matrix lives beside
 * `evidenceKeyFromPath` in blobStore.test.ts; what is asserted HERE is the pair that only the route
 * can prove: that it actually applies that guard, and that a rejected request is never signed.
 */

const CORS = { "Access-Control-Allow-Origin": "http://127.0.0.1:8971" };
const S3: Evidence = { kind: "blob", bucket: "acme-kg", prefix: "kg-cases", region: "us-east-1" };
const KEY = objectKey(S3 as Extract<Evidence, { kind: "blob" }>, "checkout", "a1b2c3d", "01-start.png");
const SIGNED = `https://acme-kg.s3.us-east-1.amazonaws.com/${KEY}?X-Amz-Signature=deadbeef&X-Amz-Expires=${PRESIGN_TTL_SECONDS}`;

/** Records every key this route asked to have signed — the negative cases assert it stays empty. */
let signed: string[] = [];
const deps = (evidence: Evidence = S3, presign?: (e: never, key: string) => Promise<string>) => ({
  evidence,
  presign: presign ?? (async (_e: never, key: string) => { signed.push(key); return SIGNED; }),
}) as Parameters<typeof serveEvidence>[3];

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1/");
    if (req.method === "GET" && url.pathname.startsWith("/evidence/")) {
      return void serveEvidence(url.pathname, res, CORS, deps());
    }
    res.writeHead(404).end("not found");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

/** Minimal ServerResponse recorder, for calling the handler with raw unnormalised pathnames. */
function fakeRes(): { rec: { status?: number; headers?: Record<string, string>; body?: string }; res: ServerResponse } {
  const rec: { status?: number; headers?: Record<string, string>; body?: string } = {};
  const res = {
    writeHead(status: number, headers?: Record<string, string>) { rec.status = status; rec.headers = headers; return res; },
    end(body?: unknown) { rec.body = body === undefined ? "" : String(body); },
  } as unknown as ServerResponse;
  return { rec, res };
}

describe("GET /evidence/<objectKey>", () => {
  beforeAll(() => { signed = []; });

  it("redirects to a freshly minted signed GET for the key the committed index names", async () => {
    const r = await fetch(`${base}${evidenceRef(KEY)}`, { redirect: "manual" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe(SIGNED);
    expect(r.headers.get("access-control-allow-origin")).toBe(CORS["Access-Control-Allow-Origin"]);
    expect(signed).toEqual([KEY]);
  });

  // The redirect itself must never be cached: the URL behind it dies in PRESIGN_TTL_SECONDS, and a
  // cached 302 would outlive it and render as a broken image with no way for the viewer to recover.
  it("forbids caching the redirect, whose target expires", async () => {
    const r = await fetch(`${base}${evidenceRef(KEY)}`, { redirect: "manual" });
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("404s — and signs NOTHING — for a key the guard rejects", async () => {
    signed = [];
    for (const p of [
      "/evidence/kg-cases/../../secrets/01.png",
      "/evidence/kg-cases/%2e%2e/%2e%2e/secrets/01.png",
      "/evidence/other-bucket-area/checkout/a1/01.png",
      "/evidence/kg-cases/checkout/a1/creds.json",
      "/evidence/kg-cases/checkout/a1/%zz.png",
      "/evidence/",
    ]) {
      const { rec, res } = fakeRes();
      await serveEvidence(p, res, CORS, deps());
      expect(rec.status, p).toBe(404);
      expect(rec.body, p).toBe("not found");
    }
    expect(signed).toEqual([]);
  });

  // A project whose evidence is the github branch or the local device has no bucket to sign against.
  // Answering anything but 404 would imply a destination that was never declared (REQ-KG-05).
  it("404s when the declared destination is not a bucket", async () => {
    for (const evidence of [{ kind: "local" } as const, { kind: "github", repo: "org/repo" } as const]) {
      const { rec, res } = fakeRes();
      await serveEvidence(evidenceRef(KEY), res, CORS, deps(evidence));
      expect(rec.status, evidence.kind).toBe(404);
    }
  });

  it("404s rather than throwing when the aws presign call fails", async () => {
    const { rec, res } = fakeRes();
    await serveEvidence(evidenceRef(KEY), res, CORS, deps(S3, async () => { throw new Error("no credentials"); }));
    expect(rec.status).toBe(404);
    expect(rec.body).toBe("not found");
  });

  // An `aws` that printed nothing (a wrong subcommand, a silently-failing profile) would otherwise
  // redirect the browser to the viewer's own page, which renders as a corrupt image instead of a
  // missing one — the same "confidently wrong beats obviously broken" trap the config parser refuses.
  it("404s when presign returns something that is not a URL", async () => {
    for (const output of ["", "   ", "usage: aws [options]"]) {
      const { rec, res } = fakeRes();
      await serveEvidence(evidenceRef(KEY), res, CORS, deps(S3, async () => output));
      expect(rec.status, JSON.stringify(output)).toBe(404);
    }
  });
});
