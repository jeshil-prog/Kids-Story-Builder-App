export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { storyId, scenes, style, characters } = req.body
  if (!storyId || !scenes) return res.status(400).json({ error: 'Missing storyId or scenes' })

  const baseUrl = `https://${req.headers.host}`
  const workerUrl = `${baseUrl}/api/worker/generate-image`

  // Fire off all scene generation requests without waiting for them
  // Each runs independently in its own Vercel function invocation
  scenes.forEach((scene, i) => {
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

    // Use waitUntil pattern - fire and forget
    fetch(workerUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET || 'storydream-internal'
      },
      body: JSON.stringify(payload)
    }).catch(err => console.error(`Scene ${i} queue error:`, err.message))
  })

  return res.status(200).json({ queued: scenes.length })
}
