export const config = { maxDuration: 10 }

import { redisGet } from './_lib/redis.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { storyId, sceneCount } = req.query
  if (!storyId || !sceneCount) return res.status(400).json({ error: 'Missing storyId or sceneCount' })

  const count = parseInt(sceneCount)
  const results = []

  for (let i = 0; i < count; i++) {
    const [imageStatus, audioStatus] = await Promise.all([
      redisGet(`story:${storyId}:scene:${i}`).catch(() => null),
      redisGet(`story:${storyId}:scene:${i}:audio`).catch(() => null)
    ])
    results.push({
      ...(imageStatus || {}),
      narrationStatus: audioStatus?.status || null,
      narrationUrl: audioStatus?.narrationUrl || null,
      narrationWordTimes: audioStatus?.wordTimes || null
    })
  }

  return res.status(200).json({ scenes: results })
}
