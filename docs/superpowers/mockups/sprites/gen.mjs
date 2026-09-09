// Generates the gal-game cast for the Conflicts demo via Atlas Cloud gpt-image-2.
// Idempotent: a file that exists is skipped. Node 20+, no deps.
//   ATLAS_CLOUD_API_KEY=... node docs/superpowers/mockups/sprites/gen.mjs
import { writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const KEY = process.env.ATLAS_CLOUD_API_KEY;
if (!KEY) throw new Error('ATLAS_CLOUD_API_KEY missing');
const OUT = path.dirname(new URL(import.meta.url).pathname);
const API = 'https://api.atlascloud.ai/api/v1/model/generateImage';

const STYLE = 'anime visual novel heroine, bust portrait from the head to the mid-torso, front three-quarter view, ' +
  'clean line art, flat cel shading, soft even lighting, plain flat solid background exactly #f4f1ea, ' +
  'no text, no watermark, no logo, no border, calm neutral expression with closed mouth';

const CAST = {
  shiori: 'long straight dark navy-blue hair with side-swept bangs, thin round glasses, a small indigo ribbon at the collar, ' +
          'a neat dark indigo cardigan over a white blouse, composed archivist air',
  rin:    'short charcoal-grey asymmetric bob, sharp eyes, small headphones resting around the neck, ' +
          'a grey engineer jacket over a black tee, dry cool air',
  hana:   'medium-length wavy chestnut hair with a moss-green leaf-shaped hair clip, bright open eyes, ' +
          'a white shirt with a moss-green collar, cheerful sunny air',
  yui:    'honey-blonde hair in low twin tails tied with ochre-yellow ribbons, a small pen tucked behind one ear, ' +
          'a soft ochre-yellow cardigan, curious note-taker air',
};

const EXPR = {
  happy:     'a bright warm smile, eyes gently closed into crescents, a light blush',
  worried:   'a worried look, eyebrows drawn up, a small frown, a single anime sweat drop',
  confident: 'a confident smirk, half-lidded eyes, chin slightly raised',
  sulk:      'a sulking pout, puffed cheeks, eyebrows down, eyes glancing away to the side',
};

async function call(body, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(API, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: '1024x1536', quality: 'medium', output_format: 'png', enable_sync_mode: true, ...body }) });
      const j = await r.json();
      const url = j?.data?.outputs?.[0];
      if (j?.data?.status === 'completed' && url) return url;
      throw new Error(`status ${j?.data?.status} ${j?.data?.error || j?.message || ''}`);
    } catch (e) { console.error(`  try ${i}: ${e.message}`); if (i === tries) throw e; }
  }
}
async function exists(p) { try { await access(p); return true; } catch { return false; } }
async function save(url, file) {
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  await writeFile(file, buf);
  execFileSync('sips', ['--resampleHeight', '640', file], { stdio: 'ignore' });
}

async function character(name) {
  const base = path.join(OUT, `${name}-neutral.png`);
  const urlFile = path.join(OUT, `${name}-neutral.url`);
  let baseUrl;
  if (await exists(urlFile)) baseUrl = (await import('node:fs')).readFileSync(urlFile, 'utf8').trim();
  else {
    console.log(`${name}: base`);
    baseUrl = await call({ model: 'openai/gpt-image-2/text-to-image', prompt: `${STYLE}. ${CAST[name]}.` });
    await writeFile(urlFile, baseUrl);
  }
  if (!(await exists(base))) await save(baseUrl, base);
  for (const [expr, desc] of Object.entries(EXPR)) {
    const file = path.join(OUT, `${name}-${expr}.png`);
    if (await exists(file)) continue;
    console.log(`${name}: ${expr}`);
    try {
      const url = await call({ model: 'openai/gpt-image-2/edit', images: [baseUrl], output_format: 'png',
        prompt: `Edit this image. Keep the exact same character, hairstyle, glasses or accessories, outfit, colours, framing and the plain flat #f4f1ea background. Change ONLY the facial expression to: ${desc}. Anime visual novel style, clean line art, flat cel shading, no text.` });
      await save(url, file);
    } catch (e) { console.error(`${name}-${expr} FAILED: ${e.message}`); }
  }
}
await Promise.all(Object.keys(CAST).map(character));
console.log('done');
