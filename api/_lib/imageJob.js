import OpenAI from 'openai'
import { redisSet } from './redis.js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const STYLE_PROMPTS = {
  'Watercolour': 'soft watercolour children\'s book illustration, painterly brushstrokes, gentle washes of colour, storybook art',
  'Pixar-like': 'Pixar 3D animation style, warm cinematic lighting, expressive stylised characters, highly detailed environments',
  'Storybook': 'classic fairy tale storybook illustration, hand-painted, warm golden tones, whimsical detailed scenes',
  'Comic book': 'bold comic book illustration, clean linework, vivid saturated colours, dynamic composition',
  'Anime': 'Studio Ghibli anime style, soft warm lighting, expressive characters, lush detailed painterly backgrounds',
  'Claymation': 'Laika studio claymation style, tactile clay textures, bright cheerful colours, stop-motion aesthetic'
}

// Submits (or re-submits, on rate-limit retry) a single scene's image job.
// Stores the original params alongside the job mapping so a rate-limited
// job can retry itself later without needing the client to resend anything.
export async function submitImageJob({ imagePrompt, style, characters, storyId, sceneIndex }) {
  const styleDesc = STYLE_PROMPTS[style] || "children's book illustration, warm and magical"
  const namedChars = (characters || []).filter((c) => c.name)
  const charsWithPhotos = namedChars.filter((c) => c.photoBase64)
  const charNames = namedChars.map((c) => c.name).join(', ')
  const charDescriptions = namedChars
    .filter((c) => c.description)
    .map((c) => `${c.name}: ${c.description}`)
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

  const response = await openai.responses.create({
    model: 'gpt-5.5',
    input: [{ role: 'user', content }],
    tools: [{ type: 'image_generation', quality: 'medium', size: '1024x1024' }],
    background: true
  })

  // Map OpenAI's response id back to which story/scene this job belongs to
  // (for the webhook), AND keep the original request params (for a possible
  // rate-limit retry later) — both under a 1hr TTL, comfortably longer than
  // gpt-image ever takes even with a retry added in.
  await redisSet(
    `openai_job:${response.id}`,
    { storyId, sceneIndex, originalParams: { imagePrompt, style, characters, storyId, sceneIndex } },
    3600
  )

  return response
}
