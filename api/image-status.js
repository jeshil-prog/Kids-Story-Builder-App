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
      const res2 = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
      })
      const data = await res2.json()
      const value = data.result ? JSON.parse(decodeURIComponent(data.result)) : null
      results.push(value)
    } catch {
      results.push(null)
    }
  }

  return res.status(200).json({ scenes: results })
}
