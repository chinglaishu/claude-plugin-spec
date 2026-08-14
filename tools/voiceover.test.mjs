// Voice-over: the gate that decides WHEN a watchable run is voiced (pure), and an end-to-end proof
// that the render shell actually muxes an audio track from a pack + beats + a banded recording —
// with a STUB synthesizer, so it runs deterministically with no piper installed. The pure narration
// logic is unit-tested in narrate.test.mjs; this file covers the two seams voice-over adds: the
// decision (spec-store.shouldVoice) and the mux (tools/narrate-run.mjs render).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shouldVoice } from './spec-store.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const RUN = join(HERE, 'narrate-run.mjs')

// ── the gate ────────────────────────────────────────────────────────────────────────────
// Voice-over is deliberately narrow: a single WATCHABLE FLOW (one named test on one screen) that
// HAS a narration pack, with ffmpeg present to mux — and only when the per-project switch is on.
// Everything else stays silent, honestly (board R10 rule 3 / init R6).
test('shouldVoice: on only with the switch, a screen, a named flow, a pack, and ffmpeg', () => {
  const on = { voiceOver: true, screen: 'board', grep: 'the flow', packExists: true, ffmpeg: true }
  assert.equal(shouldVoice(on), true, 'all conditions met ⇒ voice')
  assert.equal(shouldVoice({ ...on, voiceOver: false }), false, 'switch off ⇒ silent (the default)')
  assert.equal(shouldVoice({ ...on, packExists: false }), false, 'no narration pack ⇒ silent, never faked')
  assert.equal(shouldVoice({ ...on, grep: '' }), false, 'no single flow (Run all) ⇒ silent')
  assert.equal(shouldVoice({ ...on, screen: null }), false, 'a whole-suite run ⇒ silent')
  assert.equal(shouldVoice({ ...on, ffmpeg: false }), false, 'no ffmpeg to mux ⇒ silent')
  assert.equal(shouldVoice({}), false, 'nothing set ⇒ silent')
})

// ── the mux ─────────────────────────────────────────────────────────────────────────────
const has = cmd => { try { execFileSync(cmd, ['-version'], { stdio: 'ignore' }); return true } catch { return false } }
const FF = has('ffmpeg') && has('ffprobe')

test('render muxes a real audio track from a pack + beats + a banded recording (stub synth, no piper)',
  { skip: FF ? false : 'ffmpeg/ffprobe not installed' }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'voiceover-'))
    const streams = out => execFileSync('ffprobe',
      ['-v', 'quiet', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', out], { encoding: 'utf8' })
    try {
      // A 3s recording whose top band is light, then ink (black) after t=1s. scanBand reads that
      // as one ink onset → buildAnchors gets one true (wall,video) anchor from the first step beat.
      const video = join(dir, 'rec.mp4')
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=320x240:d=3',
        '-vf', "drawbox=x=0:y=0:w=320:h=36:color=black:t=fill:enable='gte(t,1)'", '-r', '10',
        '-pix_fmt', 'yuv420p', video], { stdio: 'pipe' })

      // The run's beats: a first flowStep (kind 'step') anchors the ink onset, then a passing
      // requirement fires the pack's pass cue.
      const beats = join(dir, 'beats.jsonl')
      writeFileSync(beats, [
        JSON.stringify({ t: 1000, kind: 'step', label: '1. do the thing' }),
        JSON.stringify({ t: 1500, kind: 'req-done', label: 'R1 pass' })
      ].join('\n') + '\n')

      // A tiny pack with pass AND fail variants — the run's beats choose which fires.
      const pack = join(dir, 'narration.json')
      writeFileSync(pack, JSON.stringify({
        voice: 'stub-voice',
        intro: { text: 'Here is the flow.' },
        cues: [
          { on: 'req-done', match: '^R1 pass', text: 'Requirement one holds.' },
          { on: 'req-done', match: '^R1 fail', text: 'Requirement one broke.' }
        ]
      }))

      // A dummy model so synth()'s existsSync(model) guard passes, and a STUB synth that writes a
      // real (silent) wav with ffmpeg — no piper anywhere in this test.
      const voices = join(dir, 'voices'); mkdirSync(voices)
      writeFileSync(join(voices, 'stub-voice.onnx'), '')
      const env = {
        ...process.env,
        BOARD_PIPER_VOICES: voices,
        BOARD_NARRATION_CACHE: join(dir, 'cache'),
        BOARD_SYNTH_CMD: 'ffmpeg -y -loglevel error -f lavfi -i anullsrc=r=22050:cl=mono -t 0.6 {wav}'
      }

      // Voiced: the output carries an audio stream.
      const voiced = join(dir, 'voiced.mp4')
      execFileSync(process.execPath,
        [RUN, 'render', '--video', video, '--beats', beats, '--pack', pack, '--out', voiced],
        { env, stdio: 'pipe' })
      assert.ok(existsSync(voiced), 'render produced the mp4')
      assert.match(streams(voiced), /audio/, 'the voiced recording has an audio track')

      // --no-voice: subtitles only, no audio track — the same seam the board uses when it degrades.
      const silent = join(dir, 'silent.mp4')
      execFileSync(process.execPath,
        [RUN, 'render', '--video', video, '--beats', beats, '--pack', pack, '--out', silent, '--no-voice'],
        { env, stdio: 'pipe' })
      assert.doesNotMatch(streams(silent), /audio/, '--no-voice leaves the recording silent')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
