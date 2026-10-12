// Generates one scene's narration audio and uploads it to S3, returning a
// durable URL, plus the exact time each word is spoken (used by Learning
// mode to highlight words in time with the voice).
//
// Unlike image generation, OpenAI's TTS endpoint has no background/webhook
// mode, so this runs synchronously within the calling request.
//
// Word timing: the finished audio is run through OpenAI's transcription
// endpoint, which reports when each spoken word starts. That is lined up
// against the story's own text. If the timing step fails for any reason the
// narration still succeeds (wordTimes is null) and the reader falls back to
// an estimate, so timing can never block a story from being ready.

import { uploadToS3 } from './s3.js'

const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

// Lines the story's own words up with the transcribed words and returns one
// start time (seconds) per story word. Words the transcription missed or
// split differently are filled in by interpolating between known neighbours.
export function alignWordTimes(narrationText, heard) {
  const words = (narrationText || '').trim().split(/\s+/).filter(Boolean)
  const n = words.length
  const starts = new Array(n).fill(null)
  let j = 0
  for (let i = 0; i < n; i++) {
    const target = norm(words[i])
    if (!target) continue
    for (let k = j; k < Math.min(heard.length, j + 4); k++) {
      const h = norm(heard[k].word)
      if (h === target || (h && target.startsWith(h)) || (h && h.startsWith(target))) {
        starts[i] = heard[k].start
        j = k + 1
        break
      }
    }
  }
  const matched = starts.filter(v => v !== null).length
  // If most words didn't line up, the timing can't be trusted.
  if (n === 0 || matched / n < 0.7) return null

  // Fill gaps by interpolation.
  const lastEnd = heard.length ? heard[heard.length - 1].end : 0
  if (starts[0] === null) starts[0] = 0
  let prev = 0
  for (let i = 1; i <= n; i++) {
    if (i < n && starts[i] === null) continue
    const nextVal = i < n ? starts[i] : lastEnd
    const gap = i - prev
    for (let g = 1; g < gap; g++) starts[prev + g] = starts[prev] + ((nextVal - starts[prev]) * g) / gap
    prev = i
  }
  // Keep strictly non-decreasing.
  for (let i = 1; i < n; i++) if (starts[i] < starts[i - 1]) starts[i] = starts[i - 1]
  return starts.map(v => Math.round(v * 100) / 100)
}

async function transcribeWordTimes(audioBuffer, narrationText) {
  const form = new FormData()
  form.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'narration.mp3')
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  // Giving it the real text helps it spell names and unusual words the same way.
  form.append('prompt', narrationText.slice(0, 600))

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form
  })
  if (!res.ok) throw new Error(`Transcription failed: ${res.status} ${await res.text().catch(() => '')}`)
  const data = await res.json()
  return alignWordTimes(narrationText, data.words || [])
}

export async function generateNarrationAudio({ narrationText, storyId, sceneIndex }) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      input: narrationText,
      voice: 'coral',
      instructions: 'Speak warmly and gently, like a parent reading a bedtime story. Use a calm, expressive, storytelling tone.',
      speed: 0.9
    })
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`OpenAI TTS failed: ${response.status} ${errText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buf = Buffer.from(arrayBuffer)
  const key = `narration/${storyId}/${sceneIndex}.mp3`

  // Upload and timing run together so timing adds no extra wait.
  const [narrationUrl, wordTimes] = await Promise.all([
    uploadToS3(buf.toString('base64'), 'audio/mpeg', key),
    transcribeWordTimes(buf, narrationText).catch((err) => {
      console.error(`Word timing failed for scene ${sceneIndex}:`, err.message)
      return null
    })
  ])
  return { narrationUrl, wordTimes }
}
