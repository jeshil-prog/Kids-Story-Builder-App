export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { storyId, scenes, style, characters } = req.body
  if (!storyId || !scenes) return res.status(400).json({ error: 'Missing storyId or scenes' })

  const { Client } = await import('@upstash/qstash')
  const client = new Client({ token: process.env.QSTASH_TOKEN })

  const baseUrl = `https://${req.headers.host}`
  const workerUrl = `${baseUrl}/api/worker/generate-image`

  const results = await Promise.allSettled(scenes.map(async (scene, i) => {
    return client.publishJSON({
      url: workerUrl,
      body: {
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
      },
      retries: 2,
      delay: `${i * 2}s`
    })
  }))

  const failed = results.filter(r => r.status === 'rejected')
  if (failed.length > 0) {
    console.error('Some scenes failed to queue:', failed.map(f => f.reason?.message || f.reason))
  }

  return res.status(200).json({ queued: scenes.length - failed.length, failed: failed.length })
}
