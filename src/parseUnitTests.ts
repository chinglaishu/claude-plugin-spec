import { basename } from "node:path";
import { nsId, stripRepoPrefix, type Repos } from "./config";
import type { GraphNode, ParseResult, TestKind } from "./types";

function firstMatch(re: RegExp, s: string): string {
  const m = s.match(re);
  return m ? m[1].trim() : "";
}

/** Human description of a Vitest file: a leading JSDoc line, else the top describe/it title. */
function feDescription(src: string): string {
  return (
    firstMatch(/\/\*\*\s*\n\s*\*\s*([^\n@]{6,220})/, src) ||
    firstMatch(/\b(?:describe|it|test)\s*\(\s*['"`]([^'"`\n]{4,220})['"`]/, src)
  );
}

/** Human description of a pytest file: module docstring, else first def-test docstring, else humanized name. */
function beDescription(src: string): string {
  const raw =
    firstMatch(/^﻿?\s*(?:from __future__.*\n\s*)?(?:"""|''')\s*([^\n]{6,220})/m, src) ||
    firstMatch(/(?:"""|''')\s*([^\n]{6,220})/, src);
  // A single-line docstring (`"""One line."""`) captures its own closing quotes — trim them.
  const doc = raw.replace(/\s*(?:"""|''')\s*$/, "").trim();
  if (doc) return doc;
  const name = firstMatch(/def\s+(test_[a-zA-Z0-9_]{2,80})/, src);
  return name ? name.replace(/^test_/, "").replace(/_/g, " ") : "";
}

function countMatches(re: RegExp, s: string): number {
  return (s.match(re) ?? []).length;
}

/** Collapse whitespace; keep only if it reads like a real sentence; cap length. */
function cleanSummary(s: string): string {
  const out = s.replace(/\s+/g, " ").trim();
  if (out.length < 24) return "";
  return out.length > 400 ? out.slice(0, 397).trimEnd() + "…" : out;
}

/**
 * The "why" of a test file: cleaned prose from its leading comment block — the
 * explanatory `//` run or `/* *\/` block just above the first test (FE), or the
 * module docstring (BE). Skips lint/tooling directives and trivially-short text.
 * Empty when the file has no such comment (then the viewer shows just the title).
 */
function leadingSummary(rawSrc: string, py: boolean): string {
  const src = rawSrc.replace(/\r\n?/g, "\n"); // normalize CRLF so line/`$` logic works on Windows files
  if (py) {
    const head = src.split(/\n(?:async\s+)?def\s+test_/)[0] ?? src;
    const m = head.match(/(?:"""|''')([\s\S]*?)(?:"""|''')/);
    return m ? cleanSummary(m[1]) : "";
  }
  // Only look before the first test declaration so we don't grab in-test comments.
  const head = (src.split(/\n\s*(?:describe|it|test)\s*\(/)[0] ?? src).slice(0, 6000);
  const block = head.match(/\/\*\*?([\s\S]*?)\*\//);
  const blockText = block ? cleanSummary(block[1].replace(/^\s*\*\s?/gm, "")) : "";
  const runs: string[][] = [];
  let cur: string[] = [];
  for (const ln of head.split(/\n/)) {
    const cm = /^\s*\/\/\s?(.*)$/.exec(ln);
    if (cm && !/^(eslint|@ts-|prettier|biome|@vitest|c8|istanbul|prettier-ignore)/i.test(cm[1])) cur.push(cm[1]);
    else { if (cur.length) runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  const lineRun = runs.length ? cleanSummary(runs[runs.length - 1].join(" ")) : "";
  return blockText.length >= lineRun.length ? blockText : lineRun;
}

export function unitKind(path: string): TestKind {
  return /\.py$/.test(path) ? "unit-be" : "unit-fe";
}

/**
 * Parse a single co-located unit-test file (Vitest `*.test.ts(x)` or pytest
 * `test_*.py`) into a `test` node with `kind: unit-fe | unit-be`. Tag edges to
 * features are derived from the file path against the feature registry globs.
 */
export function parseUnitTest(input: { path: string; content: string }, repos: Repos): ParseResult {
  const kind = unitKind(input.path);
  const py = kind === "unit-be";
  const node: GraphNode = {
    // The bare id is the path relative to the test's OWN repo, so two repos can each hold a
    // `src/index.test.ts` without colliding once `nsId` namespaces them.
    id: nsId(input.path, stripRepoPrefix(input.path, repos), repos),
    type: "test",
    kind,
    title: basename(input.path.replace(/\\/g, "/")),
    path: input.path,
    status: "pass",
    text: (py ? beDescription(input.content) : feDescription(input.content)) || undefined,
    summary: leadingSummary(input.content, py) || undefined,
    // Count test definitions. FE: `it(` / `test(` incl. chained forms (`it.each(`,
    // `it.only(`, `test.skip(`), while the `(?<![.\w])` lookbehind skips method calls
    // like `regex.test(`. BE: `def test_` (async or sync).
    testCount: py ? countMatches(/\bdef\s+test_/g, input.content) : countMatches(/(?<![.\w])(?:it|test)(?:\.\w+)*\s*\(/g, input.content),
    source: input.content,   // full file, so the viewer can show the real test code on demand
  };
  return { nodes: [node], edges: [] };
}
