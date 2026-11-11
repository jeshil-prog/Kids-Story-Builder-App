import OpenAI, { toFile } from 'openai'
import { redisSet } from './redis.js'
import { uploadToS3 } from './s3.js'

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
    ? `Redraw the attached photograph as a ${styleDesc} illustration, keeping EVERYTHING in it exactly as it is.

The attached photograph is the only source. It is a strict, faithful copy, with only the drawing style changed:
- Exactly the same people. The same number of people, the same faces, hair, skin tones, clothing, poses, expressions and positions, each clearly recognisable as the same person.
- Exactly the same place, background, furniture, food, objects, animals, signs, sky, light, colours, camera angle and framing.
- Do NOT add anything. No extra people, no new characters, no animals or props that are not in the photograph. Do NOT remove, move, swap or replace anything or anyone. Do not change the setting, the time of day or the mood.
- The one and only change is the drawing style: render the whole photograph in the ${style || 'chosen'} illustration style described above, so it looks like a picture book page, never like a photograph.
- Keep the photograph's own shape and framing (do not crop it to a square). Draw lettering only where it is physically part of the photograph, as simply as possible. Child-safe.`
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
    // A supplied photo is EDITED into the chosen style, never re-imagined. The tool is
    // forced to edit mode, the prompt is passed through unchanged, and high input
    // fidelity makes the picture keep the detail of the photograph.
    ...(recreate ? {
      instructions: 'You only call the image tool. Call it exactly once, in edit mode on the attached photograph, with the user prompt passed through word for word. Never rewrite, shorten or add to the prompt.',
      tool_choice: { type: 'image_generation' }
    } : {}),
    input: [{ role: 'user', content }],
    // JPEG keeps each picture a fraction of the size of a PNG, so pages load fast.
    tools: [{
      type: 'image_generation', quality: 'medium', size: recreate ? 'auto' : '1024x1024', output_format: 'jpeg', output_compression: 85,
      ...(recreate ? { action: 'edit', input_fidelity: 'high' } : {})
    }],
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


// A person's own picture, redrawn in the chosen style. This uses the Images
// "edit" route: the photograph itself is the starting point and is edited, so the
// people, place and layout stay as they are and only the drawing style changes.
// (Drawing "from" a photo through a chat model reinvents the picture instead.)
// It runs to the end inside the request, stores the result, and marks the scene
// done in Redis, the same place the background jobs report to.
export async function editPhotoScene({ style, storyId, sceneIndex, sceneImage }) {
  const styleDesc = STYLE_PROMPTS[style] || "children's book illustration, warm and magical"
  const prompt = `Redraw this photograph as a ${styleDesc} illustration, keeping EVERYTHING in it exactly as it is.

This is an edit of the photograph, not a new picture. Only the drawing style changes:
- Exactly the same people: the same number of people, in the same positions, with the same faces, hair, skin tones, clothing, poses and expressions, each clearly recognisable as the same person.
- Exactly the same place, background, objects, animals, signs, sky, light, colours, camera angle and framing.
- Do NOT add, remove, move, swap or replace anything or anyone. No extra people, characters, animals or props. Do not change the setting, the time of day or the mood.
- Render the whole picture in the ${style || 'chosen'} illustration style, so it looks like a picture book page and not like a photograph.
- Draw lettering only where it is physically part of the photograph, as simply as possible. Child-safe.`

  const mime = sceneImage.mime === 'image/png' ? 'image/png' : 'image/jpeg'
  const photo = await toFile(Buffer.from(sceneImage.base64, 'base64'), mime === 'image/png' ? 'photo.png' : 'photo.jpg', { type: mime })
  const result = await openai.images.edit({
    // No model is named on purpose: OpenAI's current default image model is used.
    // (Naming 'gpt-image-1' fails on this account: that model no longer exists.)
    image: photo,
    prompt,
    size: 'auto',
    quality: 'medium',
    input_fidelity: 'high',
    output_format: 'jpeg',
    output_compression: 85
  })
  const b64 = result.data?.[0]?.b64_json
  if (!b64) throw new Error('No image came back from the photo edit')

  const imageUrl = await uploadToS3(b64, 'image/jpeg', `scenes/${storyId}/${sceneIndex}.jpg`)
  await redisSet(`story:${storyId}:scene:${sceneIndex}`, { status: 'done', imageUrl }, 3600)
  return { id: null, status: 'completed' }
}
