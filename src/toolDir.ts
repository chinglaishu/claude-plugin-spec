// toolDir.ts — where the TOOL itself lives, as opposed to the project it measures.
//
// THE SECOND CLASS OF COUPLING (founding design §10.9), and only the port revealed it: twelve files
// hardcoded the project's *paths*, but several also assumed the tool was INSTALLED INSIDE the tree it
// measures — `join(__dirname, "..")` doubled as "the tool's package" and "where the graph lives", and
// `join(__dirname, "..", "..", "..")` walked up to the workspace root. Both are true only of an
// in-tree copy and false of a distributable package. No amount of reading found this; porting did, as
// three failing serve tests.
//
// The split this module exists to make explicit:
//   - TOOL_DIR      — assets the tool SHIPS (the viewer template, its own src/ for self-spawn).
//   - config.artifactDir — artifacts the PROJECT owns (graph, viewer, baseline, lockfile, digest).
//
// They coincided in DojoStack's in-tree copy, which is exactly why nobody noticed they are different
// things.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The tool's own package root — the parent of this `src/`. */
export const TOOL_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The viewer template the tool ships. A tool asset, never a project artifact. */
export const TEMPLATE_PATH = join(TOOL_DIR, "viewer.template.html");
