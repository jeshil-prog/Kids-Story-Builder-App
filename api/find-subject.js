// Finds the one person a cartoon portrait should be made of, when a photo has
// more than one person in it (a baby on a parent's lap, a family photo).
// Returns a box around that person's head and shoulders, as fractions of the
// photo's width and height, or null when the photo only has one person. Used
// by the Characters page to crop the photo before it is turned into a portrait.
// Needs a signed in person, because each call costs money.

export const config = { maxDuration: 30 }

import { getUserId } from './_lib/authUser.js'

const MAX_PHOTO_B64 = 3000000

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: 'Not authenticated' })

  const { photoBase64, name, age, role } = req.body || {}
  if (typeof photoBase64 !== 'string' || photoBase64.length < 100) return res.status(400).json({ error: 'No photo provided' })
  if (photoBase64.length > MAX_PHOTO_B64) return res.status(400).json({ error: 'That photo is too large.' })

  const who = [
    name ? `named ${String(name).slice(0, 60)}` : null,
    age !== undefined && age !== '' && age !== null ? `aged ${String(age).slice(0, 10)}` : null,
    role ? `described as: ${String(role).slice(0, 60)}` : null
  ].filter(Boolean).join(', ')

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photoBase64 } },
            {
              type: 'text',
              text: `A cartoon portrait is going to be made of one person in this photo${who ? `, a person ${who}` : ''}. The photo may show other people too, for example a baby sitting on an adult's lap, or part of an adult at the edge of the picture.

Decide which ONE person the portrait is of. Use the age and description if they were given (a baby means the baby, not the adults). If nothing was given, choose the main subject: the person who is most central and most clearly the focus of the photo.

Answer with JSON only, nothing else, in this exact shape:
{"people": <how many people are visible, counting partly visible ones>, "x": <left edge>, "y": <top edge>, "w": <width>, "h": <height>}
The box x, y, w, h goes around that one person's head and shoulders. All four numbers are fractions of the whole photo from 0 to 1, measured from the top left corner.`
            }
          ]
        }]
      })
    })

    if (!response.ok) {
      console.error('find-subject Claude error:', response.status, await response.text().catch(() => ''))
      return res.status(200).json({ box: null })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return res.status(200).json({ box: null })
    const out = JSON.parse(match[0])
    console.log('find-subject:', JSON.stringify(out))

    const n = (v) => (typeof v === 'number' && isFinite(v) ? v : null)
    const people = n(out.people)
    const x = n(out.x), y = n(out.y), w = n(out.w), h = n(out.h)
    // One person in the photo: nothing to crop.
    if (people !== null && people <= 1) return res.status(200).json({ box: null })
    if (x === null || y === null || w === null || h === null) return res.status(200).json({ box: null })
    if (w < 0.05 || h < 0.05 || x < 0 || y < 0 || x + w > 1.02 || y + h > 1.02) return res.status(200).json({ box: null })

    return res.status(200).json({ box: { x, y, w, h } })
  } catch (err) {
    console.error('find-subject error:', err)
    // Never block making a portrait because this step failed.
    return res.status(200).json({ box: null })
  }
}
