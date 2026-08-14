#!/usr/bin/env node
// One command from a recorded run to a narrated, subtitled mp4 — NO model in the loop. The words
// come from the screen's narration pack (authored once, pass and fail variants both written); the
// run's beat log chooses which lines fire and when; piper synthesizes each line ONCE into a cache
// keyed by voice+text (a stable pack re-synthesizes nothing); ffmpeg burns the subtitles and lays
// the audio at the beat times. The deterministic logic lives in tools/narrate.mjs (unit-tested);
// this file is the shell around piper/ffmpeg.
//
//   node tools/narrate-run.mjs pace   --pack spec/entity/narration.json --out /tmp/pace.json
//       synth every line, measure it, and emit the BOARD_NARRATION_PACE rules that make the run
//       hold each beat until its line has been spoken (sync by construction — record WITH this).
//
//   node tools/narrate-run.mjs render --video <video.webm> --beats <beats.jsonl> \
//        --pack spec/entity/narration.json --out demo.mp4 [--sub-size 11] [--no-voice]
//
// Synthesis command: BOARD_SYNTH_CMD, a shell template run with cwd = the cache dir, with {model}
// {txt} {wav} substituted (paths relative to that dir when inside it). Default expects a local
// `piper` binary; a docker image works the same way, e.g.:
//   BOARD_SYNTH_CMD='docker run --rm -v "$PWD":/work -w /work piper-local piper -m {model} -f {wav} < {txt}'
// Voices: BOARD_PIPER_VOICES names the directory holding <voice>.onnx(+.json); default: the cache dir.
import { execFileSync, execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs'
import { join, dirname, resolve, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { parseBeats, selectCues, buildAnchors, wallToVideo, layoutCues, toSrt, toAss } from './narrate.mjs'

const args = process.argv.slice(2)
const cmd = args[0]
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name)
  return i > -1 ? args[i + 1] : dflt
}
const flag = (name) => args.includes('--' + name)
const die = (m) => { console.error('narrate-run: ' + m); process.exit(1) }

const packFile = opt('pack') || die('--pack <narration.json> is required')
const pack = JSON.parse(readFileSync(packFile, 'utf8'))
const CACHE = resolve(process.env.BOARD_NARRATION_CACHE || join(dirname(resolve(packFile)), '_narration-cache'))
// A project-level spec/_voices/ (the pack is spec/<screen>/narration.json, so its grandparent is
// spec/) is the conventional home for voice models — so Setup's readiness check, the install helper,
// and the run all agree WITHOUT an env var. An explicit BOARD_PIPER_VOICES still wins; the pack's own
// cache dir is the last resort (a model dropped beside the cache still works, as before).
const SPEC_VOICES = join(dirname(dirname(resolve(packFile))), '_voices')
const VOICES = resolve(process.env.BOARD_PIPER_VOICES || (existsSync(SPEC_VOICES) ? SPEC_VOICES : CACHE))
const SYNTH = process.env.BOARD_SYNTH_CMD || 'piper -m {model} -f {wav} < {txt}'
mkdirSync(CACHE, { recursive: true })

const allLines = () => [pack.intro, pack.outro, ...(pack.cues || [])].filter(Boolean)

// ── synth one line into the cache, return its wav path + duration ───────────────────────
const rel = (p) => p.startsWith(CACHE + '/') ? p.slice(CACHE.length + 1) : p
function synth (text) {
  const voice = pack.voice || 'en_US-lessac-medium'
  const key = createHash('sha1').update(voice + '\n' + text).digest('hex').slice(0, 16)
  const wav = join(CACHE, `line-${key}.wav`)
  if (!existsSync(wav)) {
    const txt = join(CACHE, `line-${key}.txt`)
    writeFileSync(txt, text + '\n')
    const model = join(VOICES, voice + '.onnx')
    if (!existsSync(model)) die(`voice model not found: ${model} (set BOARD_PIPER_VOICES)`)
    const sh = SYNTH.replaceAll('{model}', rel(model)).replaceAll('{txt}', rel(txt)).replaceAll('{wav}', rel(wav))
    execSync(sh, { cwd: CACHE, stdio: ['ignore', 'ignore', 'inherit'] })
    if (!existsSync(wav)) die(`synth produced no wav: ${sh}`)
  }
  const dur = Number(execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', wav], { encoding: 'utf8' }).trim())
  return { wav, dur }
}

// ── pace: emit the BOARD_NARRATION_PACE rules from the synthesized durations ────────────
if (cmd === 'pace') {
  const out = opt('out') || die('--out <pace.json> is required')
  const pad = Number(opt('pad', 300))                    // breathing room after each line, ms
  const cues = (pack.cues || []).map(c => {
    const { dur } = synth(c.text ?? c.spoken)
    return { on: c.on, match: c.match, ms: Math.round(dur * 1000) + pad }
  })
  // the intro has no beat — the run reserves it at test start so the first beat waits it out
  const introMs = pack.intro ? Math.round(synth(pack.intro.text ?? pack.intro.spoken).dur * 1000) + pad : 0
  writeFileSync(out, JSON.stringify({ gap: 250, introMs, cues }, null, 1))
  console.log(`pace rules for ${cues.length} lines -> ${out}`)
  process.exit(0)
}

if (cmd !== 'render') die('usage: narrate-run.mjs pace|render …')

// ── render ───────────────────────────────────────────────────────────────────────────────
const video = opt('video') || die('--video <video.webm> is required')
const beatsFile = opt('beats') || die('--beats <beats.jsonl> is required')
const outFile = opt('out', 'narrated.mp4')
const subSize = Number(opt('sub-size', 28))          // real frame pixels — the ASS PlayRes is the video's own
const voiceOn = !flag('no-voice')

const probeDur = (f) => Number(execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration',
  '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim())
const videoDur = probeDur(video)

// The topbar burned into the frames is the sync signal: scan its band per frame at a constant
// 10fps (frame index / 10 = seconds, whatever the source timestamps compressed).
function scanBand (v) {
  const W = 48; const H = 2; const FPS = 10
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', v, '-vf',
    `crop=iw:36:0:0,scale=${W}:${H}`, '-r', String(FPS), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
  { maxBuffer: 1 << 28 })
  const fsz = W * H * 3
  const runs = []
  for (let i = 0; i * fsz < raw.length; i++) {
    const f = raw.subarray(i * fsz, (i + 1) * fsz)
    let r = 0; let g = 0; let b = 0
    for (let p = 0; p < fsz; p += 3) { r += f[p]; g += f[p + 1]; b += f[p + 2] }
    const n = fsz / 3; r /= n; g /= n; b /= n
    const state = (r - g > 35 && r < 190) ? 'red' : (r < 85 && g < 85) ? 'ink' : 'light'
    const t = i / FPS
    if (runs.length && runs[runs.length - 1].state === state) runs[runs.length - 1].t1 = t
    else runs.push({ t0: t, t1: t, state })
  }
  return runs
}

const beats = parseBeats(readFileSync(beatsFile, 'utf8'))
const { cues: picked, unmatched } = selectCues(beats, pack)
for (const u of unmatched) console.warn(`  !! no beat for pack line ${u} — skipped`)

const anchors = buildAnchors(beats, scanBand(video), videoDur)
if (!anchors.length) die('no band anchors found — is the topbar in this recording?')
const toV = wallToVideo(anchors)
console.log('anchors:', anchors.map(([w, v]) => `${((w - anchors[0][0]) / 1000).toFixed(1)}s->${v.toFixed(1)}s`).join(' '))

const timed = picked.map(c => ({
  ...c,
  t: c.at === 'start' ? Math.max(0.3, c.lead) : +(toV(c.wall) + c.lead + (c.at === 'end' ? 1.2 : 0)).toFixed(2)
})).filter(c => c.t < videoDur + 8)

for (const c of timed) c.dur = synth(c.spoken).dur
const { cues, endsAt } = layoutCues(timed, { gap: 0.25 })
for (const c of cues) if (c.nudged > 0.75) console.warn(`  !! "${c.shown.slice(0, 50)}" nudged ${c.nudged}s — hold its beat longer (record with the pace file)`)

const finalDur = Math.max(videoDur, endsAt + 0.7)
// The .srt is the portable artifact; the burn-in uses a native .ass pinned to the video's own
// resolution (SRT+force_style scales from 384×288 and garbles BorderStyle=3 boxes — see toAss).
const srtFile = outFile.replace(/\.\w+$/, '') + '.srt'
writeFileSync(srtFile, toSrt(cues, finalDur))
const assFile = outFile.replace(/\.\w+$/, '') + '.ass'
const [vw, vh] = execFileSync('ffprobe', ['-v', 'quiet', '-select_streams', 'v:0', '-show_entries',
  'stream=width,height', '-of', 'csv=p=0', video], { encoding: 'utf8' }).trim().split(',').map(Number)
writeFileSync(assFile, toAss(cues, finalDur, { width: vw || 1440, height: vh || 900, fontSize: subSize }))

// audio: every line adelay'd onto one silent-backed track; video: tpad-freeze if narration overruns
const pad = finalDur > videoDur ? `tpad=stop_mode=clone:stop_duration=${(finalDur - videoDur).toFixed(2)},` : ''
const vf = `[0:v]${pad}subtitles=${assFile.replace(/([\\':])/g, '\\$1')}[v]`
const ffArgs = ['-y', '-loglevel', 'error', '-i', video]
let fc = vf
let map = ['-map', '[v]']
if (voiceOn && cues.length) {
  cues.forEach(c => ffArgs.push('-i', synth(c.spoken).wav))
  const delays = cues.map((c, k) => `[${k + 1}:a]adelay=${Math.round(c.t * 1000)}|${Math.round(c.t * 1000)}[a${k}]`).join(';')
  fc += `;${delays};${cues.map((_, k) => `[a${k}]`).join('')}amix=inputs=${cues.length}:normalize=0[mix]`
  map = ['-map', '[v]', '-map', '[mix]', '-c:a', 'aac']
}
ffArgs.push('-filter_complex', fc, ...map, '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', '-t', String(finalDur), outFile)
execFileSync('ffmpeg', ffArgs, { stdio: ['ignore', 'inherit', 'inherit'] })
console.log(`${outFile} — ${finalDur.toFixed(1)}s, ${cues.length} lines, subtitles ${basename(srtFile)}`)
