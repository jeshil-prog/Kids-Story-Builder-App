export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { photoBase64, mimeType, name, age } = req.body
  if (!photoBase64) return res.status(400).json({ error: 'No photo provided' })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType || 'image/jpeg',
                data: photoBase64
              }
            },
            {
              type: 'text',
              text: `Describe the physical appearance of ${name || 'this child'}${age ? ` (age ${age})` : ''} in this photo in detail. Focus on: hair colour and style, eye colour, skin tone, face shape, any distinguishing features. Write it as a concise character description for an illustrator to recreate this person consistently across multiple illustrations. Be specific and detailed. Example format: "A boy with short spiky light brown hair, bright blue eyes, fair skin with rosy cheeks, a wide smile with a gap in his front teeth, and a sturdy build." Only describe physical appearance, nothing else.`
            }
          ]
        }]
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Claude vision error:', err)
      return res.status(500).json({ error: 'Could not analyse photo' })
    }

    const data = await response.json()
    const description = data.content[0].text.trim()
    res.status(200).json({ description })
  } catch (err) {
    console.error('Describe character error:', err)
    res.status(500).json({ error: err.message })
  }
}
