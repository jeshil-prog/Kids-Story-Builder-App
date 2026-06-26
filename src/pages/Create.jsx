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
  const [genStep, setGenStep] = useState(0)
  const [genDetail, setGenDetail] = useState('')
  const [genProgress, setGenProgress] = useState(0)
  const [error, setError] = useState(null)

  // Warn user before leaving during generation
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
    setGenStep(0)
    setGenProgress(0)
    setGenDetail('Claude is writing your story…')

    try {
      // Step 1: Generate story
      const storyRes = await fetch('/api/generate-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characters: chosenChars.map(c => ({ name: c.name, age: c.age, personality: c.personality, role: c.role })),
          prompt, genre, style, length
        })
      })
      if (!storyRes.ok) {
        const errText = await storyRes.text()
        let errMsg = 'Story generation failed.'
        try { errMsg = JSON.parse(errText).error || errMsg } catch {}
        throw new Error(errMsg)
      }
      const story = await storyRes.json()
      if (!story || !story.scenes || !Array.isArray(story.scenes)) {
        throw new Error('Story format invalid — please try again.')
      }
      const scenes = story.scenes
      const total = scenes.length

      setGenStep(1)
      setGenDetail(`Story written — ${total} scenes ready. Now illustrating…`)

      // Build rich character description for image prompts including AI-analysed appearance
      const charDesc = chosenChars.map(c => {
        const parts = [c.name]
        if (c.age) parts.push(`age ${c.age}`)
        if (c.description) parts.push(c.description)
        else if (c.personality) parts.push(c.personality)
        return parts.join(', ')
      }).join(' | ')

      // Step 2: Generate images directly from browser to OpenAI (no server timeout)
      const stylePrefix = {
        'Watercolour': "soft watercolour children's book illustration, painterly, gentle colours,",
        'Pixar-like': 'Pixar 3D animation style, warm cinematic lighting, expressive cute characters, highly detailed,',
        'Storybook': "classic storybook illustration, detailed, warm, hand-painted, fairy tale style,",
        'Comic book': 'bold comic book illustration, clean linework, bright vivid colours, dynamic composition,',
        'Anime': 'Studio Ghibli anime style, detailed painterly backgrounds, soft lighting, expressive characters,',
        'Claymation': 'claymation stop-motion style, tactile textures, warm whimsical, colourful,'
      }
      const styleP = stylePrefix[style] || "children's book illustration, warm and magical,"
      const openAiKey = import.meta.env.VITE_OPENAI_API_KEY

      for (let i = 0; i < scenes.length; i++) {
        setGenStep(2)
        setGenDetail(`Illustrating scene ${i + 1} of ${total}…`)
        setGenProgress(Math.round((i / total) * 100))
        try {
          const charNote = charDesc ? `Characters in this scene: ${charDesc}. ` : ''
          const fullPrompt = `${styleP} ${charNote}${scenes[i].imagePrompt || 'magical storybook scene'}. No text or words in image. Child-safe, warm, magical, beautiful.`
          const imgRes = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openAiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-image-1',
              prompt: fullPrompt,
              n: 1,
              size: '1024x1024',
              quality: 'low'
            })
          })
          if (imgRes.ok) {
            const data = await imgRes.json()
            const b64 = data.data?.[0]?.b64_json
            if (b64) {
              scenes[i].imageData = b64
              scenes[i].imageType = 'image/png'
            }
          } else {
            console.error('Image failed:', imgRes.status)
          }
        } catch (err) {
          console.error('Image error:', err)
        }
      }

      setGenStep(3)
      setGenProgress(100)
      setGenDetail('Saving your story…')

      // Compress images to reduce localStorage size (5MB limit)
      const compressImage = (b64, type) => new Promise(resolve => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = 512
          canvas.height = 512
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, 512, 512)
          const compressed = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
          resolve({ b64: compressed, imageType: 'image/jpeg' })
        }
        img.onerror = () => resolve({ b64, imageType: type })
        img.src = `data:${type};base64,${b64}`
      })

      // Compress all scene images
      for (let i = 0; i < scenes.length; i++) {
        if (scenes[i].imageData) {
          const { b64, imageType } = await compressImage(scenes[i].imageData, scenes[i].imageType || 'image/png')
          scenes[i].imageData = b64
          scenes[i].imageType = imageType
        }
      }

      const id = uuidv4()
      const fullStory = {
        id, title: story.title, tagline: story.tagline,
        genre, style, length,
        characters: chosenChars,
        scenes,
        createdAt: Date.now()
      }
      saveStory(fullStory)
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

        {/* Warning banner */}
        <div style={{
          background: '#FAEEDA', border: '1px solid #FAC775', borderRadius: 12,
          padding: '10px 16px', fontSize: 13, color: '#412402',
          textAlign: 'center', maxWidth: 340
        }}>
          ⚠️ Keep this tab open while your story is being created
        </div>

        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Crafting your story…</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{genDetail}</p>
        </div>

        {/* Progress bar */}
        {genStep === 2 && (
          <div style={{ width: '100%', maxWidth: 340 }}>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${genProgress}%`, background: '#534AB7', borderRadius: 3, transition: 'width 0.5s' }} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>{genProgress}% illustrated</p>
          </div>
        )}

        <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {['Writing your story', 'Splitting into scenes', 'Illustrating each scene', 'Saving'].map((step, i) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: i < genStep ? '#1D9E75' : i === genStep ? '#534AB7' : 'var(--border-strong)',
                animation: i === genStep ? 'pulse 1.2s ease infinite' : undefined
              }} />
              <span style={{ fontSize: 13, color: i <= genStep ? 'var(--text-primary)' : 'var(--text-muted)' }}>{step}</span>
              {i < genStep && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#1D9E75' }}>✓</span>}
            </div>
          ))}
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
      {/* Step 1: Characters */}
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

      {/* Step 2: Prompt */}
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

      {/* Step 3: Style */}
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

      {/* Step 4: Length */}
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
