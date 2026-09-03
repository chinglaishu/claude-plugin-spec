// THE PROVED PHRASE — which words of a beat's sentence the moment on show is proving.
//
// Design C's rule (the human, 2026-09-02/03): EVERY TEXT ONCE. The sentence is written once, in the
// row's words cell; the moment's name is written once, in the strip's caption; the chips over the
// two pictures carry only EXPECTED and ACTUAL with the value. So the words cell cannot repeat the
// claim — instead it UNDERLINES the part of the sentence the current moment proves, and the eye is
// taken to the phrase rather than handed a second copy of it.
//
// Pure, and authored like tools/board/stepper.js as a real verbatim-inlined script: build-board.mjs
// reads it into its own <script> before the client, and it registers on globalThis so node --test
// (tools/words.test.mjs) reaches the SAME bytes the board runs. Nothing imports it.
(function () {
  'use strict'

  // a word EDGE: a value found inside a longer word is not the sentence saying it ("ick" in
  // "picker" is noise, and an underline drawn there is a lie about what was proved)
  function wordish (ch) { return /[A-Za-z0-9]/.test(ch) }
  function edged (text, at, len) {
    var before = at > 0 ? text.charAt(at - 1) : ''
    var after = (at + len < text.length) ? text.charAt(at + len) : ''
    var head = text.charAt(at)
    var tail = text.charAt(at + len - 1)
    if (before && wordish(before) && wordish(head)) return false
    if (after && wordish(after) && wordish(tail)) return false
    return true
  }
  // the first occurrence of `needle` in `hay`, case-insensitively, at a word edge; -1 for none.
  // Case-insensitive on purpose: the sentence is prose and the claim is the app's own string, so
  // "Published" and "published" are the same fact. The RANGE returned is always the sentence's own
  // characters — the caller underlines what is written, never what was searched for.
  function findAt (hay, needle) {
    if (!hay || !needle) return -1
    var h = hay.toLowerCase()
    var n = needle.toLowerCase()
    var at = h.indexOf(n)
    while (at >= 0) {
      if (edged(hay, at, n.length)) return at
      at = h.indexOf(n, at + 1)
    }
    return -1
  }

  // provedPhrase(text, claim) → [start, end] | null
  //   1. the claim's `expected`, where the sentence says it — one character is enough when it is a
  //      LETTER OR DIGIT (2026-09-04, the review's I5: the old two-character floor threw away the
  //      commonest claim a counter makes, and edged() is already the guard it was standing in for —
  //      a digit inside a longer number is refused because the char beside it is wordish). A
  //      one-character PUNCTUATION value keeps the floor: edged() lets "-" or "·" land anywhere;
  //   2. else the LONGEST run of three or more words of the claim's own label that the sentence
  //      carries — a label is the assertion's name, so its longest shared run is the phrase the
  //      assertion is about;
  //   3. else null. Nothing is underlined rather than something guessed (rule 3's shape, in words).
  function provedPhrase (text, claim) {
    var t = String(text == null ? '' : text)
    if (!t || !claim || typeof claim !== 'object') return null
    var exp = typeof claim.expected === 'string' ? claim.expected.replace(/\s+/g, ' ').trim() : ''
    var wordy = exp.length === 1 && wordish(exp)
    if (exp.length >= 2 || wordy) {
      var at = findAt(t, exp)
      if (at >= 0) return [at, at + exp.length]
    }
    var lab = typeof claim.label === 'string' ? claim.label.replace(/\s+/g, ' ').trim() : ''
    if (!lab) return null
    var words = lab.split(' ').filter(Boolean)
    for (var len = words.length; len >= 3; len--) {
      for (var s = 0; s + len <= words.length; s++) {
        var run = words.slice(s, s + len).join(' ')
        var k = findAt(t, run)
        if (k >= 0) return [k, k + run.length]
      }
    }
    return null
  }

  globalThis.SBWords = { provedPhrase: provedPhrase }
})()
