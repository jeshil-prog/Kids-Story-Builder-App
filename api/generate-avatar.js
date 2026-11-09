// Turns a photo of a person into a cartoon (Pixar style) portrait and stores ONLY
// the cartoon. The original photo is used for this one request and is never
// saved by us: not in the database, not in S3.
//
// Two ways to call it (both need a signed in person):
//   1. { photoBase64, mimeType }  a photo picked just now on the Characters page.
//   2. { sourceUrl }              a character that still has an old stored photo.
//      The old photo is replaced by the cartoon and then deleted from S3.

export const config = { maxDuration: 120 }

import OpenAI from 'openai'
import { randomUUID } from 'crypto'
import { getUserId } from './_lib/authUser.js'
import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { redisGet, redisSet } from './_lib/redis.js'
import { uploadToS3, deleteFromS3, keyFromOurUrl } from './_lib/s3.js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// A generous daily cap per person, so the route cannot be used as a free image maker.
const DAILY_LIMIT = 40
const MAX_PHOTO_B64 = 3000000

const PROMPT = `Create a charming Pixar style 3D animated movie character portrait of the person in the reference photo.
- Head and shoulders, centred, facing the viewer with a warm friendly smile.
- Make it clearly a cartoon character, not a photo, but keep what makes this person recognisable: hair colour and style, skin tone, eye colour, face shape, glasses, freckles and similar features.
- Soft, simple pastel gradient background. Warm cinematic lighting.
- No text, no logos, no frames. Child safe.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: 'Not authenticated' })

  const { photoBase64, mimeType, sourceUrl } = req.body || {}

  // Work out where the photo comes from.
  let b64 = null
  let mime = mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
  let oldKey = null

  if (typeof photoBase64 === 'string' && photoBase64.length > 100) {
    if (photoBase64.length > MAX_PHOTO_B64) return res.status(400).json({ error: 'That photo is too large. Try a smaller one.' })
    b64 = photoBase64
  } else if (typeof sourceUrl === 'string') {
    oldKey = keyFromOurUrl(sourceUrl)
    if (!oldKey || !oldKey.startsWith('characters/')) return res.status(400).json({ error: 'That is not a stored character photo.' })
    // It must be the photo of one of this person's own characters.
    const { data: owned } = await supabaseAdmin.from('characters').select('id').eq('owner_id', userId).eq('photo_url', sourceUrl).limit(1)
    if (!owned || owned.length === 0) return res.status(403).json({ error: 'That photo does not belong to you.' })
    const r = await fetch(sourceUrl)
    if (!r.ok) return res.status(502).json({ error: 'Could not read the stored photo.' })
    const buf = Buffer.from(await r.arrayBuffer())
    b64 = buf.toString('base64')
    mime = r.headers.get('content-type')?.includes('png') ? 'image/png' : 'image/jpeg'
  } else {
    return res.status(400).json({ error: 'No photo provided.' })
  }

  // Daily cap.
  const day = new Date().toISOString().slice(0, 10)
  const limitKey = `avatar_count:${userId}:${day}`
  try {
    const used = (await redisGet(limitKey)) || 0
    if (used >= DAILY_LIMIT) return res.status(429).json({ error: 'You have made a lot of portraits today. Please try again tomorrow.' })
    await redisSet(limitKey, used + 1, 86400)
  } catch (err) {
    console.error('Avatar limit check failed:', err.message)
  }

  try {
    const response = await openai.responses.create({
      model: 'gpt-5.5',
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: PROMPT },
          { type: 'input_image', image_url: `data:${mime};base64,${b64}` }
        ]
      }],
      tools: [{ type: 'image_generation', quality: 'medium', size: '1024x1024' }]
    })

    const image = (response.output || []).find((o) => o.type === 'image_generation_call' && o.result)
    if (!image) {
      console.error('Avatar: no image came back', { outputTypes: (response.output || []).map((o) => o.type) })
      return res.status(422).json({ error: 'We could not make a cartoon portrait from that photo. Try a clearer photo, or a different one.' })
    }

    const url = await uploadToS3(image.result, 'image/png', `avatars/${randomUUID()}.png`)

    // An old stored photo is swapped for the cartoon and then removed for good.
    if (oldKey) {
      const { error: updateError } = await supabaseAdmin.from('characters')
        .update({ photo_url: url }).eq('owner_id', userId).eq('photo_url', sourceUrl)
      if (updateError) {
        console.error('Avatar: could not update the character:', updateError)
        return res.status(500).json({ error: 'Could not save the new portrait. Please try again.' })
      }
      try { await deleteFromS3(oldKey) } catch (err) { console.error('Avatar: could not delete the old photo:', err.message) }
    }

    return res.status(200).json({ url })
  } catch (err) {
    console.error('Avatar generation error:', err)
    const refused = err?.code === 'moderation_blocked' || /safety|moderation/i.test(err?.message || '')
    return res.status(refused ? 422 : 500).json({
      error: refused
        ? 'We could not make a cartoon portrait from that photo. Try a different one.'
        : 'Something went wrong making the portrait. Please try again.'
    })
  }
}
