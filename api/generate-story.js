export const config = { maxDuration: 300 }

import { supabaseAdmin } from './_lib/supabaseAdmin.js'

const TIER_LIMITS = { free: 3, tier1: 25, tier2: 200 }
// How many one page previews a person can make in a month after reaching their limit.
const PREVIEW_LIMIT = 10
// Pictures per story (Tier 2) and the largest picture accepted, as base64 text.
const MAX_IMAGES = 10
const MAX_IMAGE_B64 = 450000

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Enforced here, not just hidden in the UI, this is the actual
  // cost-incurring step, so a direct API call needs to be blocked too, not
  // just the "Create" button in the app.
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !userData?.user) return res.status(401).json({ error: 'Invalid session' })
  const userId = userData.user.id

  const { data: sub } = await supabaseAdmin.from('subscriptions').select('tier, status').eq('user_id', userId).single()
  const tier = (sub?.status === 'active' && sub?.tier) ? sub.tier : 'free'
  const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.free

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  // Stories count toward the monthly limit even if they are later deleted or
  // never saved, so deleting cannot be used to get more. One page previews made
  // after the limit was reached (paywalled) are counted separately.
  const countStories = async (paywalled) => {
    const { count, error } = await supabaseAdmin
      .from('stories')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId)
      .eq('paywalled', paywalled)
      .gte('created_at', startOfMonth.toISOString())
    if (error) throw error
    return count || 0
  }

  let used, previewsUsed = 0
  try {
    used = await countStories(false)
    if (used >= limit) previewsUsed = await countStories(true)
  } catch (countError) {
    console.error('Failed to check story count:', countError)
    return res.status(500).json({ error: 'Could not verify your usage. Try again in a moment.' })
  }

  // At the limit, a person still gets the first page of a new story (and then
  // meets the paywall in the reader). That is capped, so previews cannot be
  // used as a way round the limit.
  const paywalled = used >= limit
  if (paywalled && previewsUsed >= PREVIEW_LIMIT) {
    return res.status(403).json({ error: `You've used all ${limit} stories included in your plan this month. Upgrade for more.`, limitReached: true })
  }

  const { characters, prompt, genre, style, length, language, toBeContinued, previous, images } = req.body

  if (!Array.isArray(characters) || characters.length === 0) {
    return res.status(400).json({ error: 'Choose at least one character.' })
  }

  // Tier 2 only: pictures to build the story around, one picture for each page.
  let pictures = []
  if (Array.isArray(images) && images.length > 0) {
    if (tier !== 'tier2') {
      return res.status(403).json({ error: 'Adding your own pictures is part of Tier 2.', tierRequired: 'tier2' })
    }
    pictures = images.slice(0, MAX_IMAGES).filter(im => im && typeof im.base64 === 'string' && im.base64.length > 100 && im.base64.length <= MAX_IMAGE_B64)
    if (pictures.length !== Math.min(images.length, MAX_IMAGES)) {
      return res.status(400).json({ error: 'One of your pictures is too large or could not be read. Try a smaller one.' })
    }
  }

  // The five story languages. Anything else falls back to English.
  const LANGUAGE_NAMES = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    zh: 'Simplified Chinese (Mandarin)',
    hi: 'Hindi (Devanagari script)'
  }
  const lang = LANGUAGE_NAMES[language] ? language : 'en'
  const langName = LANGUAGE_NAMES[lang]
  const cliffhanger = toBeContinued === true

  // When continuing an earlier story, the client sends what happened so far.
  const prev = previous && typeof previous.text === 'string' && previous.text.trim()
    ? {
        title: String(previous.title || '').slice(0, 200),
        text: previous.text.slice(0, 9000),
        chapterNumber: Math.min(50, Math.max(1, parseInt(previous.chapterNumber, 10) || 1))
      }
    : null

  // How long a scene is. Chinese has no spaces, so it is counted in characters.
  const sceneLen = lang === 'zh' ? 'about 55 to 75 Chinese characters' : '35-45 words'

  const languageRule = lang === 'en' ? '' : `- Write the title, tagline, every chapter title and all of the narration in ${langName}, in natural wording a native speaker would use when reading to a child. Keep every imagePrompt and every sound description in English, because other tools read those. Every triggerPhrase must be copied exactly from the ${langName} narration.${lang === 'zh' ? ' Use full width Chinese punctuation and do not put spaces between Chinese characters.' : ''}\n`

  const endingRule = cliffhanger
    ? `- This story is not finished. End the final scene on a gentle, exciting cliffhanger that makes the reader want the next chapter, such as a mysterious discovery, a surprise visitor, a strange sound, or a door that has just creaked open. Do NOT answer the main question of the story, and do NOT end with a heart message or a goodbye. Nothing frightening and nobody in danger; the mood stays warm and curious. The last sentence should hang in the air.`
    : prev
      ? `- This is the final chapter, so bring the whole story to a satisfying, happy close, tying up what happened in the earlier chapters. End with a warm heart message about family, friendship or courage\n- Always end happily`
      : `- End the story with a warm heart message about family, friendship or courage\n- Always end happily`

  const continuation = prev
    ? `This is chapter ${prev.chapterNumber + 1} of an ongoing story called "${prev.title}". Here is the story so far, for reference only:\n\"\"\"\n${prev.text}\n\"\"\"\nContinue directly from where the last chapter stopped, with the same characters and setting. Do not retell or repeat what already happened, and do not introduce the characters again. Give this chapter its own title.\n\n`
    : ''

  const ideaLine = typeof prompt === 'string' && prompt.trim()
    ? `Story idea${prev ? ' for what happens next' : ''}: "${prompt}"`
    : 'Story idea: choose a natural, exciting next part of the adventure yourself.'

  const sceneCount = pictures.length > 0 ? pictures.length : length === 'quick' ? 5 : length === 'chapter' ? 10 : 8

  const characterDesc = characters.map(c =>
    `- ${c.name}${c.age ? `, age ${c.age}` : ''}${c.personality ? `, ${c.personality}` : ''}${c.role ? ` (${c.role})` : ''}`
  ).join('\n')

  const styleGuide = {
    'Watercolour': 'soft watercolour painting, gentle washes of colour, delicate brushstrokes, children\'s book illustration style',
    'Pixar-like': 'Pixar 3D animation render, warm cinematic lighting, highly detailed, expressive characters, beautiful environments',
    'Storybook': 'classic fairy tale storybook illustration, detailed hand-painted, warm golden light, magical atmosphere',
    'Comic book': 'bold comic book illustration, strong linework, vivid saturated colours, dynamic angles',
    'Anime': 'Studio Ghibli anime style, lush detailed backgrounds, soft warm lighting, expressive emotional characters',
    'Claymation': 'claymation stop-motion style, tactile clay textures, bright cheerful colours, whimsical and charming'
  }
  const visualStyle = styleGuide[style] || 'beautiful children\'s book illustration'

  const systemPrompt = `You are a gifted children's storybook author. You write warm, exciting, beautifully detailed adventure stories for children aged 4-10.

Your writing style matches this example exactly:

"One sunny morning, brothers Beau and Darcy discovered a dusty wooden chest in Grandpa's old shed. Inside was a faded treasure map with a big red X. 'Treasure Island awaits the bravest adventurers,' Beau read aloud, his eyes widening with excitement."

Key rules:
- Write in third person, past tense
- Never use em dashes or en dashes anywhere. Use full stops, commas or the word "and" instead
- Use the characters' real names often
- Include vivid specific details: colours, sounds, textures, emotions
- Add dialogue with quotation marks to bring scenes alive
- Build excitement and tension across scenes
- Each scene is 2-3 sentences, ${sceneLen} total, short, punchy sentences, not long compound ones. Never chain multiple clauses together with commas/"and" to cram extra content into one sentence, if it needs a comma to add another action or detail, it should probably be its own short sentence instead, or cut entirely
${languageRule}${endingRule}

Respond ONLY with valid JSON. No markdown, no code fences, no extra text.`

  const pictureRule = pictures.length > 0
    ? `The person has supplied ${pictures.length} ${pictures.length === 1 ? 'picture' : 'pictures'}, shown above in order. Write exactly ${pictures.length} ${pictures.length === 1 ? 'scene' : 'scenes'}. Scene 1 is based on picture 1, scene 2 on picture 2, and so on. Each scene's narration must describe the moment shown in its picture (where it is, who is there, what is happening) while moving the story forward, so the pages read as one adventure. Each imagePrompt must describe that same moment so an illustrator can redraw the picture in the chosen style. Never mention photos or pictures in the narration.\n\n`
    : ''

  const userPrompt = `${continuation}${pictureRule}Write a ${sceneCount}-scene personalised children's adventure story.

Characters starring in this story:
${characterDesc}

${ideaLine}
Genre: ${genre}
Visual style for illustrations: ${style}

Return this exact JSON shape:
{
  "title": "An exciting story title featuring the character names",
  "tagline": "One warm exciting sentence teaser",
  "scenes": [
    {
      "sceneNumber": 1,
      "chapter": "Short exciting scene title (e.g. 'The Discovery', 'Setting Sail', 'The Hidden Cave')",
      "narration": "2-3 SHORT sentences, ${sceneLen} total, tight and vivid, not padded, and no long comma-chained sentences standing in for several. Use character names. Include specific details, emotion, and dialogue where it earns its place. Match the warm adventure tone of the example.",
      "imagePrompt": "Describe EXACTLY what the character is physically doing in this scene for a ${visualStyle} children's picture book illustration. Format: [CHARACTER ACTION] + [ENVIRONMENT]. Be very specific about the action. Examples: 'Jessie rows a small wooden boat across a sparkling blue ocean, leaning forward with effort, dolphins jumping alongside, tropical island visible in background, golden afternoon light' OR 'Jessie crouches in a dark cave holding a glowing torch, eyes wide with wonder, ancient treasure chests scattered around, gold coins spilling out, waterfall visible at cave entrance' OR 'Jessie sits cross-legged on a clifftop at sunset, holding a treasure map, pointing excitedly at something in the distance, jungle stretching below, pink and orange sky'. Always specify: what the character is doing with their body/hands, their facial expression, and the full environment around them.",
      "sfxCues": [
        {
          "triggerPhrase": "exact short phrase from the narration text that should trigger the sound (3-5 words)",
          "sound": "A short natural language description of the sound effect for a children's storybook, warm, gentle, and age-appropriate. Be specific, textured, and tied to exactly what's happening at that moment (not generic). Vary the sonic palette across the story, don't reuse the same sound twice. Examples: 'gentle ocean waves lapping on a sandy shore, a single seagull calling in the distance', 'magical sparkle chime rising in pitch, like fairy dust catching the light', 'friendly dragon purring low and warm, a rumble like distant thunder but cosy', 'floorboards creaking softly underfoot in an old wooden clubhouse', 'the papery rustle of a treasure map being unrolled', 'quick eager footsteps hurrying across a wooden floor'. Never use scary, violent, or distressing sounds."
        }
      ]
      SFX approach: every sound must be something literally, physically present in the scene, a sound a person standing right there would actually hear. Footsteps, doors, water, wind, objects being picked up or set down, animals, weather, fabric, fire, mechanisms. Never a film-score element: no dramatic strings, tension stings, orchestral swells, or "mood" sounds that aren't an actual physical sound source in the scene, those don't exist in the story's world, only in a film composer's head. Never an invented character reaction (a gasp, a sigh, a laugh) unless that exact reaction is written in the narration text itself, if the text doesn't say someone gasped, don't invent a gasp. BAD (score-like, not a real in-scene sound): narration "she raced downstairs to the kitchen" → sound "a sound of strings, tension building", wrong, nothing in the scene makes that sound. GOOD for the same line: "quick footsteps thudding down wooden stairs, two at a time." BAD (invented, unwritten reaction): narration "her family rushed in, drawn by the amazing smell" → sound "a gasp", wrong, nobody is described gasping and the moment is warm, not shocked. GOOD for the same line: "eager footsteps hurrying into the kitchen, a happy murmur of voices." First read the whole scene as one moment and decide what it would actually sound like if you were standing there, THEN find natural points in the narration text to anchor each of those real sounds via triggerPhrase. Do not mechanically force one sound onto every sentence in isolation; a cue that's technically tied to a word but doesn't fit the moment as a whole is worse than no cue at all. At least 2 sfxCues per scene, and don't add a 3rd unless the scene genuinely has a third distinct sound worth hearing, quality and fit over quantity. triggerPhrase must be an exact substring of the narration text. Every sound description must be distinct across the whole story, don't reuse the same sound twice.
    }
  ]
}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 9000, // Hindi and Chinese use many more tokens than English
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: pictures.length === 0
            ? userPrompt
            : [
                ...pictures.flatMap((im, i) => [
                  { type: 'text', text: `Picture ${i + 1}:` },
                  { type: 'image', source: { type: 'base64', media_type: im.mime === 'image/png' ? 'image/png' : 'image/jpeg', data: im.base64 } }
                ]),
                { type: 'text', text: userPrompt }
              ]
        }]
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic error:', err)
      return res.status(500).json({ error: 'Story generation failed', detail: err })
    }

    const data = await response.json()
    const text = data.content[0].text.trim()

    let story
    try {
      story = JSON.parse(text)
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) story = JSON.parse(match[0])
      else throw new Error('Could not parse story JSON')
    }

    // The prompt asks for at least 2 sfxCues per scene, but a model
    // instruction is a request, not a guarantee, top up any scene that
    // came back under that floor rather than trusting it blindly. Uses
    // guaranteed-valid triggerPhrases (actual substrings of that scene's own
    // narration, the start and the end of it) so buildSfxTimeline can
    // always place them, spread across the scene rather than bunched.
    const FALLBACK_SOUNDS = [
      'a gentle magical shimmer, sparkling and warm',
      'a soft happy giggle',
      'birds singing sweetly in the distance',
      'a warm contented sigh',
      'a light breeze rustling through leaves',
      'a cheerful little chime, bright and playful'
    ]
    if (Array.isArray(story?.scenes)) {
      story.scenes.forEach((scene) => {
        if (!scene.narration) return
        if (!Array.isArray(scene.sfxCues)) scene.sfxCues = []
        const usedSounds = new Set(scene.sfxCues.map((c) => c.sound))
        const words = scene.narration.trim().split(/\s+/)
        const anchors = [
          words.slice(0, 3).join(' '),
          words.slice(Math.max(0, words.length - 3)).join(' ')
        ]
        let anchorIdx = 0
        while (scene.sfxCues.length < 2 && anchorIdx < anchors.length) {
          const fallback = FALLBACK_SOUNDS.find((s) => !usedSounds.has(s)) || FALLBACK_SOUNDS[0]
          scene.sfxCues.push({ triggerPhrase: anchors[anchorIdx], sound: fallback })
          usedSounds.add(fallback)
          anchorIdx += 1
        }
      })
    }

    // No em dashes or en dashes in anything people read. A dash that cuts off
    // speech or ends a line becomes an ellipsis, any other dash becomes a comma.
    // The sound cue phrases are cleaned the same way so they still match the narration.
    const tidy = (text) => typeof text !== 'string' ? text : text
      .replace(/\s*[\u2014\u2015]+\s*(?=["'\u201C\u201D\u2018\u2019\u00BB\u300D\u300F)]|$)/g, '\u2026')
      .replace(/\s*[\u2014\u2015]+\s*/g, lang === 'zh' ? '\uFF0C' : ', ')
      .replace(/\s+\u2013\s+/g, ', ')
    if (typeof story.title === 'string') story.title = tidy(story.title)
    if (typeof story.tagline === 'string') story.tagline = tidy(story.tagline)
    ;(story.scenes || []).forEach((scene) => {
      scene.chapter = tidy(scene.chapter)
      scene.narration = tidy(scene.narration)
      ;(scene.sfxCues || []).forEach((cue) => { cue.triggerPhrase = tidy(cue.triggerPhrase); cue.sound = tidy(cue.sound) })
    })

    // Over the limit: only the first page is handed over. The rest is never sent.
    if (paywalled && Array.isArray(story.scenes)) {
      story.scenes = story.scenes.slice(0, 1)
      story.paywalled = true
    }

    res.status(200).json(story)
  } catch (err) {
    console.error('Generate story error:', err)
    res.status(500).json({ error: err.message })
  }
}
