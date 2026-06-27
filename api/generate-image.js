export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { imagePrompt, style, characterDescriptions } = req.body

  const stylePrefix = {
    'Watercolour': 'soft watercolour children\'s book illustration, painterly, gentle washes of colour,',
    'Pixar-like': 'Pixar 3D animation style, warm cinematic lighting, expressive cute characters, highly detailed,',
    'Storybook': 'classic fairy tale storybook illustration, hand-painted, warm golden light,',
    'Comic book': 'bold comic book illustration, clean linework, bright vivid colours, dynamic composition,',
    'Anime': 'Studio Ghibli anime style, detailed painterly backgrounds, soft warm lighting,',
    'Claymation': 'claymation stop-motion style, tactile textures, warm whimsical, colourful,'
  }

  const prefix = stylePrefix[style] || "children's book illustration, warm and magical,"
  const charNote = characterDescriptions ? `Characters: ${characterDescriptions}. ` : ''
  const fullPrompt = `${prefix} ${charNote}${imagePrompt}. No text or words in image. Child-safe, warm, magical, beautiful, dreamlike.`
  const negativePrompt = 'text, words, letters, watermark, ugly, blurry, dark, violent, scary, adult content, realistic photo'

  try {
    // Sign the AWS request manually (no SDK available in Vercel edge)
    const region = process.env.AWS_REGION || 'us-east-1'
    const accessKey = process.env.AWS_ACCESS_KEY_ID
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY
    const modelId = 'stability.stable-image-core-v1:0'
    const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/invoke`

    const body = JSON.stringify({
      prompt: fullPrompt,
      negative_prompt: negativePrompt,
      aspect_ratio: '1:1',
      output_format: 'jpeg'
    })

    // AWS Signature Version 4
    const now = new Date()
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
    const dateStamp = amzDate.slice(0, 8)
    const service = 'bedrock'
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`

    // Canonical request
    const bodyHash = await sha256Hex(body)
    const canonicalHeaders = `content-type:application/json\nhost:bedrock-runtime.${region}.amazonaws.com\nx-amz-date:${amzDate}\n`
    const signedHeaders = 'content-type;host;x-amz-date'
    const canonicalRequest = [
      'POST',
      `/model/${modelId}/invoke`,
      '',
      canonicalHeaders,
      signedHeaders,
      bodyHash
    ].join('\n')

    // String to sign
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      await sha256Hex(canonicalRequest)
    ].join('\n')

    // Signing key
    const signingKey = await getSigningKey(secretKey, dateStamp, region, service)
    const signature = await hmacHex(signingKey, stringToSign)

    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Amz-Date': amzDate,
        'Authorization': authHeader
      },
      body
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Bedrock error:', response.status, errText)
      return res.status(500).json({ error: `Image generation failed: ${response.status}`, detail: errText })
    }

    const data = await response.json()

    // Stable Image Core returns base64 directly
    const b64 = data.images?.[0] || data.image
    if (!b64) {
      console.error('No image in response:', JSON.stringify(data).slice(0, 300))
      return res.status(500).json({ error: 'No image returned from Bedrock' })
    }

    res.status(200).json({ b64, contentType: 'image/jpeg' })
  } catch (err) {
    console.error('Bedrock image error:', err)
    res.status(500).json({ error: err.message })
  }
}

// AWS Signature helpers using Web Crypto API
async function sha256Hex(message) {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(key, message) {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw', typeof key === 'string' ? encoder.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
  return new Uint8Array(sig)
}

async function hmacHex(key, message) {
  const sig = await hmac(key, message)
  return Array.from(sig).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function getSigningKey(secret, date, region, service) {
  const kDate = await hmac('AWS4' + secret, date)
  const kRegion = await hmac(kDate, region)
  const kService = await hmac(kRegion, service)
  return await hmac(kService, 'aws4_request')
}
