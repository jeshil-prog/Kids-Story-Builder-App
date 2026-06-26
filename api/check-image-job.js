// Poll fal.ai queue for a completed image job
export const config = { maxDuration: 15 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { request_id } = req.body
  if (!request_id) return res.status(400).json({ error: 'No request_id' })

  try {
    // Check status
    const statusRes = await fetch(
      `https://queue.fal.run/fal-ai/flux-pro/kontext/requests/${request_id}/status`,
      { headers: { 'Authorization': `Key ${process.env.FAL_KEY}` } }
    )

    if (!statusRes.ok) return res.status(500).json({ error: 'Status check failed' })
    const status = await statusRes.json()

    if (status.status === 'COMPLETED') {
      // Fetch the result
      const resultRes = await fetch(
        `https://queue.fal.run/fal-ai/flux-pro/kontext/requests/${request_id}`,
        { headers: { 'Authorization': `Key ${process.env.FAL_KEY}` } }
      )
      if (!resultRes.ok) return res.status(500).json({ error: 'Result fetch failed' })
      const result = await resultRes.json()
      const imageUrl = result.images?.[0]?.url
      if (!imageUrl) return res.status(500).json({ error: 'No image in result' })

      // Fetch the image and return as base64
      const imgRes = await fetch(imageUrl)
      const arrayBuffer = await imgRes.arrayBuffer()
      const b64 = Buffer.from(arrayBuffer).toString('base64')
      return res.status(200).json({ status: 'COMPLETED', b64, contentType: 'image/jpeg' })
    }

    if (status.status === 'FAILED') {
      return res.status(500).json({ error: 'Image generation failed', status: 'FAILED' })
    }

    // Still in queue
    return res.status(200).json({ status: status.status || 'IN_QUEUE' })
  } catch (err) {
    console.error('Check job error:', err)
    res.status(500).json({ error: err.message })
  }
}
