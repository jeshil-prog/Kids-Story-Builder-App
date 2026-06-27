export const config = { maxDuration: 60 }

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

"One sunny morning, brothers Beau and Darcy were exploring Grandpa's old shed when they discovered a dusty wooden chest. Inside was a faded treasure map covered in strange symbols and a big red X. At the bottom were the words: 'Treasure Island awaits the bravest adventurers.' Beau's eyes widened with excitement, and Darcy could hardly stand still."

Key rules:
- Write in third person, past tense
- Use the characters' real names often
- Include vivid specific details: colours, sounds, textures, emotions
- Add dialogue with quotation marks to bring scenes alive
- Build excitement and tension across scenes
- Each scene is 3-5 sentences — rich but not overwhelming
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
      "narration": "3-5 sentences telling this part of the story. Use character names. Include vivid details, emotions, and dialogue. Match the warm adventure tone of the example.",
      "imagePrompt": "WIDE ESTABLISHING SHOT for a ${visualStyle} children's picture book page. Describe the full environment and setting in rich detail — landscape, sky, water, forest, buildings, magical elements. The character is visible but the scene fills the frame. Include: what the environment looks like, time of day, weather/lighting, magical elements, colours, mood. Example format: 'Wide shot of a moonlit ocean at night with glowing waves. A child in pyjamas sits on a floating wooden bed in the middle of the sea. Giant friendly whales surface around the bed. Bioluminescent fish glow beneath the water. Star-filled sky above. Warm magical light. Vast epic scene.'",
      "sfxCues": [
        {
          "triggerPhrase": "exact short phrase from the narration text that should trigger the sound (3-5 words)",
          "sound": "one of: birds, wind, rain, thunder, fire, magic, ocean, jungle, footsteps, gasp, laugh, whoosh, sparkle, fanfare, splash, rustle, knock, creaking, growl, chime"
        }
      ]
      Note: include 1-3 sfxCues per scene, placed at natural sound moments. triggerPhrase must be an exact substring of the narration.
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
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
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
