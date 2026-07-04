export const config = { maxDuration: 30 }

// Map our sfx cue names to natural language descriptions for ElevenLabs
const SFX_DESCRIPTIONS = {
  birds: 'birds chirping and singing in trees, gentle morning birdsong',
  wind: 'gentle wind blowing, soft breeze rustling through leaves',
  rain: 'soft rain falling, gentle rainfall on leaves and ground',
  thunder: 'dramatic thunder rumbling, storm thunderclap',
  fire: 'crackling fire, warm campfire burning and popping',
  magic: 'magical sparkle sound, fairy dust twinkling, enchanted chime',
  ocean: 'ocean waves gently lapping on shore, peaceful sea sounds',
  jungle: 'jungle ambience, tropical forest sounds, exotic birds and insects',
  footsteps: 'footsteps walking on ground, soft footsteps approaching',
  gasp: 'surprised gasp, sharp intake of breath in wonder',
  laugh: 'joyful children laughing, happy giggling',
  whoosh: 'whoosh sound effect, fast swooping air movement',
  sparkle: 'sparkling twinkling sound, magical glittering chimes',
  fanfare: 'triumphant fanfare, celebratory trumpet flourish',
  splash: 'water splash sound, splashing into water',
  rustle: 'rustling leaves, soft rustling in bushes',
  knock: 'knocking on a wooden door, gentle rapping',
  creaking: 'creaking wooden door opening slowly',
  growl: 'gentle animal growl, friendly creature rumble',
  chime: 'soft bell chime, gentle melodic bell tone'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { sound } = req.body
  if (!sound) return res.status(400).json({ error: 'sound is required' })

  const description = SFX_DESCRIPTIONS[sound] || sound

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: description,
        duration_seconds: 3,
        prompt_influence: 0.3
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('ElevenLabs sfx error:', err)
      return res.status(500).json({ error: 'SFX generation failed', detail: err })
    }

    // ElevenLabs returns raw audio bytes (mp3)
    const arrayBuffer = await response.arrayBuffer()
    const b64 = Buffer.from(arrayBuffer).toString('base64')

    return res.status(200).json({ b64, contentType: 'audio/mpeg' })

  } catch (err) {
    console.error('generate-sfx error:', err)
    return res.status(500).json({ error: err.message })
  }
}
