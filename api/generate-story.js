export const config = { maxDuration: 300 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { characters, prompt, genre, style, length } = req.body

  const sceneCount = length === 'quick' ? 5 : length === 'chapter' ? 10 : 8

  const characterDesc = characters.map(c =>
    `- ${c.name}${c.age ? `, age ${c.age}` : ''}${c.personality ? ` — ${c.personality}` : ''}${c.role ? ` (${c.role})` : ''}`
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
- Use the characters' real names often
- Include vivid specific details: colours, sounds, textures, emotions
- Add dialogue with quotation marks to bring scenes alive
- Build excitement and tension across scenes
- Each scene is 2-3 sentences, 35-45 words total — short, punchy sentences, not long compound ones. Never chain multiple clauses together with commas/"and" to cram extra content into one sentence — if it needs a comma to add another action or detail, it should probably be its own short sentence instead, or cut entirely
- End the story with a warm heart message about family, friendship or courage
- Always end happily

Respond ONLY with valid JSON. No markdown, no code fences, no extra text.`

  const userPrompt = `Write a ${sceneCount}-scene personalised children's adventure story.

Characters starring in this story:
${characterDesc}

Story idea: "${prompt}"
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
      "narration": "2-3 SHORT sentences, 35-45 words total — tight and vivid, not padded, and no long comma-chained sentences standing in for several. Use character names. Include specific details, emotion, and dialogue where it earns its place. Match the warm adventure tone of the example.",
      "imagePrompt": "Describe EXACTLY what the character is physically doing in this scene for a ${visualStyle} children's picture book illustration. Format: [CHARACTER ACTION] + [ENVIRONMENT]. Be very specific about the action. Examples: 'Jessie rows a small wooden boat across a sparkling blue ocean, leaning forward with effort, dolphins jumping alongside, tropical island visible in background, golden afternoon light' OR 'Jessie crouches in a dark cave holding a glowing torch, eyes wide with wonder, ancient treasure chests scattered around, gold coins spilling out, waterfall visible at cave entrance' OR 'Jessie sits cross-legged on a clifftop at sunset, holding a treasure map, pointing excitedly at something in the distance, jungle stretching below, pink and orange sky'. Always specify: what the character is doing with their body/hands, their facial expression, and the full environment around them.",
      "sfxCues": [
        {
          "triggerPhrase": "exact short phrase from the narration text that should trigger the sound (3-5 words)",
          "sound": "A short natural language description of the sound effect for a children's storybook — warm, gentle, and age-appropriate. Be specific, textured, and tied to exactly what's happening at that moment (not generic). Vary the sonic palette across the story — don't reuse the same sound twice. Examples: 'gentle ocean waves lapping on a sandy shore, a single seagull calling in the distance', 'magical sparkle chime rising in pitch, like fairy dust catching the light', 'friendly dragon purring low and warm, a rumble like distant thunder but cosy', 'floorboards creaking softly underfoot in an old wooden clubhouse', 'the papery rustle of a treasure map being unrolled', 'quick eager footsteps hurrying across a wooden floor'. Never use scary, violent, or distressing sounds."
        }
      ]
      SFX approach: every sound must be something literally, physically present in the scene — a sound a person standing right there would actually hear. Footsteps, doors, water, wind, objects being picked up or set down, animals, weather, fabric, fire, mechanisms. Never a film-score element: no dramatic strings, tension stings, orchestral swells, or "mood" sounds that aren't an actual physical sound source in the scene — those don't exist in the story's world, only in a film composer's head. Never an invented character reaction (a gasp, a sigh, a laugh) unless that exact reaction is written in the narration text itself — if the text doesn't say someone gasped, don't invent a gasp. BAD (score-like, not a real in-scene sound): narration "she raced downstairs to the kitchen" → sound "a sound of strings, tension building" — wrong, nothing in the scene makes that sound. GOOD for the same line: "quick footsteps thudding down wooden stairs, two at a time." BAD (invented, unwritten reaction): narration "her family rushed in, drawn by the amazing smell" → sound "a gasp" — wrong, nobody is described gasping and the moment is warm, not shocked. GOOD for the same line: "eager footsteps hurrying into the kitchen, a happy murmur of voices." First read the whole scene as one moment and decide what it would actually sound like if you were standing there, THEN find natural points in the narration text to anchor each of those real sounds via triggerPhrase. Do not mechanically force one sound onto every sentence in isolation; a cue that's technically tied to a word but doesn't fit the moment as a whole is worse than no cue at all. At least 2 sfxCues per scene, and don't add a 3rd unless the scene genuinely has a third distinct sound worth hearing — quality and fit over quantity. triggerPhrase must be an exact substring of the narration text. Every sound description must be distinct across the whole story — don't reuse the same sound twice.
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
        max_tokens: 6000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
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
    // instruction is a request, not a guarantee — top up any scene that
    // came back under that floor rather than trusting it blindly. Uses
    // guaranteed-valid triggerPhrases (actual substrings of that scene's own
    // narration — the start and the end of it) so buildSfxTimeline can
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

    res.status(200).json(story)
  } catch (err) {
    console.error('Generate story error:', err)
    res.status(500).json({ error: err.message })
  }
}
