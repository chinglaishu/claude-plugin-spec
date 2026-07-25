// isMain.ts — the one answer to "am I the process entrypoint?" (REQ-KG-SUB-06).
//
// Six CLI modules used to answer this three ways, which the code↔code conflict scan surfaced as
// cf-4b6d6187fc and the CEO resolved on 2026-07-26 in favour of the form below:
//
//   A  `import.meta.url === pathToFileURL(process.argv[1]).href`   — throws when argv[1] is absent.
//   B  the same, guarded                                            — CANONICAL.
//   C  `import.meta.url === \`file://${process.argv[1]}\`` plus a filename-suffix fallback
//      — the comparison is wrong on any path needing URL encoding (a space becomes %20 in
//        `import.meta.url` but not in a concatenation), and the fallback then claims entrypoint for
//        any invoked script whose name merely ENDS WITH this module's: `run-build.ts` is not
//        `build.ts`. C reached the right answer on ordinary paths for the wrong reason.
//
// PURE, and given its inputs rather than reading `import.meta`/`process` itself — that is what makes
// the encoding and absent-argv cases testable at all, which is why three implementations could
// disagree unnoticed for as long as they did.
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Is the module identified by `moduleUrl` the script the process was invoked with?
 *
 * Call as `isMain(import.meta.url, process.argv[1])`.
 *
 * Returns FALSE rather than throwing when no script was invoked: a module that was only imported
 * must not take the process down while deciding it is not the entrypoint.
 */
export function isMain(moduleUrl: string, argv1: string | undefined): boolean {
  if (!argv1) return false;
  try {
    if (moduleUrl === pathToFileURL(argv1).href) return true;
    // SYMLINKS. `import.meta.url` is always the RESOLVED real path; `process.argv[1]` is whatever the
    // caller typed. Invoke through a symlink — macOS `/tmp` (a link to `/private/tmp`), a symlinked
    // checkout, a pnpm store — and the two never match, so the module decides it is not the entrypoint
    // and the CLI silently does nothing. Position B shipped with this and it survived the adjudication;
    // found by running a bundled entrypoint out of a temp dir, where it fails every time.
    return moduleUrl === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    return false;
  }
}
