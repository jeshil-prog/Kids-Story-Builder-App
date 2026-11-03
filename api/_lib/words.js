// Splitting story text into "words", the same way everywhere.
//
// English, Spanish, French and Hindi put spaces between words, so splitting on
// spaces works. Chinese has no spaces, so it is cut into words with the
// browser's built in word splitter. The server uses an identical copy of this
// file (api/_lib/words.js), so the word timings it works out line up exactly
// with the words the reader highlights.

// Letters, marks (the small signs Hindi uses) and numbers. Everything else is
// punctuation or spacing.
export const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '')

export function tokenize(text, lang = 'en') {
  const t = (text || '').trim()
  if (!t) return []
  if (lang !== 'zh') return t.split(/\s+/).filter(Boolean)

  let segments
  try {
    segments = [...new Intl.Segmenter('zh', { granularity: 'word' }).segment(t)]
      .map(s => ({ text: s.segment, word: s.isWordLike !== false }))
  } catch {
    // Older browsers: one character at a time.
    segments = Array.from(t).map(ch => ({ text: ch, word: /[\p{L}\p{N}]/u.test(ch) }))
  }

  const out = []
  let lead = '' // punctuation that arrived before any word, kept for the next word
  for (const s of segments) {
    if (/^\s+$/.test(s.text)) continue
    if (s.word) { out.push(lead + s.text); lead = '' }
    else if (/^[「『（(“‘"'«]+$/.test(s.text)) lead += s.text // opening quotes belong to the next word
    else if (out.length) out[out.length - 1] += s.text
    else lead += s.text
  }
  if (lead && out.length) out[out.length - 1] += lead
  return out
}

// Chinese is written without gaps between words.
export const wordGap = (lang) => (lang === 'zh' ? '' : ' ')

// Where in the narration each sound effect should play. A cue's triggerPhrase
// is matched against the narration ignoring spaces, capitals and punctuation,
// so it works in every language. Returns [{ wordIndex, sound }] in order.
export function buildCueTimeline(narration, cues, lang = 'en') {
  if (!narration || !Array.isArray(cues) || !cues.length) return []
  const tokens = tokenize(narration, lang)
  const offsets = []
  let flat = ''
  tokens.forEach((tok) => { offsets.push(flat.length); flat += norm(tok) })
  const tokenAt = (pos) => {
    let idx = 0
    for (let i = 0; i < offsets.length; i++) { if (offsets[i] <= pos) idx = i; else break }
    return idx
  }
  const timeline = []
  for (const cue of cues) {
    if (!cue?.triggerPhrase || !cue?.sound) continue
    const needle = norm(cue.triggerPhrase)
    if (!needle) continue
    const pos = flat.indexOf(needle)
    if (pos < 0) continue
    timeline.push({ wordIndex: tokenAt(pos), sound: cue.sound })
  }
  return timeline.sort((a, b) => a.wordIndex - b.wordIndex)
}
