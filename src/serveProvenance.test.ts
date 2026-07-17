import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import type { ServerResponse } from "node:http";
import { serveRegistry, serveSrc } from "./serve";

// Frozen contract (design 1a / 1b.1, Workstream A):
//   GET /registry/<basename>           → 200 text/plain; charset=utf-8 | 404 "not found"
//   GET /src/<repo-relative-path>      → 200 text/plain; charset=utf-8 | 404 "not found"
// Both read-only, both carry the same CORS header the /shots/ route sends, both
// guarded by isWithinRoot. These tests exercise the exported handlers two ways:
// (1) through a REAL http server + real requests (the serverDisconnect.test.ts
//     pattern — an ephemeral port, NEVER the live :8971 instance), and
// (2) called directly with raw pathnames that a URL parser would normalise away
//     (`/registry/../x`), proving the guards hold even without URL normalisation.

const toolDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = process.env.KG_REPO_ROOT ?? join(toolDir, "..", "..");
const featuresDir = join(repoRoot, "dojostack_frontend", "e2e", "features");
const CORS = { "Access-Control-Allow-Origin": "http://127.0.0.1:8971" };

// A real registry file that exists on every checkout of this branch.
const REAL_REGISTRY = "house-view.features.yaml";

// The positive-path provenance cases read files inside the NESTED backend/
// frontend repos. CI on dojostack_main alone does not check those out (same
// reason knowledge-graph.yml keeps `npm run check` report-only), so guard the
// nested-repo assertions on the directory actually being present. Local dev and
// any future CI that checks out the nested repos still exercise them fully.
const hasFeatures = existsSync(featuresDir);
const hasBackend = existsSync(join(repoRoot, "dojostack_backend"));

let server: http.Server;
let base: string;

beforeAll(async () => {
  // Mirror serve.ts's dispatch exactly: URL-parse req.url, route on the pathname prefix.
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1/");
    if (req.method === "GET" && url.pathname.startsWith("/registry/")) return void serveRegistry(url.pathname, res, CORS);
    if (req.method === "GET" && url.pathname.startsWith("/src/")) return void serveSrc(url.pathname, res, CORS);
    res.writeHead(404).end("not found");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

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

/** Minimal ServerResponse recorder for calling the handlers directly with raw pathnames. */
function fakeRes(): { rec: { status?: number; headers?: Record<string, string>; body?: string }; res: ServerResponse } {
  const rec: { status?: number; headers?: Record<string, string>; body?: string } = {};
  const res = {
    writeHead(status: number, headers?: Record<string, string>) { rec.status = status; rec.headers = headers; return res; },
    end(body?: unknown) { rec.body = body === undefined ? "" : String(body); },
  } as unknown as ServerResponse;
  return { rec, res };
}

describe("GET /registry/<basename> — registry provenance route", () => {
  it.skipIf(!hasFeatures)("serves a real *.features.yaml from the features dir as text/plain with CORS", async () => {
    const r = await fetch(`${base}/registry/${REAL_REGISTRY}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(r.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:8971");
    expect(await r.text()).toBe(await readFile(join(featuresDir, REAL_REGISTRY), "utf8"));
  });

  it("404s a missing registry file (plain 'not found', CORS still present)", async () => {
    const r = await fetch(`${base}/registry/no-such-thing.features.yaml`);
    expect(r.status).toBe(404);
    expect(r.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:8971");
    expect(await r.text()).toBe("not found");
  });

  it("404s a basename that does not end in .features.yaml", async () => {
    expect((await fetch(`${base}/registry/package.json`)).status).toBe(404);
    // suffix must be an EXACT extension match on a named file, not the bare suffix itself
    expect((await fetch(`${base}/registry/features.yaml`)).status).toBe(404);
  });

  it("404s URL-encoded traversal (%2e%2e%2f) and encoded slashes/backslashes", async () => {
    expect((await fetch(`${base}/registry/%2e%2e%2fpackage.json`)).status).toBe(404);
    expect((await fetch(`${base}/registry/%2e%2e%2f%2e%2e%2fpackage.json`)).status).toBe(404);
    expect((await fetch(`${base}/registry/sub%2F${REAL_REGISTRY}`)).status).toBe(404);
    expect((await fetch(`${base}/registry/..%5C..%5C${REAL_REGISTRY}`)).status).toBe(404);
  });

  it("never serves a raw ../ traversal path through the registry route", async () => {
    const r = await rawGet("/registry/../../package.json");
    expect(r.status).toBe(404);
  });

  it("guards hold when the handler is called directly with unnormalised pathnames", async () => {
    for (const p of [
      "/registry/../package.json",
      "/registry/..\\..\\secret.features.yaml",
      "/registry/sub/dir.features.yaml",
      "/registry/", // empty basename
      "/registry/%zz.features.yaml", // malformed percent-encoding must not throw
    ]) {
      const { rec, res } = fakeRes();
      await serveRegistry(p, res, CORS);
      expect(rec.status, p).toBe(404);
      expect(rec.body, p).toBe("not found");
    }
  });
});

describe("GET /src/<repo-relative-path> — source provenance route", () => {
  it("serves a main-repo file (no dojostack_* prefix) as text/plain with CORS", async () => {
    const r = await fetch(`${base}/src/tools/knowledge-graph/src/pathGuard.ts`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(r.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:8971");
    expect(await r.text()).toBe(await readFile(join(repoRoot, "tools", "knowledge-graph", "src", "pathGuard.ts"), "utf8"));
  });

  it.skipIf(!hasFeatures)("resolves the dojostack_frontend/ prefix inside the nested frontend repo", async () => {
    const rel = `dojostack_frontend/e2e/features/${REAL_REGISTRY}`;
    const r = await fetch(`${base}/src/${rel}`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(await readFile(join(repoRoot, rel), "utf8"));
  });

  it.skipIf(!hasBackend)("resolves the dojostack_backend/ prefix inside the nested backend repo", async () => {
    const r = await fetch(`${base}/src/dojostack_backend/main.py`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(await readFile(join(repoRoot, "dojostack_backend", "main.py"), "utf8"));
  });

  it("404s extensions outside the allowlist even when the file exists", async () => {
    // .lock/.txt/.html are real files in these repos but NOT allowlisted
    expect((await fetch(`${base}/src/dojostack_backend/requirements.txt`)).status).toBe(404);
    expect((await fetch(`${base}/src/tools/knowledge-graph/viewer.template.html`)).status).toBe(404);
    expect((await fetch(`${base}/src/dojostack_frontend/package-lock.json.bak`)).status).toBe(404);
  });

  it("404s dotfiles and dot-directories at any segment position", async () => {
    expect((await fetch(`${base}/src/dojostack_frontend/.env`)).status).toBe(404);
    expect((await fetch(`${base}/src/.env`)).status).toBe(404);
    expect((await fetch(`${base}/src/dojostack_backend/.github/copilot-instructions.md`)).status).toBe(404);
    expect((await fetch(`${base}/src/.kg-serve.lock`)).status).toBe(404);
  });

  it("404s *.local.* credential-convention files even with an allowlisted extension", async () => {
    // e2e.accounts.local.json is the gitignored file holding the shared E2E
    // password — the `.local.` infix is the repo's credentials-stay-local
    // convention, so the route must refuse it by name, not rely on gitignore.
    expect((await fetch(`${base}/src/dojostack_frontend/playwright/e2e.accounts.local.json`)).status).toBe(404);
    expect((await fetch(`${base}/src/dojostack_frontend/settings.local.yaml`)).status).toBe(404);
    expect((await fetch(`${base}/src/some.local.dir/readme.md`)).status).toBe(404);
  });

  it("404s missing files and bare directories (no listings)", async () => {
    expect((await fetch(`${base}/src/tools/knowledge-graph/src/definitely-missing.ts`)).status).toBe(404);
    expect((await fetch(`${base}/src/dojostack_frontend/e2e`)).status).toBe(404);
    expect((await fetch(`${base}/src/`)).status).toBe(404);
  });

  it("404s traversal, backslash, absolute-path and drive-letter attempts", async () => {
    expect((await fetch(`${base}/src/%2e%2e%2fsecret.ts`)).status).toBe(404);
    expect((await fetch(`${base}/src/dojostack_frontend/%2e%2e/%2e%2e/tools/knowledge-graph/src/pathGuard.ts`)).status).toBe(404);
    expect((await fetch(`${base}/src/dojostack_frontend%5C..%5C..%5Cpackage.json`)).status).toBe(404);
    expect((await fetch(`${base}/src/C:/Windows/evil.ts`)).status).toBe(404);
    expect((await rawGet("/src/../tools/knowledge-graph/src/pathGuard.ts")).status).toBe(404);
  });

  it("guards hold when the handler is called directly with unnormalised pathnames", async () => {
    for (const p of [
      "/src/../package.json",
      "/src/..%2F..%2Fpackage.json",
      "/src/dojostack_frontend/../../etc/passwd.md",
      "/src/dojostack_frontend\\e2e\\features\\x.yaml",
      "/src//tools/knowledge-graph/src/pathGuard.ts", // empty segment
      "/src/%zz.ts", // malformed percent-encoding must not throw
    ]) {
      const { rec, res } = fakeRes();
      await serveSrc(p, res, CORS);
      expect(rec.status, p).toBe(404);
      expect(rec.body, p).toBe("not found");
    }
  });
});
