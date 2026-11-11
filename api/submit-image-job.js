// Submits an image generation job via OpenAI's Responses API with
// background: true. This call returns in a second or two — it does NOT wait
// for the image. The actual result shows up later as a webhook call to
// /api/webhook-openai-image, which is what writes the final imageUrl to Redis.
//
// This ALSO now generates the scene's narration audio, synchronously within
// this same request, running concurrently with (not blocking) the image job
// submission — see _lib/narrationJob.js for why narration can't use the same
// background/webhook pattern images do. This replaces narration that used to
// be generated live, per-play, from the browser — which was exposing an API
// key client-side and silently falling back to a worse browser voice under
// OpenAI rate limits. Generating it once here, like images already work,
// means playback is just a stored file with nothing left to rate-limit.

// A photo page is edited start to finish inside this request, which can take a minute or two.
export const config = { maxDuration: 300 }

import { redisSet, redisGet } from './_lib/redis.js'
import { submitImageJob, editPhotoScene } from './_lib/imageJob.js'
import { generateNarrationAudio } from './_lib/narrationJob.js'
import { getUserId } from './_lib/authUser.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Only signed in people can start (paid for) image and voice jobs.
  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: 'Not authenticated' })

  const { imagePrompt, style, characters, storyId, sceneIndex, narrationText, language, sceneImage } = req.body

  if (!storyId || sceneIndex === undefined) {
    return res.status(400).json({ error: 'Missing storyId or sceneIndex' })
  }
  // A picture the person supplied for this page (Tier 2). Kept small on purpose.
  const cleanSceneImage = sceneImage && typeof sceneImage.base64 === 'string' && sceneImage.base64.length <= 450000
    ? { base64: sceneImage.base64, mime: sceneImage.mime === 'image/png' ? 'image/png' : 'image/jpeg' }
    : null

  const imageKey = `story:${storyId}:scene:${sceneIndex}`
  const audioKey = `story:${storyId}:scene:${sceneIndex}:audio`
  let imageAlreadyDone = false

  try {
    const existingImage = await redisGet(imageKey).catch(() => null)
    imageAlreadyDone = existingImage?.status === 'done'
    if (!imageAlreadyDone) await redisSet(imageKey, { status: 'processing' }, 3600)

    const imageJobPromise = imageAlreadyDone
      ? Promise.resolve({ id: null, status: 'already_done' })
      : cleanSceneImage
        ? editPhotoScene({ style, storyId, sceneIndex, sceneImage: cleanSceneImage })
        : submitImageJob({ imagePrompt, style, characters, storyId, sceneIndex })

    // Only (re)generate narration if it doesn't already exist — this matters
    // for the backfill poller's retry path, which resubmits this whole
    // endpoint when a scene's IMAGE was rate-limited. Without this check,
    // that retry would wastefully (and needlessly) regenerate audio that
    // already succeeded the first time.
    let narrationPromise = Promise.resolve(null)
    if (narrationText) {
      const existingAudio = await redisGet(audioKey).catch(() => null)
      if (existingAudio?.status !== 'done') {
        await redisSet(audioKey, { status: 'processing' }, 3600)
        narrationPromise = generateNarrationAudio({ narrationText, storyId, sceneIndex, language: language || 'en' })
          .then(async ({ narrationUrl, wordTimes }) => {
            await redisSet(audioKey, { status: 'done', narrationUrl, wordTimes }, 3600)
            return narrationUrl
          })
          .catch(async (err) => {
            console.error(`Narration generation failed for scene ${sceneIndex}:`, err)
            await redisSet(audioKey, { status: 'error', error: err.message }, 3600)
            return null
          })
      }
    }

    const [imageResponse] = await Promise.all([imageJobPromise, narrationPromise])

    return res.status(200).json({ jobId: imageResponse.id, status: imageResponse.status })
  } catch (err) {
    console.error('submit-image-job error:', err)
    if (!imageAlreadyDone) await redisSet(imageKey, { status: 'error', error: err.message }, 3600)
    return res.status(500).json({ error: err.message || 'Failed to submit image job' })
  }
}
