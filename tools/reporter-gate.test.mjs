// tools/reporter-gate.test.mjs — WHAT THE FOLD RECORDS ABOUT ONE LANDED REPLICA.
//
// The board's storyline carries ONE stale banner, and it names four ways the Expected picture stops
// being true. Two of them are properties of the FILE the fold just landed rather than of anything
// the board can re-derive cheaply: the PIN the in-page gate checked the replica against (so a later
// build can see the harvest move past it by hashing the skeleton it already reads, instead of
// re-reading 8 MB of committed html), and whether the capture ran out of BYTES.
//
// The reporter recorded only {gaps, gated}, so tools/build-board.mjs's `b.gate.pin` read undefined
// and `lstale`/`trunc` could never be true — a renderer reacting to a field nothing writes, with a
// board test that forced the attribute by hand and went green over the dead wire (the review's C1).
// This pins the wire itself.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { noteReplica } from '../spec/_results-reporter.mjs'
import { withReplicaAttrs } from './replica-gate.mjs'

const ROOT = '<div class="rep r0" data-replica-kit="replica-1" data-replica-region="0 0 100 100">x</div>'
// noteReplica takes the replica's own TEXT (2026-09-06, the data home): the fold holds those bytes
// from the moment it lands them, and a blob has no path to re-read.

test('noteReplica records the PIN the gate checked the replica against', () => {
  const html = withReplicaAttrs(ROOT, { layout: 'a1b2c3d4e5f60718', gaps: [] })
  {
    const row = {}
    noteReplica(row, html, [], 'board', 'R1', 1, 'after')
    assert.equal(row.gate.pin, 'a1b2c3d4e5f60718',
      'without the pin the board can never say "layout moved" — the banner reason is dead wire')
    assert.equal(row.gate.gaps, 0)
    assert.equal(row.gate.gated, true)
    assert.equal(row.gate.trunc, false)
  }
})

test('noteReplica records a TRUNCATED capture in its own word, beside the gap it also counts', () => {
  const html = withReplicaAttrs(ROOT.replace('data-replica-kit', 'data-replica-truncated="1" data-replica-kit'),
    { layout: 'ffff0000ffff0000', gaps: [] })
  {
    const row = {}
    noteReplica(row, html, [], 'board', 'R1', 1, 'after')
    assert.equal(row.gate.trunc, true, 'the banner says "truncated" in its own words, not just "replica gap"')
    assert.equal(row.gate.gaps, 1, 'and it still counts as a gap')
  }
})

test('noteReplica on an UNGATED replica reports no pin rather than a wrong one', () => {
  {
    const row = {}
    noteReplica(row, ROOT, [], 'board', 'R1', 1, 'after')
    assert.equal(row.gate.gated, false)
    assert.equal(row.gate.pin, '', 'nothing walked it back, so there is no pin to compare — never a guess')
  }
})
