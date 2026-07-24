// blobStore.ts — the S3 evidence transport (REQ-KG-05): pure command builders, plus the adapter that
// runs them behind an injected subprocess. (Header amended 2026-07-24: it said "expressed as pure
// command builders" while the argv half was all that existed. `blobAdapter` at the bottom is the only
// thing here that is not pure, and its two subprocess dependencies are injected precisely so the argv
// stays asserted verbatim.)
//
// WHY COMMANDS, NOT AN SDK. `shotsUpload.ts` already shells out to `gh api` for the GitHub
// destination, so shelling out to `aws` slots into the identical seam: no new dependency, and the
// credential chain becomes the CLI's problem rather than ours. An SDK would drag a large tree into a
// plugin; hand-rolled SigV4 would mean writing request-signing crypto where the canonical-request
// construction is easy to get subtly wrong.
//
// WHY NO CREDENTIALS APPEAR HERE. `kg.config.json` is committed, so it names coordinates only —
// bucket, prefix, region. Credentials resolve at run time from the standard AWS chain (env vars,
// ~/.aws, an instance role, or CI's OIDC-minted short-lived creds). Nothing in this module can leak
// a secret into git, and every argv below is safe to log verbatim.
//
// WHY THE BUCKET STAYS PRIVATE. Screenshots carry whatever the app under test displays, which is the
// reason evidence lives out of band at all (founding design §10.10). A browser `<img>` cannot send an
// auth header, so reads go through a SHORT-LIVED SIGNED GET minted on demand by serve.ts. Note the
// inversion: a signed URL is wrong for upload — one signature covers one key, and a run writes many
// keys not known until it happens — but exactly right for read, where the key is already known, the
// URL is generated per view, and a short life is the point rather than a limitation.
import type { Evidence } from "./config";
// Type-only, and deliberately so: `shotsUpload.ts` imports this module for real, and a value import
// back the other way would close a cycle. The seam it names (`GhLike`) is the destination-adapter
// interface the founding design left open — "do not couple to git either, so a cloud adapter stays
// possible" (§10) — which is why this is a swap rather than a rewrite.
import type { GhLike } from "./shotsUpload";

type Blob = Extract<Evidence, { kind: "blob" }>;

/** Fifteen minutes: long enough to render a page of evidence, short enough that a URL captured from
 *  a shared screen or a proxy log is dead before it is useful. */
export const PRESIGN_TTL_SECONDS = 900;

/** The layout mirrors the GitHub evidence branch (`kg-cases/<case>/<sha>/<file>`) so the two shared
 *  destinations stay directly comparable, and moving between them is a copy rather than a migration.
 *  Case ids are lower-cased to match the graph's bare-id convention — a key that disagreed would make
 *  the viewer's lookup miss silently. */
export function objectKey(evidence: Blob, caseId: string, sha: string, filename: string): string {
  return [evidence.prefix, caseId.toLowerCase(), sha, filename].filter(Boolean).join("/");
}

/** The durable address of an object. The committed index stores KEYS, not URLs — this composes the
 *  address when one is needed, so nothing committed can expire. */
export function objectUrl(evidence: Blob, key: string): string {
  return `https://${evidence.bucket}.s3.${evidence.region}.amazonaws.com/${key}`;
}

const s3Uri = (evidence: Blob, ...segments: string[]) =>
  `s3://${[evidence.bucket, ...segments.filter(Boolean)].join("/")}`;

const caseUri = (evidence: Blob, caseId: string, sha?: string) =>
  s3Uri(evidence, evidence.prefix, caseId.toLowerCase(), sha ?? "") + "/";

export function uploadArgs(evidence: Blob, file: string, key: string): string[] {
  return ["s3", "cp", file, s3Uri(evidence, key), "--region", evidence.region];
}

/** Listing is what a pre-signed-URL design would have cost us: without it there is no SHA pruning and
 *  no way to rebuild the index from the remote. */
export function listArgs(evidence: Blob, caseId: string): string[] {
  return ["s3", "ls", caseUri(evidence, caseId), "--region", evidence.region];
}

export function pruneArgs(evidence: Blob, caseId: string, sha: string): string[] {
  return ["s3", "rm", caseUri(evidence, caseId, sha), "--recursive", "--region", evidence.region];
}

/**
 * Read the SHA directory names out of `aws s3 ls` output. Prefix listings arrive as `PRE <name>/`;
 * object lines are files and are not SHA dirs.
 *
 * Order is whatever the CLI returned (alphabetical), NOT recency — the same best-effort contract the
 * GitHub adapter documents, which is why the caller always passes the new SHA in explicitly rather
 * than inferring the newest from a listing.
 */
export function parseShaDirs(stdout: string): string[] {
  const out: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^\s*PRE\s+(.+?)\/\s*$/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

/** Minted per view by serve.ts, never committed. */
export function presignArgs(evidence: Blob, key: string, ttlSeconds: number = PRESIGN_TTL_SECONDS): string[] {
  return ["s3", "presign", s3Uri(evidence, key), "--expires-in", String(ttlSeconds), "--region", evidence.region];
}

// ── The seam: `runUpload`'s remote path ⇄ an object key ──────────────────────────────────────────
//
// `runUpload` composes ONE path shape for every destination — `kg-cases/<case>/<sha>/<file>`, the
// GitHub evidence branch's layout (§5a). S3 roots the identical tree at the CONFIGURED prefix
// instead, so the whole mapping is: drop the branch root, prepend the prefix. Both halves are
// asserted against `objectKey` rather than a literal, because what must hold is that the two agree.
const BRANCH_ROOT = "kg-cases";

/** The object key for a path `runUpload` handed to the adapter. */
export function keyOf(evidence: Blob, remotePath: string): string {
  const rest = remotePath.startsWith(BRANCH_ROOT + "/") ? remotePath.slice(BRANCH_ROOT.length + 1) : remotePath;
  return [evidence.prefix, rest].filter(Boolean).join("/");
}

// ── The read half: what the committed index stores, and how serve.ts reads it back ───────────────
//
// The bucket is PRIVATE, so neither address a browser could use is committable: `objectUrl` 403s in
// an `<img>`, and a pre-signed URL outlives its signature by months. So the index stores the KEY,
// addressed through the one door that can open it, and serve.ts signs it per view. ONE constant owns
// both ends — the writer below and the reader beneath it — so they cannot drift apart.
export const EVIDENCE_ROUTE = "/evidence/";

/** What `kg-evidence-index.json` records for a blob-destination shot. Nothing here expires. */
export function evidenceRef(key: string): string {
  return EVIDENCE_ROUTE + key.split("/").map(encodeURIComponent).join("/");
}

/** Objects this route will sign. Evidence is screenshots; nothing else in a project's bucket has any
 *  business being handed a signature by a viewer. */
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/**
 * PURE. Turn a request pathname back into a validated object key, or null.
 *
 * This is REQ-KG-SERVE-02's confinement expressed in key space rather than path space: the same
 * decode-then-guard-then-boundary-check order the filesystem routes use, with `withinPrefix` playing
 * the part `isWithinRoot` plays there — and for the same boundary reason, since a prefix `kg-cases`
 * must not match the sibling `kg-cases-evil`. A request can therefore only ever name an object under
 * the configured prefix: the route cannot be turned into a generic signer for the rest of the bucket.
 */
export function evidenceKeyFromPath(evidence: Blob, pathname: string): string | null {
  if (!pathname.startsWith(EVIDENCE_ROUTE)) return null;
  let raw: string;
  try {
    raw = decodeURIComponent(pathname.slice(EVIDENCE_ROUTE.length));
  } catch {
    return null; // malformed percent-encoding
  }
  if (!raw || raw.includes("\\")) return null;
  const segments = raw.split("/");
  if (segments.some((s) => s === "" || s.startsWith(".") || s.includes(":") || s.includes("\\"))) return null;
  const file = segments[segments.length - 1];
  const dot = file.lastIndexOf(".");
  if (!IMAGE_EXTENSIONS.has(dot > 0 ? file.slice(dot).toLowerCase() : "")) return null;
  const key = segments.join("/");
  return withinPrefix(evidence.prefix, key) ? key : null;
}

/** A key is inside the configured prefix only on a SEGMENT boundary. An empty prefix is the bucket
 *  root, which contains everything. */
function withinPrefix(prefix: string, key: string): boolean {
  return !prefix || key.startsWith(prefix + "/");
}

// ── The adapter: the only part of this transport that runs a subprocess ──────────────────────────

export interface BlobDeps {
  /** Run `aws <args>` and resolve with stdout. REJECTS on a non-zero exit — the CLI's own contract,
   *  and the reason `listCaseShas` below must catch. */
  aws(args: string[]): Promise<string>;
  /** Write RAW BYTES to a temp file, hand over its path, and always remove it. Distinct from
   *  `shotsUpload.ts`'s `withTempBodyFile`, which writes a `gh api --input` JSON body: reusing that
   *  one here would upload the JSON wrapper instead of the PNG, and exit 0 doing it. */
  withRawTempFile<T>(bytes: Buffer, fn: (path: string) => Promise<T>): Promise<T>;
  /** Where a best-effort failure goes. */
  warn?(message: string): void;
}

/**
 * The S3 destination behind `runUpload`'s `GhLike` seam. Everything subprocess-shaped is injected, so
 * the argv stays asserted verbatim and no test shells out.
 *
 * Note what each method is HANDED: `putFile`/`deleteDir` get a repo-relative remote path (mapped by
 * `keyOf`), while `listCaseShas` gets a bare case id (which `listArgs` takes directly).
 */
export function blobAdapter(evidence: Blob, deps: BlobDeps): GhLike {
  const warn = deps.warn ?? (() => {});
  return {
    listCaseShas: async (caseId: string) => {
      try {
        return parseShaDirs(await deps.aws(listArgs(evidence, caseId)));
      } catch {
        // `aws s3 ls` exits NON-ZERO on a prefix holding no objects — which is the state of every
        // case the first time it is uploaded. Rethrowing would fail that run before a single file
        // was written, so an empty listing and an absent one are the same answer: nothing to prune.
        return [];
      }
    },
    putFile: async (remotePath: string, content: Buffer) => {
      await deps.withRawTempFile(content, (file) => deps.aws(uploadArgs(evidence, file, keyOf(evidence, remotePath))));
    },
    deleteDir: async (remotePath: string) => {
      // Best-effort, matching the github adapter: evidence that uploaded cleanly must never be
      // reported as a failed run because an old sha dir could not be removed.
      try {
        const segments = remotePath.split("/").filter(Boolean);
        const sha = segments.pop();
        const caseId = segments.pop();
        if (!sha || !caseId) throw new Error(`unrecognised sha dir '${remotePath}'`);
        await deps.aws(pruneArgs(evidence, caseId, sha));
      } catch (e) {
        warn(`kg shots:upload — prune skipped for ${remotePath}: ${(e as Error).message}`);
      }
    },
  };
}
