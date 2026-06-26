export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { imagePrompt, style } = req.body

  const stylePrefix = {
    'Watercolour': 'soft watercolour children\'s book illustration, painterly, gentle colours,',
    'Pixar-like': 'Pixar 3D animation style, warm cinematic lighting, expressive cute characters, highly detailed,',
    'Storybook': 'classic storybook illustration, detailed, warm, hand-painted, fairy tale style,',
    'Comic book': 'bold comic book illustration, clean linework, bright vivid colours, dynamic composition,',
    'Anime': 'Studio Ghibli anime style, detailed painterly backgrounds, soft lighting, expressive characters,',
    'Claymation': 'claymation stop-motion style, tactile textures, warm whimsical, colourful,'
  }

  const prefix = stylePrefix[style] || 'children\'s book illustration, warm and magical,'
  const fullPrompt = `${prefix} ${imagePrompt}. No text or words in image. Child-safe, warm, magical, dreamlike, beautiful.`

  // Pollinations AI - free, no key, works from Vercel
  // Encode the prompt for URL
  const encodedPrompt = encodeURIComponent(fullPrompt)
  const seed = Math.floor(Math.random() * 999999)
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${seed}&nologo=true&enhance=true`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'image/jpeg,image/png,image/*' }
    })

    if (!response.ok) {
      console.error('Pollinations error:', response.status, await response.text())
      return res.status(500).json({ error: `Image generation failed: ${response.status}` })
    }

    const arrayBuffer = await response.arrayBuffer()
    const b64 = Buffer.from(arrayBuffer).toString('base64')
    const contentType = response.headers.get('content-type') || 'image/jpeg'

    return res.status(200).json({ b64, contentType })
  } catch (err) {
    console.error('Pollinations fetch error:', err)
    res.status(500).json({ error: err.message })
  }
}
