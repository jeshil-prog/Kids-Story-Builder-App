export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { characters, prompt, genre, style, length } = req.body

  const sceneCount = length === 'quick' ? 5 : length === 'chapter' ? 10 : 8

  const characterDesc = characters.map(c =>
    `- ${c.name}${c.age ? `, age ${c.age}` : ''}${c.personality ? ` (${c.personality})` : ''}`
  ).join('\n')

  const systemPrompt = `You are a children's storybook author. You write warm, imaginative bedtime stories for young children (ages 3–10). 
Your stories are gentle, wonder-filled, and always end happily. Each scene is vivid and visual.
Respond ONLY with a valid JSON object — no markdown fences, no extra text.`

  const userPrompt = `Write a ${sceneCount}-scene children's storybook story.

Characters:
${characterDesc}

Story prompt: "${prompt}"
Genre: ${genre}
Visual style: ${style}

Return a JSON object with this exact shape:
{
  "title": "Story title",
  "tagline": "One-line description",
  "scenes": [
    {
      "sceneNumber": 1,
      "chapter": "Chapter title (group 2-3 scenes per chapter)",
      "narration": "2-3 sentences of story narration, lyrical and read-aloud friendly",
      "imagePrompt": "Detailed visual description for AI image generation. Include: art style (${style} illustration style), character appearances, setting, lighting, mood. Make it specific and painterly. Do not include text or words in the image."
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
