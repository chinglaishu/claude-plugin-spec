// A trivial static server for the Tsumiki demo app (demo/todo/app). Tsumiki has no build and no
// backend — it is one self-contained HTML file — so the whole "run the app" step is this: serve the
// app directory on a fixed port. spec/_config.json points the board and the tests at it.
//   node serve-app.mjs            # http://localhost:4319
//   APP_PORT=5000 node serve-app.mjs
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'app')
const PORT = Number(process.env.APP_PORT || 4319)
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' }

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent((req.url || '/').split('?')[0])
    if (path === '/') path = '/todo.html'
    // stay inside app/ — a static server is an allowlist of its own directory, never a traversal
    const file = normalize(join(ROOT, path))
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return }
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(PORT, () => console.log(`Tsumiki served at http://localhost:${PORT}/todo.html`))
