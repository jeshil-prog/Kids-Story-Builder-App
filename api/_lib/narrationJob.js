// Generates one scene's narration audio and uploads it to S3, returning a
// durable URL — the same pattern already proven for scene images, applied to
// audio. Unlike image generation, OpenAI's TTS endpoint has no
// background/webhook mode, so this runs synchronously within the calling
// request rather than firing a job and waiting for a callback. That's fine:
// it's called from submit-image-job.js alongside (not blocking) the image
// job, and Create.jsx fires all scenes' submissions concurrently without
// waiting on any of them before navigating.

import { uploadToS3 } from './s3.js'

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
  const b64 = Buffer.from(arrayBuffer).toString('base64')
  const key = `narration/${storyId}/${sceneIndex}.mp3`
  return uploadToS3(b64, 'audio/mpeg', key)
}
