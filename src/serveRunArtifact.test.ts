import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { ServerResponse } from "node:http";
import { serveRunArtifact } from "./serve";

// GET /run-artifacts/<runId>/<file> — read-only failure screenshots for a LIVE run (Feature 2a).
// Same path-traversal contract as /shots/ (serveShot) and the provenance routes: resolve <file>
// under the per-run temp dir and isWithinRoot-check before reading. This test exercises the
// exported handler through a REAL http server + real requests (the serveProvenance.test.ts /
// serveGraph.test.ts ephemeral-port pattern, NEVER the live :8971 instance), with an injectable
// runId->dir map so it never depends on the live RUN_ARTIFACT_DIRS registry.

const CORS = { "Access-Control-Allow-Origin": "http://127.0.0.1:8971" };

let server: http.Server;
let base: string;
let dir: string;
let dirs: Map<string, string>;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "kg-run-artifact-test-"));
  await writeFile(join(dir, "test-failed-1.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG magic bytes
  // A REAL sentinel file one level above the registered run dir — proves the traversal guard is
  // load-bearing (not vacuously 404ing because the escaped path happens not to exist).
  await writeFile(join(dir, "..", "kg-run-artifact-traversal-sentinel.txt"), "secret");
  dirs = new Map([["run-abc", dir]]);
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1/");
    if (req.method === "GET" && url.pathname.startsWith("/run-artifacts/")) {
      return void serveRunArtifact(url.pathname, res, CORS, dirs);
    }
    res.writeHead(404).end("not found");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await rm(dir, { recursive: true, force: true });
  await rm(join(dir, "..", "kg-run-artifact-traversal-sentinel.txt"), { force: true });
});

/** GET via http.request with a RAW path (fetch/URL would normalise `..` segments away). */
function rawGet(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path, method: "GET" },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

/** Minimal ServerResponse recorder for calling the handler directly with raw pathnames. */
function fakeRes(): { rec: { status?: number; headers?: Record<string, string>; body?: string }; res: ServerResponse } {
  const rec: { status?: number; headers?: Record<string, string>; body?: string } = {};
  const res = {
    writeHead(status: number, headers?: Record<string, string>) { rec.status = status; rec.headers = headers; return res; },
    end(body?: unknown) { rec.body = body === undefined ? "" : String(body); },
  } as unknown as ServerResponse;
  return { rec, res };
}

describe("GET /run-artifacts/<runId>/<file>", () => {
  it("serves a screenshot from the run's registered temp dir as image/png with CORS", async () => {
    const r = await fetch(`${base}/run-artifacts/run-abc/test-failed-1.png`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("access-control-allow-origin")).toBe(CORS["Access-Control-Allow-Origin"]);
  });

  it("404s an unknown runId", async () => {
    const r = await fetch(`${base}/run-artifacts/no-such-run/test-failed-1.png`);
    expect(r.status).toBe(404);
    expect(await r.text()).toBe("not found");
  });

  it("404s a missing file inside a known run dir", async () => {
    const r = await fetch(`${base}/run-artifacts/run-abc/does-not-exist.png`);
    expect(r.status).toBe(404);
  });

  it("404s a malformed pathname with no <runId>/<file> separator", async () => {
    const r = await fetch(`${base}/run-artifacts/run-abc`);
    expect(r.status).toBe(404);
  });

  it("404s malformed percent-encoding without throwing", async () => {
    const r = await fetch(`${base}/run-artifacts/run-abc/%zz.png`);
    expect(r.status).toBe(404);
  });

  it("404s URL-encoded traversal (%2e%2e%2f) attempting to escape the run dir to a REAL sibling file", async () => {
    const r = await fetch(`${base}/run-artifacts/run-abc/%2e%2e%2fkg-run-artifact-traversal-sentinel.txt`);
    expect(r.status).toBe(404);
    expect(await r.text()).toBe("not found");
  });

  it("404s a raw ../ traversal path reaching a REAL sibling file (unnormalised by a URL parser)", async () => {
    const r = await rawGet("/run-artifacts/run-abc/../kg-run-artifact-traversal-sentinel.txt");
    expect(r.status).toBe(404);
  });

  it("guards hold when the handler is called directly with unnormalised pathnames reaching a REAL sibling file", async () => {
    for (const p of [
      "/run-artifacts/run-abc/../kg-run-artifact-traversal-sentinel.txt",
      "/run-artifacts/run-abc/..%2Fkg-run-artifact-traversal-sentinel.txt",
      "/run-artifacts/", // empty runId/file
      "/run-artifacts/run-abc/%zz.png", // malformed percent-encoding must not throw
    ]) {
      const { rec, res } = fakeRes();
      await serveRunArtifact(p, res, CORS, dirs);
      expect(rec.status, p).toBe(404);
      expect(rec.body, p).toBe("not found");
    }
  });
});
