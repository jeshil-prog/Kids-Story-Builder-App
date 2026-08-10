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
  // photoBase64 (in-memory, current session only) is preferred when present
  // since it avoids an extra round-trip; photoUrl (durable S3 URL, survives
  // reloads) is the fallback. OpenAI's Responses API officially supports
  // passing a real HTTPS URL directly for input_image, not just a base64
  // data URL, so no server-side fetch/re-encode is needed for the fallback.
  const charsWithPhotos = namedChars.filter((c) => c.photoBase64 || c.photoUrl)
  const charNames = namedChars.map((c) => c.name).join(', ')
  const charDescriptions = namedChars
    .filter((c) => c.description)
    .map((c) => `${c.name}: ${c.description}`)
    .join('\n')

  // Always emitted, not just when a text description happens to exist — a
  // character with no description had nothing but the reference photo
  // itself telling the model what it actually is, which is exactly the
  // condition under which an image model is most likely to drift toward a
  // generic default (a human child protagonist is an extremely common
  // default in children's-book training data), especially for a non-human
  // character. This makes the instruction explicit regardless of whether a
  // text description is available to reinforce it.
  const speciesGuard = charsWithPhotos.length > 0
    ? `CRITICAL — EXACT CHARACTER MATCH REQUIRED: Every character with an attached reference photo above MUST be drawn as EXACTLY what that photo shows — same species/type (if the reference is an animal, draw an animal; never substitute a human child), same breed/build, same coloring and markings, same distinguishing features. Do not reinterpret, humanize, or default to a generic child character under any circumstances — match the reference photo exactly.`
    : ''

  const fullPrompt = `${styleDesc} children's picture book full-page illustration.

THE SCENE:
${imagePrompt}

${charNames ? `CHARACTERS IN THIS SCENE: ${charNames}.` : ''}
${charDescriptions ? `CHARACTER APPEARANCES (preserve exactly):\n${charDescriptions}` : ''}
${speciesGuard}

STYLE RULES: Wide cinematic composition. Rich detailed environment. Characters integrated naturally into the scene. Warm, joyful, magical atmosphere. No text or words in the image. Child-safe.`

  const content = [{ type: 'input_text', text: fullPrompt }]
  for (const char of charsWithPhotos) {
    if (char.photoBase64) {
      const mediaType = char.photoMime || 'image/jpeg'
      content.push({ type: 'input_image', image_url: `data:${mediaType};base64,${char.photoBase64}` })
    } else if (char.photoUrl) {
      content.push({ type: 'input_image', image_url: char.photoUrl })
    }
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
