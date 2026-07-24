// covers: REQ-KG-SERVE-03
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { serveGraph } from "./serve";

// /api/graph serves the CURRENT knowledge-graph.json fresh from disk on every
// request (the viewer re-fetches it after a rebuild). This test exercises the
// exported handler through a REAL http server + real requests — the
// serveProvenance.test.ts / serverDisconnect.test.ts ephemeral-port pattern,
// NEVER the live :8971 instance — reading from a TEMP graph file so it neither
// depends on nor mutates the committed graph.

const CORS = { "Access-Control-Allow-Origin": "http://127.0.0.1:8971" };

let server: http.Server;
let base: string;
let dir: string;
let graphPath: string;
const GRAPH_V1 = { nodes: [{ id: "a" }], edges: [], issues: [], generatedAt: "v1" };
const GRAPH_V2 = { nodes: [{ id: "a" }, { id: "b" }], edges: [], issues: [], generatedAt: "v2" };

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "kg-graph-"));
  graphPath = join(dir, "knowledge-graph.json");
  await writeFile(graphPath, JSON.stringify(GRAPH_V1));
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1/");
    if (req.method === "GET" && url.pathname === "/api/graph") return void serveGraph(res, CORS, graphPath);
    res.writeHead(404).end("not found");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await rm(dir, { recursive: true, force: true });
});

describe("GET /api/graph", () => {
  it("returns the current graph JSON with application/json + the CORS header", async () => {
    const r = await fetch(`${base}/api/graph`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(r.headers.get("access-control-allow-origin")).toBe(CORS["Access-Control-Allow-Origin"]);
    const j = await r.json();
    expect(j.generatedAt).toBe("v1");
    expect(j.nodes).toHaveLength(1);
  });

  it("reads FRESH from disk on each request (a rewritten file is served next fetch)", async () => {
    await writeFile(graphPath, JSON.stringify(GRAPH_V2));
    const r = await fetch(`${base}/api/graph`);
    const j = await r.json();
    expect(j.generatedAt).toBe("v2");
    expect(j.nodes).toHaveLength(2);
  });

  it("404s when the graph file is missing", async () => {
    const missing = join(dir, "does-not-exist.json");
    const srv = http.createServer((req, res) => void serveGraph(res, CORS, missing));
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const p = (srv.address() as AddressInfo).port;
    const r = await fetch(`http://127.0.0.1:${p}/api/graph`);
    expect(r.status).toBe(404);
    await new Promise<void>((res) => srv.close(() => res()));
  });
});
