import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { imagePrompt, style, characterDescriptions } = req.body

  const stylePrefix = {
    'Watercolour': "soft watercolour children's book illustration, painterly, gentle washes of colour,",
    'Pixar-like': 'Pixar 3D animation style, warm cinematic lighting, expressive cute characters, highly detailed,',
    'Storybook': "classic fairy tale storybook illustration, hand-painted, warm golden light,",
    'Comic book': 'bold comic book illustration, clean linework, bright vivid colours, dynamic composition,',
    'Anime': 'Studio Ghibli anime style, detailed painterly backgrounds, soft warm lighting,',
    'Claymation': 'claymation stop-motion style, tactile textures, warm whimsical, colourful,'
  }

  const prefix = stylePrefix[style] || "children's book illustration, warm and magical,"
  const charNote = characterDescriptions ? `Characters: ${characterDescriptions}. ` : ''
  const fullPrompt = `${prefix} ${charNote}${imagePrompt}. No text or words in image. Child-safe, warm, magical, beautiful.`

  try {
    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-west-2',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    })

    const command = new InvokeModelCommand({
      modelId: 'stability.stable-image-core-v1:1',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt: fullPrompt,
        negative_prompt: 'text, words, letters, watermark, ugly, blurry, dark, violent, scary',
        aspect_ratio: '1:1',
        output_format: 'jpeg'
      })
    })

    const response = await client.send(command)
    const responseBody = JSON.parse(new TextDecoder().decode(response.body))

    const b64 = responseBody.images?.[0]
    if (!b64) {
      console.error('No image in response:', JSON.stringify(responseBody).slice(0, 200))
      return res.status(500).json({ error: 'No image returned from Bedrock' })
    }

    res.status(200).json({ b64, contentType: 'image/jpeg' })
  } catch (err) {
    console.error('Bedrock error:', err.message || err)
    res.status(500).json({ error: err.message || 'Image generation failed' })
  }
}
