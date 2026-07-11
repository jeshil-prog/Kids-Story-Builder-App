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
          "sound": "A short natural language description of the sound effect for a children's storybook — warm, gentle, and age-appropriate. Be specific, textured, and tied to exactly what's happening at that moment (not generic). Vary the sonic palette across the story — don't reuse the same sound twice. Examples: 'gentle ocean waves lapping on a sandy shore, a single seagull calling in the distance', 'magical sparkle chime rising in pitch, like fairy dust catching the light', 'friendly dragon purring low and warm, a rumble like distant thunder but cosy', 'floorboards creaking softly underfoot in an old wooden clubhouse', 'the papery rustle of a treasure map being unrolled', 'a single joyful gasp followed by delighted giggling'. Never use scary, violent, or distressing sounds."
        }
      ]
      Note: include roughly ONE sfxCue per sentence in the narration — nearly every sentence should have a sound tied to its key action or detail, not just 1-3 per whole scene. triggerPhrase must be an exact substring of the narration text. Every sound description must be distinct — reflect the specific action/detail of its sentence, not a repeated stock sound.
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

    res.status(200).json(story)
  } catch (err) {
    console.error('Generate story error:', err)
    res.status(500).json({ error: err.message })
  }
}
