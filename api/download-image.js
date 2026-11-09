// Hands one of our own stored pictures back through our own address, so the app
// can read the picture's bytes (to build pages for "Save to Photos"). The
// browser would otherwise refuse to read an image from another web address.
// Only files in our own bucket, under scenes/ or avatars/, can be fetched.

export const config = { maxDuration: 15 }

import { getUserId } from './_lib/authUser.js'
import { keyFromOurUrl } from './_lib/s3.js'

const MAX_BYTES = 4400000 // Vercel's response size limit is about 4.5 MB

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: 'Not authenticated' })

  const url = typeof req.query.url === 'string' ? req.query.url : ''
  const key = keyFromOurUrl(url)
  if (!key || !(key.startsWith('scenes/') || key.startsWith('avatars/'))) {
    return res.status(400).json({ error: 'Not a picture we can fetch.' })
  }

  try {
    const r = await fetch(url)
    if (!r.ok) return res.status(502).json({ error: 'Could not read the picture.' })
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'That picture is too large.' })
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/png')
    res.setHeader('Cache-Control', 'private, max-age=3600')
    return res.status(200).send(buf)
  } catch (err) {
    console.error('download-image error:', err)
    return res.status(500).json({ error: 'Could not read the picture.' })
  }
}
