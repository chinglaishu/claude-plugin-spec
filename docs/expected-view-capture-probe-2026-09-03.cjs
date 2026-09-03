// docs/expected-view-capture-probe-2026-09-03.cjs — the PROBE that produced the example row in
// docs/expected-view-plan-2026-09-03.html: one pass against dojostack property 258 (one-click dev login)
// that takes the Actual photograph AND the toolbar's own DOM with computed styles diffed against per-tag
// defaults (the phase-1 shape, by hand). Reference only — NOT part of the harness. Phase 1 turns the
// `picker.evaluate` body into spec/_replica.mjs (self-contained, stub-DOM tested like _layout-walk.mjs),
// adds the scene-root rule, sanitising and caps, and stores .actual.html beside each skeleton.
// Run: cd <dojostack_main> && node <this file>   (writes page.png + replica.json beside the file)
// one-pass capture: Actual photograph + Expected replica of the same state (the phase-1 shape, by hand)
const { chromium } = require('/Users/laishuching/workspace/dojostack/dojostack_main/node_modules/playwright');
const fs = require('fs'); const OUT = __dirname;
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:3000/dev-login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /dev login/i }).click();
  await page.waitForTimeout(3000);
  await page.goto('http://localhost:3000/properties/258/assumption/entity-assumption?version=671', { waitUntil: 'domcontentloaded' });
  const picker = page.locator('button').filter({ hasText: /Version/ }).filter({ hasText: /Draft|Live|Published/ }).first();
  await picker.waitFor({ timeout: 30000 }); await page.waitForTimeout(2500);
  const ring = await picker.boundingBox();
  await page.screenshot({ path: OUT + '/page.png' });
  const rep = await picker.evaluate((btn) => {
    const root = btn.parentElement.parentElement; // the toolbar group (rent roll · version · house view)
    const PROPS = ['display','position','top','left','right','bottom','flex','flex-direction','align-items','justify-content','gap','width','height','min-width','max-width','padding','margin','border','border-radius','background-color','color','font-family','font-size','font-weight','line-height','white-space','overflow','text-overflow','box-shadow','opacity','vertical-align','box-sizing','fill','stroke','stroke-width','text-decoration'];
    const defaults = {}; const defFor = (tag, ns) => { const k = ns + '|' + tag; if (defaults[k]) return defaults[k]; const p = document.createElementNS(ns, tag); document.body.appendChild(p); const cs = getComputedStyle(p); const d = {}; for (const q of PROPS) d[q] = cs.getPropertyValue(q); p.remove(); defaults[k] = d; return d };
    const seen = new Map(); let css = ''; let n = 0; const marks = [];
    const walk = (src, dst) => { for (const c of Array.from(src.childNodes)) {
      if (c.nodeType === 3) { dst.appendChild(document.createTextNode(c.textContent)); continue }
      if (c.nodeType !== 1) continue; const t = c.tagName.toLowerCase(); if (t === 'script' || t === 'style') continue; n++;
      const cs = getComputedStyle(c); const d = defFor(t, c.namespaceURI);
      const decl = PROPS.filter(p => cs.getPropertyValue(p) !== d[p]).map(p => p + ':' + cs.getPropertyValue(p)).join(';');
      let cls = ''; if (decl) { cls = seen.get(decl); if (!cls) { cls = 'r' + seen.size; seen.set(decl, cls); css += '.rep .' + cls + '{' + decl + '}\n' } }
      const el = document.createElementNS(c.namespaceURI, t); if (cls) el.setAttribute('class', cls);
      for (const a of ['viewBox','d','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','cx','cy','r','x','y','x1','y1','x2','y2','width','height','points']) if (c.hasAttribute(a)) el.setAttribute(a, c.getAttribute(a));
      if (c === btn) el.setAttribute('data-ring', '1');
      dst.appendChild(el); walk(c, el) } };
    const out = document.createElement('div'); const cs = getComputedStyle(root); const r = root.getBoundingClientRect();
    out.setAttribute('style', 'display:inline-flex;align-items:center;gap:' + cs.gap + ';font-family:' + cs.fontFamily + ';font-size:' + cs.fontSize + ';color:' + cs.color + ';line-height:' + cs.lineHeight);
    walk(root, out);
    // the leaf the check would read: the track word inside the picker
    const track = Array.from(btn.querySelectorAll('span')).find(s => /^(Draft|Live|Published|Archived)$/.test(s.textContent.trim()));
    return { nodes: n, classes: seen.size, css, html: out.outerHTML, root: { x: r.left, y: r.top, w: r.width, h: r.height }, track: track ? track.textContent.trim() : null, shown: btn.innerText.replace(/\s+/g, ' ').trim() };
  });
  fs.writeFileSync(OUT + '/replica.json', JSON.stringify({ ring, ...rep }, null, 1));
  console.log(JSON.stringify({ ring, root: rep.root, nodes: rep.nodes, classes: rep.classes, css: rep.css.length, html: rep.html.length, track: rep.track, shown: rep.shown }));
  await b.close();
})().catch(e => { console.error('CAPTURE FAILED', e.message); process.exit(1) });
