// Builds the self-contained gal-game demo: keys the flat paper background off every sprite
// (flood fill from the border, so interior whites survive), re-encodes as webp, inlines the
// sheet as data URIs into the .src.html, writes the final .html and one screenshot per tab.
//   node docs/superpowers/mockups/build-galgame.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const SPR = path.join(DIR, 'sprites');
const SRC = path.join(DIR, '2026-09-09-galgame-conflicts.src.html');
const OUT = path.join(DIR, '2026-09-09-galgame-conflicts.html');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });

// 1 · key the background in a canvas, in the browser (no native image deps)
const KEY = `
async (dataUrl) => {
  const img = new Image(); img.src = dataUrl; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data, W = c.width, H = c.height;
  const bg = [244, 241, 234], TOL = 16;
  const near = i => Math.abs(d[i]-bg[0]) + Math.abs(d[i+1]-bg[1]) + Math.abs(d[i+2]-bg[2]) < TOL;
  const seen = new Uint8Array(W*H), stack = [];
  // seed from the top edge, the two sides, and only the OUTER 14% of the bottom edge — the body sits on the bottom centre
  for (let x = 0; x < W; x++) { stack.push(x); if (x < W*0.14 || x > W*0.86) stack.push(x + (H-1)*W); }
  for (let y = 0; y < H; y++) { stack.push(y*W, y*W + W-1); }
  while (stack.length) {
    const p = stack.pop(); if (seen[p]) continue; seen[p] = 1;
    if (!near(p*4)) continue;
    d[p*4+3] = 0;
    const x = p % W, y = (p - x) / W;
    if (x > 0) stack.push(p-1); if (x < W-1) stack.push(p+1); if (y > 0) stack.push(p-W); if (y < H-1) stack.push(p+W);
  }
  // soften the edge one pixel: any opaque pixel touching a keyed one gets partial alpha if it is near-bg
  const out = new Uint8ClampedArray(d);
  for (let p = 0; p < W*H; p++) {
    if (d[p*4+3] === 0) continue;
    const x = p % W, y = (p - x) / W;
    const nb = [p-1, p+1, p-W, p+W].filter(q => q >= 0 && q < W*H && d[q*4+3] === 0).length;
    if (nb && Math.abs(d[p*4]-bg[0]) + Math.abs(d[p*4+1]-bg[1]) + Math.abs(d[p*4+2]-bg[2]) < TOL*3) out[p*4+3] = 0;
  }
  im.data.set(out); g.putImageData(im, 0, 0);
  return c.toDataURL('image/webp', 0.86);
}`;

await page.setContent('<!doctype html><html><body></body></html>');
const sprites = {};
for (const f of readdirSync(SPR).filter(f => f.endsWith('.png')).sort()) {
  const key = f.replace(/\.png$/, '');
  const png = 'data:image/png;base64,' + readFileSync(path.join(SPR, f)).toString('base64');
  sprites[key] = await page.evaluate(new Function("return (" + KEY + ")")(), png);
  process.stdout.write(`${key} ${(sprites[key].length / 1024).toFixed(0)}KB\n`);
}

// 2 · inline
const src = readFileSync(SRC, 'utf8');
const html = src.replace('/*SPRITES*/', `window.SPRITES = ${JSON.stringify(sprites)};`);
writeFileSync(OUT, html);
console.log(`wrote ${path.basename(OUT)} ${(html.length / 1024 / 1024).toFixed(2)} MB`);

// 3 · screenshots: one per tab, after the intro has played and a side is picked (the reaction state)
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.goto('file://' + OUT);
for (const tab of ['A', 'B', 'C']) {
  await page.click(`#tabs button[data-tab="${tab}"]`);
  const sec = page.locator(`#opt${tab}`);
  await sec.locator('[data-txt-box]').click(); await sec.locator('[data-txt-box]').click(); await sec.locator('[data-txt-box]').click();
  await sec.locator('[data-choices] button[data-ch="code"]').click();
  await page.waitForTimeout(300);
  await sec.screenshot({ path: path.join(DIR, `2026-09-09-galgame-${tab}.png`) });
  console.log(`shot ${tab}`);
}
await browser.close();
