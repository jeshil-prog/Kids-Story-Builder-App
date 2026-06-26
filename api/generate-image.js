export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { imagePrompt, style, characterDescriptions } = req.body

  const stylePrefix = {
    'Watercolour': 'soft watercolour children\'s book illustration, painterly, gentle colours,',
    'Pixar-like': 'Pixar 3D animation style, warm cinematic lighting, expressive cute characters, highly detailed,',
    'Storybook': 'classic storybook illustration, detailed, warm, hand-painted, fairy tale style,',
    'Comic book': 'bold comic book illustration, clean linework, bright vivid colours, dynamic composition,',
    'Anime': 'Studio Ghibli anime style, detailed painterly backgrounds, soft lighting, expressive characters,',
    'Claymation': 'claymation stop-motion style, tactile textures, warm whimsical, colourful,'
  }

  const prefix = stylePrefix[style] || 'children\'s book illustration, warm and magical,'
  const charNote = characterDescriptions ? `Characters in this scene: ${characterDescriptions}. ` : ''
  const fullPrompt = `${prefix} ${charNote}${imagePrompt}. No text or words in image. Child-safe, warm, magical, beautiful.`

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: fullPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'medium'
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('OpenAI image error:', response.status, err)
      return res.status(500).json({ error: `Image generation failed: ${response.status}`, detail: err })
    }

    const data = await response.json()
    const b64 = data.data[0].b64_json
    return res.status(200).json({ b64, contentType: 'image/png' })
  } catch (err) {
    console.error('OpenAI image fetch error:', err)
    res.status(500).json({ error: err.message })
  }
}
