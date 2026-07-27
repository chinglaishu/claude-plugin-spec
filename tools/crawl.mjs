// The crawl's browser half. Visits the project's own app one route at a time, screenshots each,
// reads the page's title and headings, and writes the manifest the Init "what was found" table and
// the PRD-drafting step both read. It writes NO prd.md — a guessed requirement is Claude's job,
// drafted from what this captures. It never touches a screen that already exists.
//
// This is real and side-effectful — a browser, possibly a spawned dev server — so it lives OUTSIDE
// the deterministic suite, like every other job that reaches for the network or an agent.

import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { ROOT, SPEC, CRAWL, readConfig, slugify, routeExists } from './spec-store.mjs'

const log = m => console.log(m)

async function waitForUrl (url, ms = 30000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.ok || r.status < 500) return true } catch { /* not up yet */ }
    await sleep(400)
  }
  return false
}

async function main () {
  const cfg = readConfig()
  const base = cfg.baseUrl.replace(/\/+$/, '')
  if (!base) { log('no app URL configured — nothing to crawl'); writeManifest([]); return }

  // start mode: run the command, wait for the URL, and stop it when we are done. attach mode:
  // the server is already up and is not ours to start or kill.
  let app = null
  if (cfg.mode === 'start' && cfg.startCommand) {
    log(`starting the app: ${cfg.startCommand}`)
    app = spawn(cfg.startCommand, { cwd: ROOT, shell: true, detached: true, stdio: 'ignore' })
  }
  const up = await waitForUrl(base)
  if (!up) {
    log(`the app never answered at ${base} — check the URL or the start command`)
    if (app) { try { process.kill(-app.pid) } catch { /* gone */ } }
    writeManifest([])
    return
  }

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  // sign-in, if the app needs it: the CEO's script runs against the live page before crawling, so
  // routes behind auth are reachable. It is their code, run verbatim — the tool adds nothing to it.
  if (cfg.signIn && cfg.signIn.trim()) {
    try { await new Function('page', 'base', `return (async()=>{${cfg.signIn}})()`)(page, base) }
    catch (e) { log(`sign-in script threw (continuing unauthenticated): ${e.message}`) }
  }

  // Explicit routes, or discover from the root by collecting same-origin links. Discovery is
  // deliberately shallow — one hop from the root — because a guess the CEO has to correct is worth
  // more when there are five of them than five hundred.
  let routes = cfg.routes.length ? cfg.routes : await discover(page, base)
  routes = [...new Set(routes.map(normalise))].slice(0, 60)
  log(`${routes.length} route(s) to visit`)

  const found = []
  for (const route of routes) {
    const slug = slugify(route)
    try {
      await page.goto(base + route, { waitUntil: 'networkidle', timeout: 20000 })
    } catch (e) {
      log(`skip ${route} — ${e.message.split('\n')[0]}`); continue
    }
    const dir = join(SPEC, slug)
    mkdirSync(dir, { recursive: true })
    // crawl.png, never screen.png: column 3 is a byproduct of a test, and this is evidence for a
    // guess, not proof anyone checked the build.
    await page.screenshot({ path: join(dir, 'crawl.png') })
    const meta = await page.evaluate(() => ({
      title: document.title || '',
      headings: [...document.querySelectorAll('h1,h2')].map(h => h.textContent.trim()).filter(Boolean).slice(0, 8).join(' · ')
    }))
    found.push({ route, slug, title: meta.title, headings: meta.headings, exists: routeExists(route) })
    log(`visited ${route}${routeExists(route) ? ' (already on the board — left alone)' : ''}`)
  }

  await browser.close()
  if (app) { try { process.kill(-app.pid) } catch { /* gone */ } }
  writeManifest(found)
  log(`crawl complete — ${found.length} route(s), ${found.filter(r => !r.exists).length} new`)
}

const normalise = r => {
  let s = String(r).replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '')
  if (!s.startsWith('/')) s = '/' + s
  return s.length > 1 ? s.replace(/\/+$/, '') : s
}

async function discover (page, base) {
  try {
    await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 20000 })
  } catch { return ['/'] }
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')))
  const origin = new URL(base).origin
  const routes = new Set(['/'])
  for (const h of hrefs) {
    if (!h || h.startsWith('#') || h.startsWith('mailto:')) continue
    try {
      const u = new URL(h, base)
      if (u.origin === origin) routes.add(u.pathname)
    } catch { /* not a URL */ }
  }
  return [...routes]
}

function writeManifest (routes) {
  writeFileSync(CRAWL, JSON.stringify({ crawledAt: new Date().toISOString(), routes }, null, 2) + '\n')
}

main().catch(err => { console.error(err); process.exitCode = 1 })
