export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { sound } = req.body
  if (!sound) return res.status(400).json({ error: 'sound is required' })

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: sound,
        duration_seconds: 3,
        prompt_influence: 0.4
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('ElevenLabs sfx error:', err)
      return res.status(500).json({ error: 'SFX generation failed', detail: err })
    }

    const arrayBuffer = await response.arrayBuffer()
    const b64 = Buffer.from(arrayBuffer).toString('base64')

    return res.status(200).json({ b64, contentType: 'audio/mpeg' })

  } catch (err) {
    console.error('generate-sfx error:', err)
    return res.status(500).json({ error: err.message })
  }
}
