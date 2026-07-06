export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { storyId, scenes, style, characters } = req.body
  if (!storyId || !scenes) return res.status(400).json({ error: 'Missing storyId or scenes' })

  const token = process.env.QSTASH_TOKEN
  const baseUrl = `https://${req.headers.host}`
  const workerUrl = `${baseUrl}/api/worker/generate-image`

  console.log('Token length:', token?.length)
  console.log('Worker URL:', workerUrl)

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

    const response = await fetch(`https://qstash.upstash.io/v2/publish/${workerUrl}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Upstash-Retries': '2',
        'Upstash-Delay': `${i * 3}s`
      },
      body: JSON.stringify(payload)
    })

    const text = await response.text()
    console.log(`Scene ${i} response ${response.status}:`, text.slice(0, 200))

    if (!response.ok) throw new Error(text)
    return JSON.parse(text)
  }))

  const failed = results.filter(r => r.status === 'rejected')
  const succeeded = results.filter(r => r.status === 'fulfilled')

  if (failed.length > 0) {
    console.error('Failed scenes:', failed.map(f => f.reason?.message?.slice(0, 100)))
  }

  return res.status(200).json({ queued: succeeded.length, failed: failed.length })
}
