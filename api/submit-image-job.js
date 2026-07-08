// Submits an image generation job via OpenAI's Responses API with
// background: true. This call returns in a second or two — it does NOT wait
// for the image. The actual result shows up later as a webhook call to
// /api/webhook-openai-image, which is what writes the final imageUrl to Redis.
//
// This replaces the old pattern in generate-image.js of calling
// images.edit()/images.generate() directly and blocking on the HTTP request
// until OpenAI responds (which is what caused the 60s Vercel timeout).

export const config = { maxDuration: 30 }

import OpenAI from 'openai'
import { redisSet } from './_lib/redis.js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const STYLE_PROMPTS = {
  'Watercolour': 'soft watercolour children\'s book illustration, painterly brushstrokes, gentle washes of colour, storybook art',
  'Pixar-like': 'Pixar 3D animation style, warm cinematic lighting, expressive stylised characters, highly detailed environments',
  'Storybook': 'classic fairy tale storybook illustration, hand-painted, warm golden tones, whimsical detailed scenes',
  'Comic book': 'bold comic book illustration, clean linework, vivid saturated colours, dynamic composition',
  'Anime': 'Studio Ghibli anime style, soft warm lighting, expressive characters, lush detailed painterly backgrounds',
  'Claymation': 'Laika studio claymation style, tactile clay textures, bright cheerful colours, stop-motion aesthetic'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { imagePrompt, style, characters, storyId, sceneIndex } = req.body

  if (!storyId || sceneIndex === undefined) {
    return res.status(400).json({ error: 'Missing storyId or sceneIndex' })
  }

  const styleDesc = STYLE_PROMPTS[style] || "children's book illustration, warm and magical"
  const namedChars = (characters || []).filter(c => c.name)
  const charsWithPhotos = namedChars.filter(c => c.photoBase64)
  const charNames = namedChars.map(c => c.name).join(', ')
  const charDescriptions = namedChars
    .filter(c => c.description)
    .map(c => `${c.name}: ${c.description}`)
    .join('\n')

  const fullPrompt = `${styleDesc} children's picture book full-page illustration.

THE SCENE:
${imagePrompt}

${charNames ? `CHARACTERS IN THIS SCENE: ${charNames}.` : ''}
${charDescriptions ? `CHARACTER APPEARANCES (preserve exactly):\n${charDescriptions}` : ''}

STYLE RULES: Wide cinematic composition. Rich detailed environment. Characters integrated naturally into the scene. Warm, joyful, magical atmosphere. No text or words in the image. Child-safe.`

  const content = [{ type: 'input_text', text: fullPrompt }]
  for (const char of charsWithPhotos) {
    const mediaType = char.photoMime || 'image/jpeg'
    content.push({ type: 'input_image', image_url: `data:${mediaType};base64,${char.photoBase64}` })
  }

  const redisKey = `story:${storyId}:scene:${sceneIndex}`

  try {
    await redisSet(redisKey, { status: 'processing' }, 3600)

    const response = await openai.responses.create({
      model: 'gpt-5.5',
      input: [{ role: 'user', content }],
      tools: [{ type: 'image_generation', quality: 'medium', size: '1024x1024' }],
      background: true
    })

    // Map OpenAI's response id back to which story/scene this job belongs to,
    // so the webhook (which only receives a response id) knows where to write
    // the result. 1hr TTL — comfortably longer than gpt-image ever takes.
    await redisSet(`openai_job:${response.id}`, { storyId, sceneIndex }, 3600)

    return res.status(200).json({ jobId: response.id, status: response.status })
  } catch (err) {
    console.error('submit-image-job error:', err)
    await redisSet(redisKey, { status: 'error', error: err.message }, 3600)
    return res.status(500).json({ error: err.message || 'Failed to submit image job' })
  }
}
