// Picks the image model used to EDIT a photo. OpenAI retires and renames image
// models, and naming one that is not available to this account fails every time
// ("The model ... does not exist"). So the model is chosen from the list this
// account can actually use, and remembered for the life of the server.
//
// To force a particular model, set OPENAI_IMAGE_EDIT_MODEL in Vercel.

const PREFERRED = ['gpt-image-1.5', 'gpt-image-2', 'gpt-image-2-2026-04-21', 'gpt-image-1']
let cached = null

export async function getImageEditModel(openai) {
  if (process.env.OPENAI_IMAGE_EDIT_MODEL) return process.env.OPENAI_IMAGE_EDIT_MODEL
  if (cached) return cached

  const ids = []
  for await (const m of openai.models.list()) ids.push(m.id)

  // The "mini" model cannot hold on to the details of a supplied photo, so it is never used.
  const usable = ids.filter((id) => /^gpt-image/.test(id) && !/mini/.test(id))
  const pick = PREFERRED.find((id) => usable.includes(id)) || usable.sort().pop()
  if (!pick) {
    const seen = ids.filter((id) => /image/.test(id)).join(', ') || 'none'
    throw new Error(`No GPT image model is available to this OpenAI key. Image models seen: ${seen}`)
  }
  console.log('Photo edit model chosen:', pick, '| image models on this account:', ids.filter((id) => /image/.test(id)).join(', '))
  cached = pick
  return pick
}
