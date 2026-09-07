// build.mjs — inline the player, its sheet, an image set and a decisions file into ONE self-contained html.
//   node docs/compare-player/build.mjs <decisions.js> <images.json> <out.html> [title]
// images.json: { name: "data:image/png;base64,…" } — the decisions file refers to them as IMG.name.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const [,, decFile, imgFile, out, title] = process.argv
if (!decFile || !out) { console.error('usage: build.mjs <decisions.js> <images.json|-> <out.html> [title]'); process.exit(1) }
const css = readFileSync(join(HERE, 'compare-player.css'), 'utf8')
const js = readFileSync(join(HERE, 'compare-player.js'), 'utf8')
const dec = readFileSync(decFile, 'utf8')
const img = imgFile && imgFile !== '-' ? readFileSync(imgFile, 'utf8') : '{}'
const page = readFileSync(join(HERE, 'page.template.html'), 'utf8')
const html = page
  .replace('__TITLE__', title || 'Comparison rows')
  .replace('/*__CSS__*/', css)
  .replace('/*__IMG__*/', 'window.IMG = ' + img + ';')
  .replace('/*__PLAYER__*/', js)
  .replace('/*__DECISIONS__*/', dec)
writeFileSync(out, html)
console.log('wrote', out, html.length, 'bytes')
