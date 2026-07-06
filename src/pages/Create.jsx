import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Avatar, Button, SectionLabel, Spinner } from '../components/UI'
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

const GEN_STEPS = [
  'Writing your story',
  'Splitting into scenes',
  'Illustrating scene',
  'Finishing up',
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
  const [error, setError] = useState(null)

  const toggleChar = (id) => setSelectedChars(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const chosenChars = characters.filter(c => selectedChars.includes(c.id))
  const canGenerate = chosenChars.length > 0 && prompt.trim().length > 5

  const generate = async () => {
    setGenerating(true)
    setError(null)
    setGenStep(0)
    setGenDetail('Sending your story to the writer…')

    try {
      // Step 1: Generate story text + scene breakdown
      setGenStep(0)
      setGenDetail('Claude is writing your story…')
      const storyRes = await fetch('/api/generate-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characters: chosenChars.map(c => ({ name: c.name, age: c.age, personality: c.personality, role: c.role })),
          prompt, genre, style, length
        })
      })
      if (!storyRes.ok) throw new Error('Story generation failed. Check your API keys.')
      const story = await storyRes.json()

      setGenStep(1)
      setGenDetail(`The magic is beginning… ${story.scenes.length} scenes to illustrate!`)

      const id = uuidv4()
      const charPayload = chosenChars.map(c => ({ name: c.name, photoBase64: c.photoBase64 || null, photoMime: c.photoMime || 'image/jpeg', description: c.description || null }))

      // Step 2: Generate all images one at a time before navigating
      setGenStep(2)
      for (let i = 0; i < story.scenes.length; i++) {
        const scene = story.scenes[i]
        setGenDetail(\`Painting scene \${i + 1} of \${story.scenes.length}… 🎨\`)
        try {
          const imgRes = await fetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imagePrompt: scene.imagePrompt,
              style,
              storyId: id,
              sceneIndex: i,
              characters: charPayload
            })
          })
          if (imgRes.ok) {
            const { imageUrl } = await imgRes.json()
            scene.imageUrl = imageUrl
          }
        } catch (err) {
          console.error(\`Scene \${i} failed:\`, err)
        }
      }

      setGenStep(3)
      setGenDetail('Wrapping up your magical story… almost there! ✨')


      const fullStory = {
        id, title: story.title, tagline: story.tagline,
        genre, style, length,
        characters: chosenChars,
        scenes: story.scenes,
        createdAt: Date.now()
      }
      saveStory(fullStory)
      navigate(`/story/${id}`)
    } catch (err) {
      setError(err.message)
      setGenerating(false)
    }
  }

  const MAGIC_MESSAGES = [
    { emoji: '🪄', text: 'Sprinkling story dust…' },
    { emoji: '🌟', text: 'Waking up the characters…' },
    { emoji: '🎨', text: 'Mixing magical paint colours…' },
    { emoji: '🦄', text: 'Calling in the unicorns…' },
    { emoji: '🌈', text: 'Finding the perfect rainbow…' },
    { emoji: '✨', text: 'Polishing every star…' },
    { emoji: '🧚', text: 'The fairies are drawing…' },
    { emoji: '🏰', text: 'Building the enchanted world…' },
    { emoji: '🐉', text: 'The dragon is painting…' },
    { emoji: '🌙', text: 'Almost ready for bedtime…' },
  ]

  const magicIndex = Math.min(genStep, MAGIC_MESSAGES.length - 1)
  const magic = MAGIC_MESSAGES[magicIndex]

  if (generating) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, padding: 32, background: 'var(--surface-0)', position: 'relative', overflow: 'hidden' }}>
        {/* Floating stars animation */}
        <style>{`
          @keyframes float1 { 0%,100%{transform:translate(0,0) rotate(0deg)} 50%{transform:translate(10px,-20px) rotate(180deg)} }
          @keyframes float2 { 0%,100%{transform:translate(0,0) rotate(0deg)} 50%{transform:translate(-15px,-15px) rotate(-180deg)} }
          @keyframes float3 { 0%,100%{transform:translate(0,0) rotate(0deg)} 50%{transform:translate(8px,-25px) rotate(270deg)} }
          @keyframes float4 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-10px,-10px) scale(1.3)} }
          @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
          @keyframes bounce { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
          @keyframes shimmer { 0%,100%{opacity:0.4} 50%{opacity:1} }
          @keyframes drift { 0%{transform:translateY(100vh) rotate(0deg);opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{transform:translateY(-20px) rotate(720deg);opacity:0} }
        `}</style>

        {/* Drifting background particles */}
        {['⭐','🌟','✨','💫','🌙','⭐','✨','🌟'].map((s, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${10 + i * 12}%`,
            fontSize: `${12 + (i % 3) * 6}px`,
            animation: `drift ${4 + i * 0.7}s ease-in-out ${i * 0.4}s infinite`,
            pointerEvents: 'none',
            opacity: 0
          }}>{s}</div>
        ))}

        {/* Main emoji */}
        <div style={{ fontSize: 72, marginBottom: 24, animation: 'bounce 1.5s ease-in-out infinite' }}>
          {magic.emoji}
        </div>

        {/* Magic message */}
        <p style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, textAlign: 'center' }}>
          {magic.text}
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 32, textAlign: 'center', maxWidth: 280 }}>
          {genDetail}
        </p>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 32 }}>
          {GEN_STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === genStep ? 24 : 8,
              height: 8, borderRadius: 4,
              background: i < genStep ? '#1D9E75' : i === genStep ? '#534AB7' : 'var(--border-strong)',
              transition: 'all 0.4s ease',
              animation: i === genStep ? 'shimmer 1s ease-in-out infinite' : undefined
            }} />
          ))}
        </div>

        {/* Step labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 300 }}>
          {GEN_STEPS.map((step, i) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: i > genStep ? 0.35 : 1, transition: 'opacity 0.4s' }}>
              <span style={{ fontSize: 16 }}>
                {i < genStep ? '✅' : i === genStep ? '⏳' : '⬜'}
              </span>
              <span style={{ fontSize: 13, color: i <= genStep ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: i === genStep ? 600 : 400 }}>
                {step}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ background: '#FCEBEB', border: '1px solid #F09595', borderRadius: 12, padding: '12px 16px', color: '#501313', fontSize: 13, maxWidth: 340, textAlign: 'center', marginTop: 24 }}>
            {error}
            <br/>
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
                <div
                  key={c.id}
                  onClick={() => toggleChar(c.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    padding: '12px 16px', borderRadius: 14, cursor: 'pointer', transition: 'all 0.15s',
                    border: `${sel ? '2px' : '0.5px'} solid ${sel ? '#534AB7' : 'var(--border)'}`,
                    background: sel ? '#EEEDFE' : 'var(--surface-card)',
                    minWidth: 80
                  }}
                >
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
          placeholder={`e.g. ${chosenChars.length > 0 ? chosenChars[0].name : 'Mia'} discovers a glowing turtle on a magical ocean adventure and must help it find its way home through an underwater cave…`}
          rows={3}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 12,
            border: '0.5px solid var(--border)', background: 'var(--surface-input)',
            fontFamily: 'inherit', fontSize: 14, color: 'var(--text-primary)',
            resize: 'none', lineHeight: 1.6, outline: 'none', transition: 'border-color 0.15s',
            boxSizing: 'border-box'
          }}
          onFocus={e => e.target.style.borderColor = '#534AB7'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {GENRES.map(g => (
            <button
              key={g}
              onClick={() => setGenre(g)}
              style={{
                padding: '6px 14px', borderRadius: 100, fontSize: 12, cursor: 'pointer',
                border: '0.5px solid', transition: 'all 0.15s',
                background: genre === g ? '#EEEDFE' : 'transparent',
                borderColor: genre === g ? '#534AB7' : 'var(--border-strong)',
                color: genre === g ? '#3C3489' : 'var(--text-secondary)',
                fontWeight: genre === g ? 600 : 400
              }}
            >
              {GENRE_EMOJI[g]} {g}
            </button>
          ))}
        </div>
      </section>

      <div style={{ height: '0.5px', background: 'var(--border)' }} />

      {/* Step 3: Visual style */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#534AB7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>3</div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Visual style</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {STYLES.map(s => (
            <div
              key={s.id}
              onClick={() => setStyle(s.id)}
              style={{
                padding: '14px 10px', borderRadius: 14, cursor: 'pointer', textAlign: 'center',
                border: `${style === s.id ? '2px' : '0.5px'} solid ${style === s.id ? '#534AB7' : 'var(--border)'}`,
                background: style === s.id ? '#EEEDFE' : 'var(--surface-card)',
                transition: 'all 0.15s'
              }}
            >
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
            <div
              key={l.id}
              onClick={() => setLength(l.id)}
              style={{
                flex: 1, padding: '12px 10px', borderRadius: 12, textAlign: 'center', cursor: 'pointer',
                border: `${length === l.id ? '2px' : '0.5px'} solid ${length === l.id ? '#534AB7' : 'var(--border)'}`,
                background: length === l.id ? '#EEEDFE' : 'var(--surface-card)',
                transition: 'all 0.15s'
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 600, color: length === l.id ? '#3C3489' : 'var(--text-primary)', marginBottom: 3 }}>{l.label}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <Button
        onClick={generate}
        disabled={!canGenerate}
        style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: 15, borderRadius: 14, marginTop: 4 }}
      >
        ✨ Generate story
      </Button>
    </div>
  )
}
