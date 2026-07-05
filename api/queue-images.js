export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { storyId, scenes, style, characters } = req.body
  if (!storyId || !scenes) return res.status(400).json({ error: 'Missing storyId or scenes' })

  const baseUrl = `https://${req.headers.host}`
  const token = process.env.QSTASH_TOKEN
  console.log('QSTASH_TOKEN present:', !!token, 'length:', token?.length, 'starts:', token?.slice(0, 10))

  // Queue one job per scene via QStash
  const results = await Promise.allSettled(scenes.map(async (scene, i) => {
    const payload = {
      storyId,
      sceneIndex: i,
      imagePrompt: scene.imagePrompt,
      style,
      characters: characters.map(c => ({
        name: c.name,
        photoBase64: c.photoBase64 || null,
        photoMime: c.photoMime || 'image/jpeg',
        description: c.description || null
      }))
    }

    const qstashUrl = (process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/+$/, '')
    const response = await fetch(`${qstashUrl}/v2/publish/${encodeURIComponent(`${baseUrl}/api/worker/generate-image`)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.QSTASH_TOKEN}`,
        'Content-Type': 'application/json',
        'Upstash-Retries': '2',
        'Upstash-Delay': `${i * 2}s` // stagger by 2s each to avoid rate limits
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`QStash error for scene ${i}: ${err}`)
    }

    return response.json()
  }))

  const failed = results.filter(r => r.status === 'rejected')
  if (failed.length > 0) {
    console.error('Some scenes failed to queue:', failed.map(f => f.reason))
  }

  return res.status(200).json({ queued: scenes.length - failed.length, failed: failed.length })
}
