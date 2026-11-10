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
//
// sceneImage (Tier 2 only): a picture the person supplied for this page. The page is
// an exact recreation of it in the chosen style. It is never stored by us. It
// travels with the job parameters in Redis, which expire after an hour, so a
// retry can still use it.
export async function submitImageJob({ imagePrompt, style, characters, storyId, sceneIndex, sceneImage }) {
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

  // A person's own picture is RECREATED, not reinvented. The picture decides the
  // people, their poses, clothes, the place and everything in it. Only the way it
  // is drawn changes, to the chosen illustration style.
  const recreate = !!sceneImage?.base64

  const fullPrompt = recreate
    ? `Recreate the attached photograph as a ${styleDesc} illustration.

This must be a faithful, exact recreation of the photograph:
- Keep the same number of people, in the same positions, with the same poses, expressions, clothing, hair, skin tones and faces, so each person is clearly recognisable.
- Keep the same place, background, objects, signs, colours, lighting and camera angle, and the same framing and composition.
- Do NOT add, remove, move or swap anything. Do not add people, animals, birds, creatures or props that are not in the photograph. Do not change the setting.
- The ONLY change is the rendering style: redraw the whole photograph in the ${style || 'chosen'} illustration style described above, so it looks like a page from a picture book. Never leave it looking like a photograph.
- Square image. No text or words, except lettering that is physically part of a sign or shirt in the photograph, drawn as simply as possible. Child-safe.

For reference, this is what the page of the story says is happening: ${imagePrompt}
If that description disagrees with the photograph, the photograph wins.`
    : `${styleDesc} children's picture book full-page illustration.

THE SCENE:
${imagePrompt}

${charNames ? `CHARACTERS IN THIS SCENE: ${charNames}.` : ''}
${charDescriptions ? `CHARACTER APPEARANCES (preserve exactly):\n${charDescriptions}` : ''}

${charsWithPhotos.length ? 'REFERENCE IMAGES show how the characters look. Use them only for the faces, hair and features. Always draw in the illustration style above, never in the style of a reference image.' : ''}

STYLE RULES: Wide cinematic composition. Rich detailed environment. Characters integrated naturally into the scene. Warm, joyful, magical atmosphere. No text or words in the image. Child-safe.`

  const content = [{ type: 'input_text', text: fullPrompt }]
  if (recreate) {
    // The photograph is the only picture sent. The people in it are drawn from it
    // directly, so no separate character pictures are added to compete with it.
    content.push({ type: 'input_image', image_url: `data:${sceneImage.mime || 'image/jpeg'};base64,${sceneImage.base64}` })
  } else {
    for (const char of charsWithPhotos) {
      if (char.photoBase64) {
        const mediaType = char.photoMime || 'image/jpeg'
        content.push({ type: 'input_image', image_url: `data:${mediaType};base64,${char.photoBase64}` })
      } else if (char.photoUrl) {
        content.push({ type: 'input_image', image_url: char.photoUrl })
      }
    }
  }

  const response = await openai.responses.create({
    model: 'gpt-5.5',
    input: [{ role: 'user', content }],
    // JPEG keeps each picture a fraction of the size of a PNG, so pages load fast.
    // input_fidelity high makes the model hold on to the details of a supplied photo.
    tools: [{ type: 'image_generation', quality: 'medium', size: '1024x1024', output_format: 'jpeg', output_compression: 85, ...(recreate ? { input_fidelity: 'high' } : {}) }],
    background: true
  })

  // Map OpenAI's response id back to which story/scene this job belongs to
  // (for the webhook), AND keep the original request params (for a possible
  // rate-limit retry later) — both under a 1hr TTL, comfortably longer than
  // gpt-image ever takes even with a retry added in.
  await redisSet(
    `openai_job:${response.id}`,
    { storyId, sceneIndex, originalParams: { imagePrompt, style, characters, storyId, sceneIndex, sceneImage } },
    3600
  )

  return response
}
