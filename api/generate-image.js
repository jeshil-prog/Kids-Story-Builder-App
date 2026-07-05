export const config = { maxDuration: 60 }

const STYLE_PROMPTS = {
  'Watercolour': 'soft watercolour children\'s book illustration, painterly brushstrokes, gentle washes of colour, storybook art',
  'Pixar-like': 'Pixar 3D animation style, warm cinematic lighting, expressive stylised characters, highly detailed environments',
  'Storybook': 'classic fairy tale storybook illustration, hand-painted, warm golden tones, whimsical detailed scenes',
  'Comic book': 'bold comic book illustration, clean linework, vivid saturated colours, dynamic composition',
  'Anime': 'Studio Ghibli anime style, soft warm lighting, expressive characters, lush detailed painterly backgrounds',
  'Claymation': 'Laika studio claymation style, tactile clay textures, bright cheerful colours, stop-motion aesthetic'
}

async function uploadToS3(b64, contentType, key) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const client = new S3Client({
    region: process.env.AWS_REGION || 'ap-southeast-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  })
  const buf = Buffer.from(b64, 'base64')
  await client.send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: buf,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000'
  }))
  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || 'ap-southeast-2'}.amazonaws.com/${key}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { imagePrompt, style, characters, storyId, sceneIndex } = req.body

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

  try {
    let b64

    if (charsWithPhotos.length > 0) {
      const formData = new FormData()
      formData.append('model', 'gpt-image-1.5')
      formData.append('prompt', fullPrompt)
      formData.append('n', '1')
      formData.append('size', '1024x1024')
      formData.append('quality', 'medium')

      for (let i = 0; i < charsWithPhotos.length; i++) {
        const char = charsWithPhotos[i]
        const mediaType = char.photoMime || 'image/jpeg'
        const ext = mediaType.split('/')[1] || 'jpg'
        const bytes = Uint8Array.from(atob(char.photoBase64), c => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: mediaType })
        formData.append('image[]', blob, `char${i}.${ext}`)
      }

      const response = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        body: formData
      })

      if (!response.ok) {
        const err = await response.text()
        console.error('OpenAI edits error:', err)
        b64 = await generateTextOnly(fullPrompt)
      } else {
        const data = await response.json()
        b64 = data.data?.[0]?.b64_json
      }
    } else {
      b64 = await generateTextOnly(fullPrompt)
    }

    if (!b64) return res.status(500).json({ error: 'No image returned from OpenAI' })

    // Upload to S3
    const key = `scenes/${storyId || 'unknown'}/${sceneIndex ?? Date.now()}.png`
    const imageUrl = await uploadToS3(b64, 'image/png', key)

    return res.status(200).json({ imageUrl, contentType: 'image/png' })

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
      quality: 'medium'
    })
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI error: ${err}`)
  }

  const data = await response.json()
  return data.data?.[0]?.b64_json
}
