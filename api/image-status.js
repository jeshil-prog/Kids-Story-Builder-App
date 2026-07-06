export const config = { maxDuration: 10 }

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { storyId, sceneCount } = req.query
  if (!storyId || !sceneCount) return res.status(400).json({ error: 'Missing storyId or sceneCount' })

  const count = parseInt(sceneCount)
  const results = []

  for (let i = 0; i < count; i++) {
    const key = `story:${storyId}:scene:${i}`
    try {
      const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['GET', key])
      })
      const data = await r.json()
      const value = data.result ? JSON.parse(data.result) : null
      results.push(value)
    } catch {
      results.push(null)
    }
  }

  return res.status(200).json({ scenes: results })
}
