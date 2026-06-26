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

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: fullPrompt }]
          }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            responseMimeType: 'image/jpeg'
          }
        })
      }
    )

    if (!response.ok) {
      const err = await response.text()
      console.error('Gemini error:', response.status, err)
      return res.status(500).json({ error: `Image generation failed: ${response.status}`, detail: err })
    }

    const data = await response.json()

    const parts = data?.candidates?.[0]?.content?.parts
    const imagePart = parts?.find(p => p.inlineData)

    if (!imagePart?.inlineData) {
      console.error('No image in Gemini response:', JSON.stringify(data))
      return res.status(500).json({ error: 'No image returned from Gemini' })
    }

    const b64 = imagePart.inlineData.data
    const contentType = imagePart.inlineData.mimeType || 'image/jpeg'

    return res.status(200).json({ b64, contentType })
  } catch (err) {
    console.error('Gemini fetch error:', err)
    res.status(500).json({ error: err.message })
  }
}