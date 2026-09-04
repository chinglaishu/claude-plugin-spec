// tools/prd-prose.test.mjs — the committed PRDs' own prose, guarded against ONE thing: the artefact
// a rename leaves behind.
//
// Requirement text is the human's (CLAUDE.md rule 5) and nothing here judges its wording. What this
// catches is mechanical damage: a search-and-replace that changed the word after a line break and
// left the article before it standing, so the sentence reads "… · the / The Expected picture …".
// The 2026-09-03 Schematic → Expected rename did exactly that in spec/board/prd.md (found by the
// final re-review, not by anything the tree runs), and a rename is a thing this project does often
// enough that the next one deserves a guard rather than another pair of eyes.
//
// Deliberately narrow: a DUPLICATED DETERMINER across a line break — a line-final `the`/`a`/`an`
// whose next line opens with `The`/`A`/`An` (bolded or not). Prose legitimately wraps after an
// article all the time, which is why the rule needs the second one to fire; across every committed
// PRD in this repo the rule has exactly one true positive and no false ones.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SPEC = join(dirname(fileURLToPath(import.meta.url)), '..', 'spec')
const DOUBLED = /\b(the|a|an)[ \t]*\r?\n[ \t]*(\*\*)?(The|A|An)\b/g

export function doubledDeterminers (text) {
  const out = []
  DOUBLED.lastIndex = 0
  let m
  while ((m = DOUBLED.exec(String(text || '')))) {
    out.push({ line: String(text).slice(0, m.index).split('\n').length, what: m[0].replace(/\s+/g, ' ') })
  }
  return out
}

test('a rename never leaves an article dangling at a line end — the pure rule', () => {
  assert.deepEqual(doubledDeterminers('add a test to cover it · the\nThe Expected picture doesn’t match')
    .map(h => h.what), ['the The'])
  assert.deepEqual(doubledDeterminers('a requirement is canon the\nmoment it is written'), [],
    'prose that merely wraps after an article is not an artefact')
  assert.deepEqual(doubledDeterminers('offers **reword · add a test to cover it ·\nThe Expected picture**'), [],
    'and the corrected form is clean')
})

test('no committed PRD carries one', () => {
  const found = []
  for (const dir of readdirSync(SPEC)) {
    const prd = join(SPEC, dir, 'prd.md')
    if (!existsSync(prd)) continue
    for (const hit of doubledDeterminers(readFileSync(prd, 'utf8'))) {
      found.push(`spec/${dir}/prd.md:${hit.line} — "${hit.what}"`)
    }
  }
  assert.deepEqual(found, [], 'an edit artefact, not the human\'s wording — fix the prose in place')
})
