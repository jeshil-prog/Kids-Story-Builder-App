export const config = { maxDuration: 60 }

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

  const { imagePrompt, style, characters } = req.body

  const styleDesc = STYLE_PROMPTS[style] || "children's book illustration, warm and magical"
  const namedChars = (characters || []).filter(c => c.name)
  const charsWithPhotos = namedChars.filter(c => c.photo)

  const charNames = namedChars.map(c => c.name).join(', ')

  const fullPrompt = `${styleDesc} children's picture book full-page illustration.

THE SCENE:
${imagePrompt}

${charNames ? `CHARACTERS IN THIS SCENE: ${charNames}. Preserve their exact appearance — same skin tone, hair colour, hair style, face shape, and ethnicity. Do not alter any features.` : ''}

STYLE RULES: Wide cinematic composition. Rich detailed environment. Characters integrated naturally into the scene. Warm, joyful, magical atmosphere. No text or words in the image. Child-safe.`

  try {
    let b64

    if (charsWithPhotos.length > 0) {
      // Use the edits endpoint — accepts reference images for character likeness
      // Convert base64 data URLs to Buffers for multipart form upload
      const FormData = (await import('node:stream')).PassThrough
      
      // Build multipart form manually since we can't use the SDK
      const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`
      const parts = []

      // Add each character photo as a reference image
      for (let i = 0; i < charsWithPhotos.length; i++) {
        const char = charsWithPhotos[i]
        const matches = char.photo.match(/^data:(.+);base64,(.+)$/)
        if (!matches) continue
        const [, mediaType, b64Data] = matches
        const ext = mediaType.split('/')[1] || 'png'
        const imgBuffer = Buffer.from(b64Data, 'base64')

        parts.push(
          `--${boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="char${i}.${ext}"\r\nContent-Type: ${mediaType}\r\n\r\n`,
          imgBuffer,
          '\r\n'
        )
      }

      // Add remaining fields
      const fields = { model: 'gpt-image-1.5', prompt: fullPrompt, n: '1', size: '1024x1024' }
      for (const [key, val] of Object.entries(fields)) {
        parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`)
      }
      parts.push(`--${boundary}--\r\n`)

      const bodyParts = parts.map(p => typeof p === 'string' ? Buffer.from(p) : p)
      const body = Buffer.concat(bodyParts)

      const response = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body
      })

      if (!response.ok) {
        const err = await response.text()
        console.error('OpenAI edits error:', err)
        // Fall back to text-only generation
        b64 = await generateTextOnly(fullPrompt)
      } else {
        const data = await response.json()
        b64 = data.data?.[0]?.b64_json
      }

    } else {
      // No photos — straight text-to-image
      b64 = await generateTextOnly(fullPrompt)
    }

    if (!b64) return res.status(500).json({ error: 'No image returned from OpenAI' })

    return res.status(200).json({ b64, contentType: 'image/png' })

  } catch (err) {
    console.error('generate-image error:', err)
    return res.status(500).json({ error: err.message || 'Image generation failed' })
  }
}

async function generateTextOnly(prompt) {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-image-1.5',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard'
    })
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI generations error: ${err}`)
  }

  const data = await response.json()
  return data.data?.[0]?.b64_json
}
