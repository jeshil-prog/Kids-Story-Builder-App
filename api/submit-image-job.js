// Submits an image generation job via OpenAI's Responses API with
// background: true. This call returns in a second or two — it does NOT wait
// for the image. The actual result shows up later as a webhook call to
// /api/webhook-openai-image, which is what writes the final imageUrl to Redis.
//
// This replaces the old pattern in generate-image.js of calling
// images.edit()/images.generate() directly and blocking on the HTTP request
// until OpenAI responds (which is what caused the 60s Vercel timeout).

export const config = { maxDuration: 30 }

import { redisSet } from './_lib/redis.js'
import { submitImageJob } from './_lib/imageJob.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { imagePrompt, style, characters, storyId, sceneIndex } = req.body

  if (!storyId || sceneIndex === undefined) {
    return res.status(400).json({ error: 'Missing storyId or sceneIndex' })
  }

  const redisKey = `story:${storyId}:scene:${sceneIndex}`

  try {
    await redisSet(redisKey, { status: 'processing' }, 3600)

    const response = await submitImageJob({ imagePrompt, style, characters, storyId, sceneIndex })

    return res.status(200).json({ jobId: response.id, status: response.status })
  } catch (err) {
    console.error('submit-image-job error:', err)
    await redisSet(redisKey, { status: 'error', error: err.message }, 3600)
    return res.status(500).json({ error: err.message || 'Failed to submit image job' })
  }
}
