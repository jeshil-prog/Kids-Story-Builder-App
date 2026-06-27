import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { imagePrompt, style, characterDescriptions, characterPhotoBase64 } = req.body

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
  const negativePrompt = 'text, words, letters, watermark, ugly, blurry, dark, violent, scary, adult content'

  try {
    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-west-2',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    })

    // Use image-to-image if we have a character photo reference
    const requestBody = characterPhotoBase64
      ? {
          prompt: fullPrompt,
          negative_prompt: negativePrompt,
          image: characterPhotoBase64,
          strength: 0.65, // 0=identical to photo, 1=ignore photo. 0.65 = keep likeness, allow scene freedom
          mode: 'image-to-image',
          output_format: 'jpeg'
        }
      : {
          prompt: fullPrompt,
          negative_prompt: negativePrompt,
          aspect_ratio: '1:1',
          mode: 'text-to-image',
          output_format: 'jpeg'
        }

    const command = new InvokeModelCommand({
      modelId: 'stability.sd3-5-large-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody)
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
