// Submit an image generation job to fal.ai queue — returns immediately with a request_id
export const config = { maxDuration: 15 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { imagePrompt, style, characterPhotoUrl } = req.body

  const stylePrefix = {
    'Watercolour': 'soft watercolour children\'s book illustration style,',
    'Pixar-like': 'Pixar 3D animation style, warm cinematic lighting,',
    'Storybook': 'classic fairy tale storybook illustration, hand-painted,',
    'Comic book': 'bold comic book illustration, clean linework,',
    'Anime': 'Studio Ghibli anime style, detailed painterly,',
    'Claymation': 'claymation stop-motion style, tactile textures,'
  }
  const styleP = stylePrefix[style] || 'children\'s book illustration,'

  let prompt
  if (characterPhotoUrl) {
    prompt = `${styleP} Transform the child in this reference photo into an illustrated storybook character maintaining their exact facial features, hair colour, eye colour and age. Place them in this scene: ${imagePrompt}. Keep the character consistent with the reference photo. No text in image. Child-safe, warm, magical, beautiful.`
  } else {
    prompt = `${styleP} ${imagePrompt}. No text in image. Child-safe, warm, magical, beautiful.`
  }

  try {
    // Submit to fal.ai queue — returns instantly with request_id
    const submitRes = await fetch('https://queue.fal.run/fal-ai/flux-pro/kontext', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${process.env.FAL_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        image_url: characterPhotoUrl || undefined,
        aspect_ratio: '1:1',
        output_format: 'jpeg',
        safety_tolerance: '3'
      })
    })

    if (!submitRes.ok) {
      const err = await submitRes.text()
      console.error('fal submit error:', submitRes.status, err)
      return res.status(500).json({ error: `Image job submission failed: ${submitRes.status}` })
    }

    const { request_id } = await submitRes.json()
    res.status(200).json({ request_id })
  } catch (err) {
    console.error('Submit error:', err)
    res.status(500).json({ error: err.message })
  }
}
