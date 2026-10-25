import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
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

// Must match TIER_LIMITS in api/generate-story.js (which is what actually
// enforces the limit). This copy only decides what to SHOW the person.
const TIER_LIMITS = { free: 3, tier1: 25, tier2: 200 }

const GEN_STEPS = [
  'Writing your story',
  'Splitting into scenes',
  'Sending scenes off to be illustrated',
]

export default function Create() {
  const navigate = useNavigate()
  const { user } = useAuth()
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
  const [limitReached, setLimitReached] = useState(false)
  const [tier, setTier] = useState('free')
  // How many stories this person has made this month. null while loading,
  // or if it couldn't be checked (then nothing is blocked up front, and the
  // server still enforces the limit as the final safety net).
  const [usedThisMonth, setUsedThisMonth] = useState(null)

  useEffect(() => {
    supabase.from('subscriptions').select('tier, status').eq('user_id', user.id).single()
      .then(({ data }) => setTier(data?.status === 'active' ? (data.tier || 'free') : 'free'))
  }, [user.id])

  // Counted the same way the server counts: this person's stories created
  // since the start of the current month (UTC, like the server).
  useEffect(() => {
    const now = new Date()
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    supabase.from('stories').select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id).gte('created_at', startOfMonth.toISOString())
      .then(({ count, error: countErr }) => { if (!countErr && typeof count === 'number') setUsedThisMonth(count) })
  }, [user.id])

  const storyLimit = TIER_LIMITS[tier] ?? TIER_LIMITS.free
  const atLimit = usedThisMonth !== null && usedThisMonth >= storyLimit
  const storiesLeft = usedThisMonth === null ? null : Math.max(0, storyLimit - usedThisMonth)
  const resetLabel = (() => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
      .toLocaleDateString('en-AU', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  })()

  // Free tier only gets the first two styles — the rest are visible but
  // locked, with an upgrade prompt, rather than hidden entirely.
  const CORE_STYLE_IDS = ['Watercolour', 'Pixar-like']
  const styleLocked = (styleId) => tier === 'free' && !CORE_STYLE_IDS.includes(styleId)

  const toggleChar = (id) => setSelectedChars(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const chosenChars = characters.filter(c => selectedChars.includes(c.id))
  const canGenerate = chosenChars.length > 0 && prompt.trim().length > 5 && !atLimit

  const generate = async () => {
    setGenerating(true)
    setError(null)
    setLimitReached(false)
    setGenStep(0)
    setGenDetail('Sending your story to the writer…')

    try {
      const { data: { session } } = await supabase.auth.getSession()

      // Step 1: Generate story text + scene breakdown
      setGenStep(0)
      setGenDetail('Dreaming up your story…')
      const storyRes = await fetch('/api/generate-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          characters: chosenChars.map(c => ({ name: c.name, age: c.age, personality: c.personality, role: c.role })),
          prompt, genre, style, length
        })
      })
      if (!storyRes.ok) {
        const errBody = await storyRes.json().catch(() => ({}))
        if (errBody.limitReached) {
          // The count shown on the form was out of date (for example, a story
          // was made on another device). Go back to the form, which now shows
          // the limit notice, instead of leaving a half-finished loading screen.
          setUsedThisMonth(prev => Math.max(prev ?? 0, storyLimit))
          setGenerating(false)
          return
        }
        throw new Error(errBody.error || 'Story generation failed. Check your API keys.')
      }
      const story = await storyRes.json()

      setGenStep(1)
      setGenDetail(`The magic is beginning… ${story.scenes.length} scenes to illustrate!`)

      const id = uuidv4()

      // Step 2: Submit all scene image jobs (async — each returns almost
      // instantly, actual generation finishes later via OpenAI's webhook).
      //
      // The first 5 scenes fire immediately, with NO delay — that's exactly
      // OpenAI's confirmed, tested-safe limit (5/min on input-image
      // requests), so there's no rate-limit risk in firing them all at once.
      // Staggering ALL scenes uniformly (an earlier version of this fix)
      // meant scene 1's job didn't even start until 15s in — but scene 0's
      // narration only takes ~15-20s to read, so the reader would catch up
      // to a scene whose generation had barely begun. Only scenes beyond
      // the confirmed-safe batch actually need to wait, so only those are
      // staggered, starting a full minute out to clear the first window.
      //
      // This does NOT delay navigation — setTimeout only staggers the
      // background fetch calls themselves; the reader still opens instantly
      // once the text is ready, exactly as before.
      setGenStep(2)
      setGenDetail('Sending your scenes off to be illustrated…')

      const RATE_LIMIT_BATCH_SIZE = 5 // OpenAI's confirmed, tested-safe limit
      const STAGGER_MS = 15000
      const charPayload = chosenChars.map(c => ({ name: c.name, photoBase64: c.photoBase64 || null, photoUrl: c.photoUrl || null, photoMime: c.photoMime || 'image/jpeg', description: c.description || null }))
      story.scenes.forEach((scene, i) => {
        const delay = i < RATE_LIMIT_BATCH_SIZE
          ? 0
          : 60000 + (i - RATE_LIMIT_BATCH_SIZE) * STAGGER_MS
        setTimeout(() => {
          fetch('/api/submit-image-job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imagePrompt: scene.imagePrompt,
              style,
              storyId: id,
              sceneIndex: i,
              characters: charPayload,
              narrationText: scene.narration
            })
          }).catch((err) => console.error(`Scene ${i} submission failed:`, err))
        }, delay)
      })

      const fullStory = {
        id, title: story.title, tagline: story.tagline,
        genre, style, length,
        characters: chosenChars,
        scenes: story.scenes,
        createdAt: Date.now()
      }
      saveStory(fullStory).catch((err) => console.error('Background story save failed:', err))
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
            {limitReached && (
              <Link to="/profile" style={{ color: '#534AB7', fontSize: 13, fontWeight: 600, display: 'inline-block', marginTop: 8 }}>
                View plans →
              </Link>
            )}
            <br/>
            <button onClick={() => { setGenerating(false); setError(null); setLimitReached(false) }} style={{ marginTop: 8, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>Go back</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 28 }}>
      {atLimit && (
        <div style={{ background: '#FFF6E5', border: '1px solid #F2C879', borderRadius: 14, padding: '16px 18px' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#5A3A00', margin: '0 0 6px 0' }}>
            {tier === 'free'
              ? `You've used all ${storyLimit} free stories this month`
              : `You've used all ${storyLimit} stories in your plan this month`}
          </p>
          <p style={{ fontSize: 13, color: '#7A5400', margin: '0 0 10px 0', lineHeight: 1.5 }}>
            Your stories reset on {resetLabel}.{tier !== 'tier2' && ' Upgrade to keep creating now.'}
          </p>
          {tier !== 'tier2' && (
            <Link to="/profile" style={{ display: 'inline-block', background: '#534AB7', color: 'white', fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 100, textDecoration: 'none' }}>
              View plans
            </Link>
          )}
        </div>
      )}

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
                  <Avatar name={c.name} photo={c.photoUrl || c.photo} size={44} />
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
          {STYLES.map(s => {
            const locked = styleLocked(s.id)
            return (
              <div
                key={s.id}
                onClick={() => !locked && setStyle(s.id)}
                style={{
                  padding: '14px 10px', borderRadius: 14, cursor: locked ? 'not-allowed' : 'pointer', textAlign: 'center',
                  border: `${style === s.id ? '2px' : '0.5px'} solid ${style === s.id ? '#534AB7' : 'var(--border)'}`,
                  background: style === s.id ? '#EEEDFE' : 'var(--surface-card)',
                  opacity: locked ? 0.45 : 1,
                  position: 'relative',
                  transition: 'all 0.15s'
                }}
              >
                {locked && <div style={{ position: 'absolute', top: 6, right: 8, fontSize: 11 }}>🔒</div>}
                <div style={{ fontSize: 26, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: style === s.id ? '#3C3489' : 'var(--text-secondary)' }}>{s.id}</div>
              </div>
            )
          })}
        </div>
        {tier === 'free' && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            🔒 More styles available on <Link to="/profile" style={{ color: '#534AB7' }}>paid plans</Link>
          </p>
        )}
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

      {!atLimit && storiesLeft !== null && (tier === 'free' || storiesLeft <= 3) && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: '0 0 -12px 0' }}>
          {storiesLeft === 1
            ? `Last story this month on your plan`
            : `${storiesLeft} of ${storyLimit} stories left this month`}
        </p>
      )}
      <Button
        onClick={generate}
        disabled={!canGenerate}
        style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: 15, borderRadius: 14, marginTop: 4 }}
      >
        {atLimit ? 'Monthly limit reached' : '✨ Generate story'}
      </Button>
    </div>
  )
}
