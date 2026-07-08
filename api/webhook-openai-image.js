// OpenAI POSTs here when a background response completes (or fails). The
// webhook body only contains a response id — the actual image has to be
// fetched separately via responses.retrieve(). Must respond quickly (OpenAI
// retries if we don't 2xx within a few seconds), and must verify the
// signature since this endpoint is public and reachable by anyone.
//
// Setup required (one-time, in the OpenAI dashboard):
//   1. platform.openai.com -> Settings -> Webhooks -> Add endpoint
//   2. URL: https://<your-domain>/api/webhook-openai-image
//   3. Subscribe to: response.completed, response.failed, response.incomplete
//   4. Copy the signing secret into the OPENAI_WEBHOOK_SECRET env var in Vercel

export const config = { api: { bodyParser: false }, maxDuration: 30 }

import OpenAI from 'openai'
import { redisGet, redisSet } from './_lib/redis.js'
import { uploadToS3 } from './_lib/s3.js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  webhookSecret: process.env.OPENAI_WEBHOOK_SECRET
})

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!process.env.OPENAI_WEBHOOK_SECRET) {
    console.error('OPENAI_WEBHOOK_SECRET is not set in this deployment\'s environment — check Vercel Settings > Environment Variables, confirm it is scoped to Production, and redeploy.')
    return res.status(500).json({ error: 'Webhook secret not configured on server' })
  }

  const rawBody = await readRawBody(req)

  let event
  try {
    event = await openai.webhooks.unwrap(rawBody.toString('utf8'), req.headers)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return res.status(400).json({ error: 'Invalid signature' })
  }

  // Always ack quickly so OpenAI doesn't retry unnecessarily — even for
  // event types we don't act on.
  if (!['response.completed', 'response.failed', 'response.incomplete'].includes(event.type)) {
    return res.status(200).json({ ok: true, ignored: event.type })
  }

  const responseId = event.data?.id
  if (!responseId) return res.status(200).json({ ok: true, ignored: 'no response id' })

  let jobMeta
  try {
    jobMeta = await redisGet(`openai_job:${responseId}`)
  } catch (err) {
    console.error('Failed to look up job mapping in Redis:', err.message)
    return res.status(200).json({ ok: true, error: 'redis lookup failed' })
  }
  if (!jobMeta) {
    // Either an unrelated response, or the mapping expired. Nothing to do.
    return res.status(200).json({ ok: true, ignored: 'unknown job' })
  }

  const { storyId, sceneIndex } = jobMeta
  const sceneKey = `story:${storyId}:scene:${sceneIndex}`

  try {
    // Idempotency guard: if a retried webhook delivery arrives after we've
    // already completed this scene, don't regenerate/re-upload/re-bill.
    const existing = await redisGet(sceneKey)
    if (existing?.status === 'done') {
      return res.status(200).json({ ok: true, alreadyDone: true })
    }
  } catch (err) {
    console.error('Failed to check existing scene status in Redis:', err.message)
    // Not fatal — worst case we redo the write below, which is safe.
  }

  if (event.type === 'response.failed' || event.type === 'response.incomplete') {
    let detail = event.type
    try {
      // The webhook event itself has no explanation — retrieve the actual
      // response to get the real reason (moderation block, content filter,
      // token limit, etc.), and log it loudly. Previously this branch logged
      // nothing at all, so a failed/incomplete job looked identical to a
      // success in the access logs (both just "200 POST") — this is why
      // repeated log checks kept turning up clean.
      const failedResponse = await openai.responses.retrieve(responseId)
      detail = failedResponse.error?.message
        || failedResponse.incomplete_details?.reason
        || event.type
      console.error('Image job failed/incomplete:', {
        responseId,
        eventType: event.type,
        status: failedResponse.status,
        error: failedResponse.error,
        incompleteDetails: failedResponse.incomplete_details
      })
    } catch (err) {
      console.error('Image job failed/incomplete (could not retrieve details):', event.type, err.message)
    }
    try {
      await redisSet(sceneKey, { status: 'error', error: detail }, 3600)
    } catch (err) {
      console.error('Failed to write error status to Redis:', err.message)
    }
    return res.status(200).json({ ok: true })
  }

  try {
    const response = await openai.responses.retrieve(responseId)
    const imageBlocks = (response.output || []).filter((o) => o.type === 'image_generation_call')
    const imageData = imageBlocks.filter((o) => o.result).map((o) => o.result)

    if (!imageData.length) {
      // We got a completed response, but no usable image came back — log
      // enough of the output shape to tell us why (moderation block,
      // partial/incomplete generation, unexpected field name, etc.) without
      // needing another round of back-and-forth to diagnose it.
      console.error('Completed response had no usable image result:', {
        responseId,
        outputTypes: (response.output || []).map((o) => o.type),
        imageBlockCount: imageBlocks.length,
        imageBlockStatuses: imageBlocks.map((o) => ({ status: o.status, revisedPrompt: o.revised_prompt, hasResult: !!o.result }))
      })
      await redisSet(sceneKey, { status: 'error', error: 'No image in completed response' }, 3600)
      return res.status(200).json({ ok: true })
    }

    const key = `scenes/${storyId}/${sceneIndex}.png`
    const imageUrl = await uploadToS3(imageData[0], 'image/png', key)

    await redisSet(sceneKey, { status: 'done', imageUrl }, 3600)
    return res.status(200).json({ ok: true, imageUrl })
  } catch (err) {
    console.error('Webhook processing error:', err)
    await redisSet(sceneKey, { status: 'error', error: err.message }, 3600)
    return res.status(200).json({ ok: true }) // still 200 — don't want OpenAI hammering retries on our bug
  }
}
