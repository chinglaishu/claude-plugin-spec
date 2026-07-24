// blobStore.ts — the S3 evidence transport, expressed as pure command builders (REQ-KG-05).
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
