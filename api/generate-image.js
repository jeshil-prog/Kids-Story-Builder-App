export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { imagePrompt, style } = req.body

  const stylePrefix = {
    'Watercolour': 'soft watercolour painting, gentle washes of colour, children\'s book illustration,',
    'Pixar-like': 'Pixar-style 3D animation, warm cinematic lighting, expressive cute characters,',
    'Storybook': 'classic storybook illustration, detailed, warm, hand-painted,',
    'Comic book': 'bold comic book illustration, clean linework, bright colours,',
    'Anime': 'Studio Ghibli anime style, detailed painterly backgrounds, expressive,',
    'Claymation': 'claymation stop-motion style, tactile textures, warm whimsical,'
  }

  const prefix = stylePrefix[style] || 'children\'s book illustration, warm and magical,'
  const fullPrompt = `${prefix} ${imagePrompt}. No text or words in image. Child-safe, warm, magical, dreamlike.`

  // Try FLUX.1-schnell first (fastest free model), fall back to stable-diffusion-xl
  const models = [
    'black-forest-labs/FLUX.1-schnell',
    'stabilityai/stable-diffusion-xl-base-1.0',
  ]

  let lastError = null

  for (const model of models) {
    try {
      const response = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.HUGGING_FACE_TOKEN}`,
            'Content-Type': 'application/json',
            'x-wait-for-model': 'true'   // wait instead of 503 if model is loading
          },
          body: JSON.stringify({
            inputs: fullPrompt,
            parameters: {
              width: 1024,
              height: 1024,
              num_inference_steps: 4,   // FLUX.1-schnell is optimised for 4 steps
              guidance_scale: 0,        // schnell works best at 0
            }
          })
        }
      )

      if (!response.ok) {
        const errText = await response.text()
        console.error(`HF model ${model} error ${response.status}:`, errText)
        lastError = `${response.status}: ${errText}`
        continue  // try next model
      }

      // HF inference returns raw image bytes
      const arrayBuffer = await response.arrayBuffer()
      const b64 = Buffer.from(arrayBuffer).toString('base64')

      // Detect content type from response header (usually image/jpeg or image/png)
      const contentType = response.headers.get('content-type') || 'image/png'

      return res.status(200).json({ b64, contentType })
    } catch (err) {
      console.error(`HF model ${model} fetch error:`, err)
      lastError = err.message
    }
  }

  res.status(500).json({ error: 'Image generation failed', detail: lastError })
}
