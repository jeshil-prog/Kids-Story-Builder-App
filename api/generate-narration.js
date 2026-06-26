export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { text } = req.body
  if (!text) return res.status(400).json({ error: 'No text provided' })

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: 'nova',      // warm, gentle female voice — great for bedtime stories
        speed: 0.9          // slightly slower for bedtime reading
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('OpenAI TTS error:', response.status, err)
      return res.status(500).json({ error: `TTS failed: ${response.status}` })
    }

    // Stream the audio back as mp3
    const audioBuffer = await response.arrayBuffer()
    const b64 = Buffer.from(audioBuffer).toString('base64')
    res.status(200).json({ b64, contentType: 'audio/mpeg' })
  } catch (err) {
    console.error('TTS fetch error:', err)
    res.status(500).json({ error: err.message })
  }
}
