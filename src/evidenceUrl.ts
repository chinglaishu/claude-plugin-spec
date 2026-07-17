// Pure helpers for the token-authenticated evidence-image tier of the viewer.
//
// A private-repo evidence screenshot lives at a raw.githubusercontent.com URL that a browser
// <img> cannot load (an <img> can't send an Authorization header, so the raw host 404s for a
// private repo). The viewer instead fetch()es the GitHub *Contents API* with a read-only token
// and turns the returned base64 into a data: URL. These two pure functions do the URL derivation
// and the base64→dataURL shaping; the DOM/fetch/token glue lives in the viewer template so it can
// be unit-tested here without a browser.

const RAW_HOST = "https://raw.githubusercontent.com/";
const API_PREFIX = "https://api.github.com/repos/";

/**
 * Derive the GitHub Contents API URL from a raw.githubusercontent.com evidence URL.
 *
 * raw:  https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path...}
 * ->    https://api.github.com/repos/{owner}/{repo}/contents/{path...}?ref={branch}
 *
 * Each path segment and the ref are URL-encoded (slash separators preserved). An already-API URL
 * is passed through unchanged. Anything that isn't a recognizable raw/api URL (or is malformed —
 * no path after the branch) returns null so the caller falls through to the local/placeholder tiers.
 */
export function rawUrlToContentsApiUrl(url: string): string | null {
  if (typeof url !== "string" || !url) return null;
  if (url.startsWith(API_PREFIX)) return url; // already a Contents API URL — passthrough
  if (!url.startsWith(RAW_HOST)) return null;

  const rest = url.slice(RAW_HOST.length);
  const segs = rest.split("/");
  // Need owner, repo, branch, AND at least one path segment.
  if (segs.length < 4) return null;
  const [owner, repo, branch, ...pathSegs] = segs;
  if (!owner || !repo || !branch || pathSegs.length === 0 || pathSegs.some((s) => s === "")) {
    return null;
  }
  const path = pathSegs.map(encodeURIComponent).join("/");
  return `${API_PREFIX}${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(branch)}`;
}

/**
 * Shape the base64 `content` field of a Contents API response into a PNG data: URL. The API wraps
 * the base64 with newlines every 60 chars, so whitespace is stripped. Returns null for empty input.
 * The result is used ONLY as an <img> src — never injected as HTML.
 */
export function base64ToDataUrl(content: string): string | null {
  if (typeof content !== "string" || !content) return null;
  const clean = content.replace(/\s+/g, "");
  if (!clean) return null;
  return "data:image/png;base64," + clean;
}
