import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Avatar, Button, Spinner } from '../components/UI'
import { v4 as uuidv4 } from 'uuid'

const GENRES = ['Ocean','Bedtime','Fantasy','Space','Jungle','Comedy','Adventure','Magic']
const GENRE_EMOJI = { Ocean:'🌊', Bedtime:'🌙', Fantasy:'🧙', Space:'🚀', Jungle:'🦁', Comedy:'😄', Adventure:'⚗️', Magic:'✨' }
const STYLES = [
  { id: 'Watercolour', icon: '🎨' },
  { id: 'Pixar-like', icon: '✨' },
  { id: 'Storybook', icon: '📖' },
  { id: 'Comic book', icon: '💥' },
  { id: 'Anime', icon: '🌸' },
  { id: 'Claymation', icon: '🏺' },
]
const LENGTHS = [
  { id: 'quick', label: 'Quick tale', desc: '5 scenes · ~5 min' },
  { id: 'story', label: 'Story', desc: '8 scenes · ~10 min' },
  { id: 'chapter', label: 'Chapter book', desc: '10 scenes · ~20 min' },
]

export default function Create() {
  const navigate = useNavigate()
  const { characters, saveStory } = useStore()
  const [selectedChars, setSelectedChars] = useState([])
  const [prompt, setPrompt] = useState('')
  const [genre, setGenre] = useState('Fantasy')
  const [style, setStyle] = useState('Pixar-like')
  const [length, setLength] = useState('story')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!generating) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = 'Your story is still being created. Are you sure you want to leave?'
      return e.returnValue
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [generating])

  const toggleChar = (id) => setSelectedChars(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const chosenChars = characters.filter(c => selectedChars.includes(c.id))
  const canGenerate = chosenChars.length > 0 && prompt.trim().length > 5

  const generate = async () => {
    setGenerating(true)
    setError(null)

    try {
      // Step 1: Generate story text only (fast, ~5s, uses server API)
      const storyRes = await fetch('/api/generate-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characters: chosenChars.map(c => ({ name: c.name, age: c.age, personality: c.personality, role: c.role })),
          prompt, genre, style, length
        })
      })
      if (!storyRes.ok) {
        const err = await storyRes.json().catch(() => ({}))
        throw new Error(err.error || 'Story generation failed. Check your Anthropic API key.')
      }
      const story = await storyRes.json()
      if (!story?.scenes?.length) throw new Error('Story came back empty — please try again.')

      // Step 2: Save story immediately WITHOUT images, then navigate
      // Images will be generated progressively in the story player
      const id = uuidv4()
      const charDesc = chosenChars.map(c => {
        const parts = [c.name]
        if (c.age) parts.push(`age ${c.age}`)
        if (c.description) parts.push(c.description)
        else if (c.personality) parts.push(c.personality)
        return parts.join(', ')
      }).join(' | ')

      // Keep photoBase64 on characters so StoryPlayer can use image-to-image
      const charsWithPhotos = chosenChars

      const fullStory = {
        id,
        title: story.title,
        tagline: story.tagline,
        genre, style, length,
        characters: charsWithPhotos,
        charDesc,
        scenes: story.scenes,
        createdAt: Date.now(),
        imagesGenerating: true  // flag so player knows to generate images
      }
      saveStory(fullStory)

      // Navigate immediately — images generate in the player
      navigate(`/story/${id}`)
    } catch (err) {
      setError(err.message)
      setGenerating(false)
    }
  }

  if (generating) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 40 }}>
        <Spinner size={52} />
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Writing your story…</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Just a few seconds — Claude is crafting your adventure</p>
        </div>
        {error && (
          <div style={{ background: '#FCEBEB', border: '1px solid #F09595', borderRadius: 12, padding: '12px 16px', color: '#501313', fontSize: 13, maxWidth: 340, textAlign: 'center' }}>
            {error}
            <br />
            <button onClick={() => { setGenerating(false); setError(null) }} style={{ marginTop: 8, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>Go back</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 28 }}>
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#534AB7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>1</div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Choose characters</h2>
        </div>
        {characters.length === 0 ? (
          <div style={{ padding: '20px', background: 'var(--surface-card)', border: '0.5px dashed var(--border-strong)', borderRadius: 14, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>You haven't added any characters yet.</p>
            <button onClick={() => navigate('/characters')} style={{ fontSize: 13, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer' }}>+ Add characters →</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {characters.map(c => {
              const sel = selectedChars.includes(c.id)
              return (
                <div key={c.id} onClick={() => toggleChar(c.id)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  padding: '12px 16px', borderRadius: 14, cursor: 'pointer', transition: 'all 0.15s',
                  border: `${sel ? '2px' : '0.5px'} solid ${sel ? '#534AB7' : 'var(--border)'}`,
                  background: sel ? '#EEEDFE' : 'var(--surface-card)', minWidth: 80
                }}>
                  <Avatar name={c.name} photo={c.photo} size={44} />
                  <span style={{ fontSize: 12, fontWeight: sel ? 600 : 400, color: sel ? '#3C3489' : 'var(--text-secondary)' }}>{c.name}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div style={{ height: '0.5px', background: 'var(--border)' }} />

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#534AB7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>2</div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>What's the story about?</h2>
        </div>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={`e.g. ${chosenChars.length > 0 ? chosenChars[0].name : 'Mia'} discovers a glowing turtle on a magical ocean adventure…`}
          rows={3}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 12,
            border: '0.5px solid var(--border)', background: 'var(--surface-input)',
            fontFamily: 'inherit', fontSize: 14, color: 'var(--text-primary)',
            resize: 'none', lineHeight: 1.6, outline: 'none', transition: 'border-color 0.15s', boxSizing: 'border-box'
          }}
          onFocus={e => e.target.style.borderColor = '#534AB7'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {GENRES.map(g => (
            <button key={g} onClick={() => setGenre(g)} style={{
              padding: '6px 14px', borderRadius: 100, fontSize: 12, cursor: 'pointer',
              border: '0.5px solid', transition: 'all 0.15s',
              background: genre === g ? '#EEEDFE' : 'transparent',
              borderColor: genre === g ? '#534AB7' : 'var(--border-strong)',
              color: genre === g ? '#3C3489' : 'var(--text-secondary)',
              fontWeight: genre === g ? 600 : 400
            }}>{GENRE_EMOJI[g]} {g}</button>
          ))}
        </div>
      </section>

      <div style={{ height: '0.5px', background: 'var(--border)' }} />

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#534AB7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>3</div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Visual style</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {STYLES.map(s => (
            <div key={s.id} onClick={() => setStyle(s.id)} style={{
              padding: '14px 10px', borderRadius: 14, cursor: 'pointer', textAlign: 'center',
              border: `${style === s.id ? '2px' : '0.5px'} solid ${style === s.id ? '#534AB7' : 'var(--border)'}`,
              background: style === s.id ? '#EEEDFE' : 'var(--surface-card)', transition: 'all 0.15s'
            }}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: style === s.id ? '#3C3489' : 'var(--text-secondary)' }}>{s.id}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ height: '0.5px', background: 'var(--border)' }} />

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#534AB7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>4</div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Story length</h2>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {LENGTHS.map(l => (
            <div key={l.id} onClick={() => setLength(l.id)} style={{
              flex: 1, padding: '12px 10px', borderRadius: 12, textAlign: 'center', cursor: 'pointer',
              border: `${length === l.id ? '2px' : '0.5px'} solid ${length === l.id ? '#534AB7' : 'var(--border)'}`,
              background: length === l.id ? '#EEEDFE' : 'var(--surface-card)', transition: 'all 0.15s'
            }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: length === l.id ? '#3C3489' : 'var(--text-primary)', marginBottom: 3 }}>{l.label}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <Button onClick={generate} disabled={!canGenerate} style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: 15, borderRadius: 14, marginTop: 4 }}>
        ✨ Generate story
      </Button>
    </div>
  )
}
