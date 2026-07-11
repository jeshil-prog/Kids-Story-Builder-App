// Uploads a character reference photo to S3 and returns a durable public URL.
// Character photos were previously kept only in-memory (Zustand state) and
// deliberately stripped before writing to localStorage (to avoid quota
// errors) — meaning they never actually persisted across a page reload on
// ANY platform. This was easy to miss on desktop, where a tab often stays
// open for the whole session, but iOS Safari evicts backgrounded tab memory
// far more aggressively, which is why this showed up as "characters don't
// save on mobile" even though the underlying gap existed everywhere.
export const config = { maxDuration: 30 }

import { uploadToS3 } from './_lib/s3.js'
import { randomUUID } from 'crypto'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { base64, mimeType } = req.body
  if (!base64) return res.status(400).json({ error: 'No photo provided' })

  try {
    const ext = mimeType?.includes('png') ? 'png' : 'jpg'
    const key = `characters/${randomUUID()}.${ext}`
    const url = await uploadToS3(base64, mimeType || 'image/jpeg', key)
    res.status(200).json({ url })
  } catch (err) {
    console.error('Photo upload error:', err)
    res.status(500).json({ error: err.message })
  }
}
