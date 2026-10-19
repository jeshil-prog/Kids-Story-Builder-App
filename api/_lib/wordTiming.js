// Sharpens word timings using the pauses in the actual narration audio.
//
// Speech to text gives a good rough time for each word, but it is unreliable
// right around pauses: it can start the next word before the voice has come
// back, or leave the previous word lit long after. The voice itself is the
// ground truth, so this measures the real silences in the audio and pins the
// first word after each pause to the moment the voice actually resumes.

const MIN_PAUSE = 0.16 // seconds of quiet that counts as a pause

// Decodes an mp3 buffer and returns the pauses [{start, end}] plus where the
// speech begins and ends. Returns null if the audio can't be decoded.
export async function findPauses(mp3Buffer) {
  let decoder
  try {
    // Loaded only when needed, and safely: if this library is ever missing,
    // pause detection is skipped rather than breaking story creation.
    const { MPEGDecoder } = await import('mpg123-decoder')
    decoder = new MPEGDecoder()
    await decoder.ready
    const { channelData, sampleRate } = decoder.decode(new Uint8Array(mp3Buffer))
    const pcm = channelData[0]
    if (!pcm || !pcm.length) return null

    const hop = Math.max(1, Math.round(sampleRate * 0.01)) // 10ms windows
    const n = Math.floor(pcm.length / hop)
    const rms = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      let sum = 0
      for (let j = i * hop; j < (i + 1) * hop; j++) sum += pcm[j] * pcm[j]
      rms[i] = Math.sqrt(sum / hop)
    }
    // Speech level = a high percentile, so quiet words don't set the bar.
    const sorted = Array.from(rms).sort((a, b) => a - b)
    const level = sorted[Math.floor(sorted.length * 0.9)] || 0
    if (level <= 0) return null
    const thr = level * 0.08
    const dt = hop / sampleRate
    const duration = pcm.length / sampleRate

    const quiet = []
    let i = 0
    while (i < n) {
      if (rms[i] < thr) {
        let j = i
        while (j < n && rms[j] < thr) j++
        quiet.push({ start: i * dt, end: j * dt })
        i = j
      } else i++
    }
    let speechStart = 0
    let speechEnd = duration
    if (quiet.length && quiet[0].start < 0.05) speechStart = quiet[0].end
    const last = quiet[quiet.length - 1]
    if (last && last.end > duration - 0.05) speechEnd = last.start
    const pauses = quiet.filter(q => q.end - q.start >= MIN_PAUSE && q.start > speechStart + 0.05 && q.end < speechEnd - 0.05)
    return { pauses, speechStart, speechEnd, duration }
  } catch (err) {
    console.error('Pause detection failed:', err.message)
    return null
  } finally {
    try { decoder?.free() } catch {}
  }
}

const endsWithBreak = (w) => /[,.;:!?…—–]["'’”)\]]*$/.test(w)
const weightOf = (w) => (w.replace(/[^\p{L}\p{N}]/gu, '').length || 1) + 1.5

// words: the story's words. starts: rough start time per word (from speech to
// text). Returns refined start times, or the originals if anything looks off.
export function refineWithPauses(words, starts, info) {
  try {
    const n = words.length
    if (!info || n < 2 || starts.length !== n) return starts
    const { pauses, speechStart, speechEnd } = info

    // Match each pause to the punctuation mark it belongs to, in order.
    const breakIdx = []
    for (let i = 0; i < n - 1; i++) if (endsWithBreak(words[i])) breakIdx.push(i)
    const matches = [] // { after: wordIndex, start, end }
    let from = 0
    for (const p of pauses) {
      const mid = (p.start + p.end) / 2
      let best = -1
      let bestDist = 1.3
      for (let b = from; b < breakIdx.length; b++) {
        const d = Math.abs(starts[breakIdx[b] + 1] - mid)
        if (d < bestDist) { bestDist = d; best = b }
        if (starts[breakIdx[b] + 1] - mid > 1.3) break
      }
      if (best >= 0) {
        matches.push({ after: breakIdx[best], start: p.start, end: p.end })
        from = best + 1
      }
    }

    // Build the stretches of continuous speech between matched pauses.
    const runs = []
    let a = 0
    let rs = speechStart
    for (const m of matches) {
      runs.push({ a, b: m.after, rs, re: m.start })
      a = m.after + 1
      rs = m.end
    }
    runs.push({ a, b: n - 1, rs, re: speechEnd })

    const out = starts.slice()
    for (const r of runs) {
      if (r.b < r.a || r.re <= r.rs) return starts
      let total = 0
      for (let i = r.a; i <= r.b; i++) total += weightOf(words[i])
      let acc = 0
      for (let i = r.a; i <= r.b; i++) {
        const byLength = r.rs + ((r.re - r.rs) * acc) / total
        // Blend length based timing with the speech to text time, kept inside
        // this stretch. The first word of a stretch is pinned to the moment
        // the voice actually resumes.
        const heard = Math.min(Math.max(starts[i], r.rs), r.re)
        out[i] = i === r.a ? r.rs : 0.5 * byLength + 0.5 * heard
        acc += weightOf(words[i])
      }
    }
    for (let i = 1; i < n; i++) if (out[i] < out[i - 1]) out[i] = out[i - 1]
    return out.map(v => Math.round(v * 100) / 100)
  } catch (err) {
    console.error('Pause refinement failed:', err.message)
    return starts
  }
}
