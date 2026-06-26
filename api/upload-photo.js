// Upload a character photo to fal.ai storage and return a public URL
export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { base64, mimeType } = req.body
  if (!base64) return res.status(400).json({ error: 'No photo provided' })

  try {
    // Convert base64 to binary
    const binary = Buffer.from(base64, 'base64')
    const ext = mimeType?.includes('png') ? 'png' : 'jpg'

    // Upload to fal.ai storage
    const uploadRes = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${process.env.FAL_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content_type: mimeType || 'image/jpeg',
        file_name: `character.${ext}`
      })
    })

    if (!uploadRes.ok) {
      // Try direct upload approach
      const formData = new FormData()
      const blob = new Blob([binary], { type: mimeType || 'image/jpeg' })
      formData.append('file', blob, `character.${ext}`)

      const directRes = await fetch('https://rest.alpha.fal.ai/storage/upload', {
        method: 'POST',
        headers: { 'Authorization': `Key ${process.env.FAL_KEY}` },
        body: formData
      })

      if (!directRes.ok) {
        const err = await directRes.text()
        console.error('fal upload error:', err)
        return res.status(500).json({ error: 'Photo upload failed' })
      }

      const data = await directRes.json()
      return res.status(200).json({ url: data.url || data.access_url })
    }

    const { upload_url, file_url } = await uploadRes.json()

    // Upload the actual file
    await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType || 'image/jpeg' },
      body: binary
    })

    res.status(200).json({ url: file_url })
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ error: err.message })
  }
}
