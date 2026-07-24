// covers: REQ-KG-SERVE-02
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { ServerResponse } from "node:http";
import { serveRegistry, serveSrc } from "./serve";

// Frozen contract (design 1a / 1b.1, Workstream A):
//   GET /registry/<basename>            → 200 text/plain; charset=utf-8 | 404 "not found"
//   GET /src/<workspace-relative-path>  → 200 text/plain; charset=utf-8 | 404 "not found"
// Both read-only, both carry the same CORS header the /shots/ route sends, both
// guarded by isWithinRoot. These tests exercise the exported handlers two ways:
// (1) through a REAL http server + real requests (the serverDisconnect.test.ts
//     pattern — an ephemeral port, NEVER the live :8971 instance), and
// (2) called directly with raw pathnames that a URL parser would normalise away
//     (`/registry/../x`), proving the guards hold even without URL normalisation.
//
// HERMETIC, against a temp fixture workspace — and that is a repair, not a preference.
// This file used to read the REAL checkout: it walked `join(__dirname, "..", "..")` to a workspace
// three levels up and served files out of it. Two consequences the port exposed:
//
//   1. The positive cases were `skipIf(!existsSync(...))`-guarded on the nested repos, so away from a
//      full three-repo checkout they SILENTLY SKIPPED — including the two that covered nested-repo
//      path resolution, the exact code path §10.9 changed.
//   2. Worse, the negative cases passed for the WRONG REASON. "404s extensions outside the allowlist
//      EVEN WHEN THE FILE EXISTS" asserted a 404 for `requirements.txt` — but with no checkout there
//      is no requirements.txt, so it 404s as missing and proves nothing about the allowlist. A test
//      that cannot distinguish "correctly refused" from "not there" is not testing its claim.
//
// A fixture fixes both: every file the negative cases refuse actually EXISTS, so a 404 can only mean
// the guard fired. The names are anonymous because src/ may not name a consuming project (REQ-0), and
// nothing here ever needed a specific one — any nested-repo workspace exercises the same paths.

const CORS = { "Access-Control-Allow-Origin": "http://127.0.0.1:8971" };
const REGISTRY = "billing.features.yaml";
const REGISTRY_BODY = "- id: bil.publish\n  label: Publish\n  flow: bil\n  paths: []\n";
const GUARD_BODY = "export function isWithinRoot() { return true; }\n";
const MAIN_PY = "app = 1\n";

let root: string;
let featuresDir: string;
let server: http.Server;
let base: string;

/** Every file the suite serves or refuses. Anything a negative case must refuse is written for real,
 *  so a 404 proves the guard fired rather than the file being absent. */
async function buildFixture(): Promise<string> {
  const r = await mkdtemp(join(tmpdir(), "kg-provenance-"));
  const put = async (rel: string, body: string) => {
    const abs = join(r, rel);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, body);
  };
  // allowlisted extensions, in the root repo and in each nested one
  await put("tools/kg/src/pathGuard.ts", GUARD_BODY);
  await put("svc_frontend/e2e/features/" + REGISTRY, REGISTRY_BODY);
  await put("svc_backend/main.py", MAIN_PY);
  // real files with NON-allowlisted extensions — the allowlist cases depend on these existing
  await put("svc_backend/requirements.txt", "fastapi\n");
  await put("tools/kg/viewer.template.html", "<html></html>\n");
  await put("svc_frontend/package-lock.json.bak", "{}\n");
  // real dotfiles / dot-dirs
  await put("svc_frontend/.env", "SECRET=1\n");
  await put(".env", "SECRET=1\n");
  await put("svc_backend/.github/copilot-instructions.md", "# instructions\n");
  await put(".kg-serve.lock", "8971\n");
  // real *.local.* credential-convention files, with allowlisted extensions
  await put("svc_frontend/playwright/e2e.accounts.local.json", '{"password":"hunter2"}\n');
  await put("svc_frontend/settings.local.yaml", "password: hunter2\n");
  await put("some.local.dir/readme.md", "# nothing\n");
  // a real traversal TARGET, so an escape that worked would return 200 and fail loudly
  await put("package.json", '{"name":"fixture"}\n');
  // a real directory, for the no-listings case
  await mkdir(join(r, "svc_frontend/e2e"), { recursive: true });
  return r;
}

beforeAll(async () => {
  root = await buildFixture();
  featuresDir = join(root, "svc_frontend", "e2e", "features");
  // Mirror serve.ts's dispatch exactly: URL-parse req.url, route on the pathname prefix. The roots
  // are injected — the same seam serve.ts's own defaults use, pointed at the fixture.
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1/");
    if (req.method === "GET" && url.pathname.startsWith("/registry/")) return void serveRegistry(url.pathname, res, CORS, featuresDir);
    if (req.method === "GET" && url.pathname.startsWith("/src/")) return void serveSrc(url.pathname, res, CORS, root);
    res.writeHead(404).end("not found");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await rm(root, { recursive: true, force: true });
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
  it("serves a *.features.yaml from the features dir as text/plain with CORS", async () => {
    const r = await fetch(`${base}/registry/${REGISTRY}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(r.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:8971");
    expect(await r.text()).toBe(await readFile(join(featuresDir, REGISTRY), "utf8"));
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
    expect((await fetch(`${base}/registry/sub%2F${REGISTRY}`)).status).toBe(404);
    expect((await fetch(`${base}/registry/..%5C..%5C${REGISTRY}`)).status).toBe(404);
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
      await serveRegistry(p, res, CORS, featuresDir);
      expect(rec.status, p).toBe(404);
      expect(rec.body, p).toBe("not found");
    }
  });
});

describe("GET /src/<workspace-relative-path> — source provenance route", () => {
  it("serves a root-repo file (no nested-repo prefix) as text/plain with CORS", async () => {
    const r = await fetch(`${base}/src/tools/kg/src/pathGuard.ts`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(r.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:8971");
    expect(await r.text()).toBe(GUARD_BODY);
  });

  // The two cases that used to skip themselves away. A nested repo is just a leading subdir of the
  // workspace-relative path, which is precisely why the per-repo root switch was removable (§10.9).
  it("resolves a path inside a nested repo", async () => {
    const r = await fetch(`${base}/src/svc_frontend/e2e/features/${REGISTRY}`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(REGISTRY_BODY);
  });

  it("resolves a path inside a second, differently-named nested repo", async () => {
    const r = await fetch(`${base}/src/svc_backend/main.py`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(MAIN_PY);
  });

  it("404s extensions outside the allowlist even when the file exists", async () => {
    // .txt/.html/.bak are REAL files in the fixture but NOT allowlisted — so a 404 here can only
    // mean the allowlist refused them, never that they were missing.
    expect((await fetch(`${base}/src/svc_backend/requirements.txt`)).status).toBe(404);
    expect((await fetch(`${base}/src/tools/kg/viewer.template.html`)).status).toBe(404);
    expect((await fetch(`${base}/src/svc_frontend/package-lock.json.bak`)).status).toBe(404);
  });

  it("404s dotfiles and dot-directories at any segment position", async () => {
    expect((await fetch(`${base}/src/svc_frontend/.env`)).status).toBe(404);
    expect((await fetch(`${base}/src/.env`)).status).toBe(404);
    expect((await fetch(`${base}/src/svc_backend/.github/copilot-instructions.md`)).status).toBe(404);
    expect((await fetch(`${base}/src/.kg-serve.lock`)).status).toBe(404);
  });

  it("404s *.local.* credential-convention files even with an allowlisted extension", async () => {
    // e2e.accounts.local.json is the gitignored-file convention holding a shared E2E password — the
    // `.local.` infix is a credentials-stay-local marker, so the route must refuse it BY NAME rather
    // than rely on gitignore status. All three exist in the fixture. [CC6.1]
    expect((await fetch(`${base}/src/svc_frontend/playwright/e2e.accounts.local.json`)).status).toBe(404);
    expect((await fetch(`${base}/src/svc_frontend/settings.local.yaml`)).status).toBe(404);
    expect((await fetch(`${base}/src/some.local.dir/readme.md`)).status).toBe(404);
  });

  it("404s missing files and bare directories (no listings)", async () => {
    expect((await fetch(`${base}/src/tools/kg/src/definitely-missing.ts`)).status).toBe(404);
    expect((await fetch(`${base}/src/svc_frontend/e2e`)).status).toBe(404);
    expect((await fetch(`${base}/src/`)).status).toBe(404);
  });

  it("404s traversal, backslash, absolute-path and drive-letter attempts", async () => {
    // package.json EXISTS at the fixture root, so a traversal that escaped would 200, not 404.
    expect((await fetch(`${base}/src/%2e%2e%2fsecret.ts`)).status).toBe(404);
    expect((await fetch(`${base}/src/svc_frontend/%2e%2e/%2e%2e/package.json`)).status).toBe(404);
    expect((await fetch(`${base}/src/svc_frontend%5C..%5C..%5Cpackage.json`)).status).toBe(404);
    expect((await fetch(`${base}/src/C:/Windows/evil.ts`)).status).toBe(404);
    expect((await rawGet("/src/../package.json")).status).toBe(404);
  });

  it("guards hold when the handler is called directly with unnormalised pathnames", async () => {
    for (const p of [
      "/src/../package.json",
      "/src/..%2F..%2Fpackage.json",
      "/src/svc_frontend/../../etc/passwd.md",
      "/src/svc_frontend\\e2e\\features\\x.yaml",
      "/src//tools/kg/src/pathGuard.ts", // empty segment
      "/src/%zz.ts", // malformed percent-encoding must not throw
    ]) {
      const { rec, res } = fakeRes();
      await serveSrc(p, res, CORS, root);
      expect(rec.status, p).toBe(404);
      expect(rec.body, p).toBe("not found");
    }
  });
});
