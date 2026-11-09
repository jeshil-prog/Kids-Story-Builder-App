import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useStore, usedThisMonthOf } from '../lib/store'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { Avatar, Button, SectionLabel, Spinner } from '../components/UI'
import { v4 as uuidv4 } from 'uuid'
import { LANGUAGES } from '../lib/languages'

const GENRES = ['Ocean','Cosy','Fantasy','Space','Jungle','Comedy','Adventure','Magic']
const GENRE_EMOJI = { Ocean:'🌊', Cosy:'🌙', Fantasy:'🧙', Space:'🚀', Jungle:'🦁', Comedy:'😄', Adventure:'⚗️', Magic:'✨' }
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

// Must match TIER_CHARACTER_LIMITS in Characters.jsx. Only decides what to show.
const CHARACTER_LIMITS = { free: 2, tier1: 6, tier2: Infinity }
const TIER_NAMES = { free: 'Free', tier1: 'Tier 1', tier2: 'Tier 2' }

// Pictures added for a story (Tier 2). Each is shrunk so it is quick to send.
const MAX_PICTURES = 10
function shrinkPicture(file, maxSide = 768, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode'))
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        resolve({ id: Math.random().toString(36).slice(2), dataUrl, base64: dataUrl.split(',')[1], mime: 'image/jpeg' })
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

const GEN_STEPS = [
  'Writing your story',
  'Splitting into scenes',
  'Sending scenes off to be illustrated',
]

export default function Create() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { characters, stories, saveStory, getStory } = useStore()
  const [selectedChars, setSelectedChars] = useState([])
  const [prompt, setPrompt] = useState('')
  const [genre, setGenre] = useState('Fantasy')
  const [style, setStyle] = useState('Pixar-like')
  const [length, setLength] = useState('story')
  // The language is remembered between visits. Storage can be blocked, so it is wrapped.
  const [language, setLanguage] = useState(() => {
    try {
      const saved = localStorage.getItem('sd_language')
      return LANGUAGES.some(l => l.code === saved) ? saved : 'en'
    } catch { return 'en' }
  })
  const chooseLanguage = (code) => {
    setLanguage(code)
    try { localStorage.setItem('sd_language', code) } catch {}
  }
  const [toBeContinued, setToBeContinued] = useState(false)
  // Set once someone presses Generate while something is still missing, so the
  // missing parts can be pointed out.
  const [showMissing, setShowMissing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genStep, setGenStep] = useState(0)
  const [genDetail, setGenDetail] = useState('')
  const [error, setError] = useState(null)
  const [limitReached, setLimitReached] = useState(false)
  const [tier, setTier] = useState('free')
  // Pictures to build the story around (Tier 2). Held in memory only.
  const [pictures, setPictures] = useState([])
  const [pictureError, setPictureError] = useState(null)
  const pictureInput = useRef(null)
  // Set when the server says even the one page previews are used up.
  const [hardBlocked, setHardBlocked] = useState(false)

  useEffect(() => {
    supabase.from('subscriptions').select('tier, status').eq('user_id', user.id).single()
      .then(({ data }) => setTier(data?.status === 'active' ? (data.tier || 'free') : 'free'))
  }, [user.id])

  const [searchParams, setSearchParams] = useSearchParams()
  const [showCharUpgrade, setShowCharUpgrade] = useState(false)
  const autoselectDone = useRef(false)

  // After adding a character on the Characters page, come back here with that
  // new character already ticked, so there's nothing extra to do.
  useEffect(() => {
    if (autoselectDone.current || searchParams.get('autoselect') !== 'new') return
    const newest = characters.find(c => c.ownerId === user.id)
    if (!newest) return
    autoselectDone.current = true
    setSelectedChars(s => s.includes(newest.id) ? s : [...s, newest.id])
    setSearchParams({}, { replace: true })
  }, [characters, searchParams, user.id, setSearchParams])

  // Continuing an earlier story: /create?continue=<story id>. The new chapter
  // keeps the same characters, art style, genre and language as that story.
  const continueId = searchParams.get('continue')
  const [previousStory, setPreviousStory] = useState(null)
  const [previousLoading, setPreviousLoading] = useState(!!continueId)
  useEffect(() => {
    if (!continueId) { setPreviousStory(null); setPreviousLoading(false); return }
    let cancelled = false
    setPreviousLoading(true)
    getStory(continueId).then((s) => {
      if (cancelled) return
      setPreviousStory(s && s.ownerId === user.id ? s : null)
      setPreviousLoading(false)
    })
    return () => { cancelled = true }
  }, [continueId, user.id])

  const characterLimit = CHARACTER_LIMITS[tier] ?? CHARACTER_LIMITS.free
  const ownCharacterCount = characters.filter(c => c.ownerId === user.id).length
  const atCharLimit = ownCharacterCount >= characterLimit
  const onNewCharacter = () => {
    if (atCharLimit) setShowCharUpgrade(true)
    else navigate('/characters?new=1')
  }

  const storyLimit = TIER_LIMITS[tier] ?? TIER_LIMITS.free
  // Counted from the stories already loaded, the same way the server counts them.
  const usedThisMonth = usedThisMonthOf(stories)
  const atLimit = usedThisMonth >= storyLimit
  const storiesLeft = Math.max(0, storyLimit - usedThisMonth)
  const resetLabel = (() => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
      .toLocaleDateString('en-AU', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  })()

  // Free tier only gets the first two styles — the rest are visible but
  // locked, with an upgrade prompt, rather than hidden entirely.
  const CORE_STYLE_IDS = ['Watercolour', 'Pixar-like']
  const styleLocked = (styleId) => tier === 'free' && !CORE_STYLE_IDS.includes(styleId)

  const addPictures = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return
    setPictureError(null)
    const room = MAX_PICTURES - pictures.length
    if (files.length > room) setPictureError(`You can add up to ${MAX_PICTURES} pictures.`)
    try {
      const added = await Promise.all(files.slice(0, Math.max(0, room)).map(f => shrinkPicture(f)))
      setPictures(prev => [...prev, ...added])
    } catch {
      setPictureError('One of those pictures could not be read. Try a different one.')
    }
  }
  const removePicture = (id) => setPictures(prev => prev.filter(p => p.id !== id))
  const hasPictures = pictures.length > 0

  const toggleChar = (id) => setSelectedChars(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const continuing = !!previousStory
  const chosenChars = continuing ? (previousStory.characters || []) : characters.filter(c => selectedChars.includes(c.id))
  const effectiveStyle = continuing ? (previousStory.style || style) : style
  const effectiveGenre = continuing ? (previousStory.genre || genre) : genre
  const effectiveLanguage = continuing ? (previousStory.language || 'en') : language

  // Everything that is still needed before a story can be made, so the
  // button can say so instead of just looking switched off.
  const needsCharacters = !continuing && chosenChars.length === 0
  const needsIdea = !continuing && !hasPictures && prompt.trim().length <= 5
  const missingKeys = [needsCharacters && 'characters', needsIdea && 'prompt'].filter(Boolean)
  const canGenerate = missingKeys.length === 0 && !hardBlocked
  const highlight = (key) => (showMissing && missingKeys.includes(key))
    ? { outline: '2px solid #E24B4A', outlineOffset: 8, borderRadius: 12 }
    : null
  const onGenerateClick = () => {
    if (hardBlocked) return
    if (missingKeys.length > 0) {
      setShowMissing(true)
      document.getElementById(`create-${missingKeys[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    generate()
  }

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
          prompt, genre: effectiveGenre, style: effectiveStyle, length,
          language: effectiveLanguage,
          toBeContinued,
          images: hasPictures ? pictures.map(p => ({ base64: p.base64, mime: p.mime })) : undefined,
          previous: continuing ? {
            title: previousStory.title,
            chapterNumber: previousStory.chapterNumber || 1,
            text: (previousStory.scenes || []).map(sc => sc.narration).filter(Boolean).join(' ')
          } : null
        })
      })
      if (!storyRes.ok) {
        const errBody = await storyRes.json().catch(() => ({}))
        if (errBody.limitReached) {
          // Even the one page previews are used up. Go back to the form, which
          // now says so, instead of leaving a half-finished loading screen.
          setHardBlocked(true)
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
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
            body: JSON.stringify({
              sceneImage: hasPictures && pictures[i] ? { base64: pictures[i].base64, mime: pictures[i].mime } : undefined,
              imagePrompt: scene.imagePrompt,
              style: effectiveStyle,
              language: effectiveLanguage,
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
        genre: effectiveGenre, style: effectiveStyle, length,
        language: effectiveLanguage,
        toBeContinued,
        chapterNumber: continuing ? (previousStory.chapterNumber || 1) + 1 : 1,
        continuesStoryId: continuing ? previousStory.id : null,
        characters: chosenChars,
        scenes: story.scenes,
        // A new story is a draft until the person saves it to their library.
        inLibrary: false,
        // Over the monthly limit: only the first page was made (the paywall comes next).
        paywalled: story.paywalled === true,
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
    { emoji: '🌙', text: 'Almost ready…' },
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
              <Link to="/profile?tab=plan" style={{ color: '#534AB7', fontSize: 13, fontWeight: 600, display: 'inline-block', marginTop: 8 }}>
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

  if (continueId && previousLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <Spinner />
      </div>
    )
  }
  if (continueId && !previousStory) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40, textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>We could not find that story</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>You can only continue stories from your own library.</p>
        <button onClick={() => navigate('/create', { replace: true })} style={{ color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>Start a new story</button>
      </div>
    )
  }

  const ideaPlaceholder = `e.g. ${chosenChars.length > 0 ? chosenChars[0].name : 'Mia'} discovers a glowing turtle on a magical ocean adventure and must help it find its way home through an underwater cave…`

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div style={{ marginBottom: -12 }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>← Home</button>
      </div>
      {continuing && (
        <div style={{ background: '#EEEDFE', border: '1px solid #C9C5F4', borderRadius: 14, padding: '14px 16px' }}>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#534AB7', margin: '0 0 4px 0' }}>
            Chapter {(previousStory.chapterNumber || 1) + 1}
          </p>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#3C3489', margin: '0 0 6px 0' }}>Continuing "{previousStory.title}"</p>
          <p style={{ fontSize: 13, color: '#4B4590', margin: '0 0 8px 0', lineHeight: 1.5 }}>
            Same characters, art style and language as the last chapter. Say what should happen next, or leave it blank and we will surprise you.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {chosenChars.map(c => (
              <span key={c.id || c.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', borderRadius: 100, padding: '3px 10px 3px 3px', fontSize: 12, color: '#3C3489' }}>
                <Avatar name={c.name} photo={c.photoUrl || c.photo} size={22} />{c.name}
              </span>
            ))}
            <button onClick={() => navigate('/create', { replace: true })} style={{ background: 'none', border: 'none', color: '#534AB7', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Start a new story instead</button>
          </div>
        </div>
      )}

      {(atLimit || hardBlocked) && (
        <div style={{ background: '#FFF6E5', border: '1px solid #F2C879', borderRadius: 14, padding: '16px 18px' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#5A3A00', margin: '0 0 6px 0' }}>
            {tier === 'free'
              ? `You've used all ${storyLimit} free stories this month`
              : `You've used all ${storyLimit} stories in your plan this month`}
          </p>
          <p style={{ fontSize: 13, color: '#7A5400', margin: '0 0 10px 0', lineHeight: 1.5 }}>
            {hardBlocked
              ? `You have also used all your previews. Your stories reset on ${resetLabel}.${tier !== 'tier2' ? ' Upgrade to keep creating now.' : ''}`
              : `You can still start a story and read its first page. To keep reading, upgrade${tier === 'tier2' ? ' or wait until your stories reset' : ''}. Your stories reset on ${resetLabel}.`}
          </p>
          {tier !== 'tier2' && (
            <Link to="/profile?tab=plan" style={{ display: 'inline-block', background: '#534AB7', color: 'white', fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 100, textDecoration: 'none' }}>
              View plans
            </Link>
          )}
        </div>
      )}

      {/* Step 1: Characters */}
      {!continuing && (
      <>
      <section id="create-characters" style={highlight('characters') || undefined}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#534AB7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>1</div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Choose characters</h2>
          <span style={{ fontSize: 11, color: needsCharacters && showMissing ? '#E24B4A' : 'var(--text-muted)', fontWeight: needsCharacters && showMissing ? 600 : 400 }}>
            {needsCharacters && showMissing ? 'Required: pick at least one' : 'Required'}
          </span>
        </div>
        {characters.length === 0 ? (
          <div style={{ padding: '20px', background: 'var(--surface-card)', border: '0.5px dashed var(--border-strong)', borderRadius: 14, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>You haven't added any characters yet.</p>
            <button onClick={() => navigate('/characters?new=1')} style={{ fontSize: 13, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer' }}>+ Add characters →</button>
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
            {/* Always offered. At the plan's character limit, it explains how to get more instead. */}
            <div
              onClick={onNewCharacter}
              role="button"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px 16px', borderRadius: 14, cursor: 'pointer', minWidth: 80,
                border: `1px dashed ${showCharUpgrade ? '#534AB7' : 'var(--border-strong)'}`,
                background: 'transparent'
              }}
            >
              <div style={{ width: 44, height: 44, borderRadius: '50%', border: '1px dashed var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#534AB7' }}>+</div>
              <span style={{ fontSize: 12, color: '#534AB7', fontWeight: 600 }}>New character</span>
            </div>
          </div>
        )}
        {atCharLimit && showCharUpgrade && (
          <div style={{ marginTop: 14, background: '#EEEDFE', border: '1px solid #C9C5F4', borderRadius: 14, padding: '14px 16px' }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#3C3489', margin: '0 0 4px 0' }}>
              Upgrade to add more characters
            </p>
            <p style={{ fontSize: 13, color: '#4B4590', margin: '0 0 10px 0', lineHeight: 1.5 }}>
              You've used all {characterLimit} characters on the {TIER_NAMES[tier]} plan.
              {tier === 'free' ? ' Tier 1 lets you have 6, and Tier 2 has no limit.' : ' Tier 2 has no limit.'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Link to="/profile?tab=plan" style={{ display: 'inline-block', background: '#534AB7', color: 'white', fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 100, textDecoration: 'none' }}>
                View plans
              </Link>
              <button onClick={() => setShowCharUpgrade(false)} style={{ background: 'none', border: 'none', color: '#4B4590', fontSize: 13, cursor: 'pointer' }}>Not now</button>
            </div>
          </div>
        )}
      </section>

      <div style={{ height: '0.5px', background: 'var(--border)' }} />
      </>
      )}

      {/* Step 2: Prompt */}
      <section id="create-prompt" style={highlight('prompt') || undefined}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#534AB7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{continuing ? 1 : 2}</div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{continuing ? 'What happens next?' : "What's the story about?"}</h2>
          <span style={{ fontSize: 11, color: needsIdea && showMissing ? '#E24B4A' : 'var(--text-muted)', fontWeight: needsIdea && showMissing ? 600 : 400 }}>
            {continuing ? 'Optional' : needsIdea && showMissing ? 'Required: a few words' : 'Required'}
          </span>
        </div>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={continuing ? 'e.g. They follow the glowing footprints into the forest and meet a talking owl…' : ideaPlaceholder}
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
        {!continuing && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
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
        </div>}

        {/* Pictures to build the story around (Tier 2) */}
        <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 14, background: 'var(--surface-card)', border: '0.5px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
              🖼️ Add your own pictures
              <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 8, padding: '2px 8px', borderRadius: 100, background: '#EEEDFE', color: '#534AB7' }}>Tier 2</span>
            </p>
            {tier === 'tier2' && (
              <button onClick={() => pictureInput.current?.click()} disabled={pictures.length >= MAX_PICTURES} style={{ fontSize: 13, fontWeight: 600, color: '#534AB7', background: 'none', border: '1px solid #534AB7', borderRadius: 100, padding: '6px 14px', cursor: 'pointer', opacity: pictures.length >= MAX_PICTURES ? 0.5 : 1 }}>
                + Add pictures
              </button>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
            Each picture becomes one page of the story, redrawn in your chosen art style. Your original pictures are not kept.
          </p>
          {tier !== 'tier2' && (
            <p style={{ fontSize: 12, margin: '8px 0 0' }}>
              🔒 <Link to="/profile?tab=plan" style={{ color: '#534AB7' }}>Upgrade to Tier 2</Link> to make a story from your own pictures.
            </p>
          )}
          <input ref={pictureInput} type="file" accept="image/*" multiple onChange={addPictures} style={{ display: 'none' }} />
          {pictureError && <p style={{ fontSize: 12, color: '#E24B4A', margin: '8px 0 0' }}>{pictureError}</p>}
          {hasPictures && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                {pictures.map((pic, i) => (
                  <div key={pic.id} style={{ position: 'relative', width: 84 }}>
                    <img src={pic.dataUrl} alt={`Page ${i + 1}`} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10, display: 'block', border: '0.5px solid var(--border)' }} />
                    <button onClick={() => removePicture(pic.id)} aria-label={`Remove picture ${i + 1}`} style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#3C3489', color: 'white', fontSize: 12, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0', textAlign: 'center' }}>Page {i + 1}</p>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 0' }}>
                Your story will have {pictures.length} {pictures.length === 1 ? 'page' : 'pages'}. Telling us what it is about is optional.
              </p>
            </>
          )}
        </div>
      </section>

      <div style={{ height: '0.5px', background: 'var(--border)' }} />

      {/* Step 3: Visual style (kept from the earlier chapter when continuing) */}
      {!continuing && (
      <>
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
            🔒 More styles available on <Link to="/profile?tab=plan" style={{ color: '#534AB7' }}>paid plans</Link>
          </p>
        )}
      </section>

      <div style={{ height: '0.5px', background: 'var(--border)' }} />
      </>
      )}

      {/* Step 4: Length */}
      {!hasPictures && <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#534AB7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{continuing ? 2 : 4}</div>
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
      </section>}

      {/* Language (a continued story keeps its own language) */}
      {!continuing && (
      <>
      <div style={{ height: '0.5px', background: 'var(--border)' }} />
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#534AB7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>5</div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Language</h2>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => chooseLanguage(l.code)}
              aria-pressed={language === l.code}
              style={{
                padding: '8px 16px', borderRadius: 100, fontSize: 13, cursor: 'pointer',
                border: '0.5px solid', transition: 'all 0.15s',
                background: language === l.code ? '#EEEDFE' : 'transparent',
                borderColor: language === l.code ? '#534AB7' : 'var(--border-strong)',
                color: language === l.code ? '#3C3489' : 'var(--text-secondary)',
                fontWeight: language === l.code ? 600 : 400
              }}
            >
              {l.native}{l.native !== l.name ? ` · ${l.name}` : ''}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0 0' }}>The story is written and read aloud in this language.</p>
      </section>
      </>
      )}

      {/* Ending */}
      <div style={{ height: '0.5px', background: 'var(--border)' }} />
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#534AB7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{continuing ? 3 : 6}</div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Ending</h2>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { value: false, label: continuing ? 'Finish the story' : 'Happy ending', desc: continuing ? 'Wrap everything up' : 'A complete story' },
            { value: true, label: 'To be continued…', desc: 'A cliffhanger, then continue later' },
          ].map(o => (
            <div
              key={String(o.value)}
              onClick={() => setToBeContinued(o.value)}
              role="button"
              aria-pressed={toBeContinued === o.value}
              style={{
                flex: 1, padding: '12px 10px', borderRadius: 12, textAlign: 'center', cursor: 'pointer',
                border: `${toBeContinued === o.value ? '2px' : '0.5px'} solid ${toBeContinued === o.value ? '#534AB7' : 'var(--border)'}`,
                background: toBeContinued === o.value ? '#EEEDFE' : 'var(--surface-card)',
                transition: 'all 0.15s'
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 600, color: toBeContinued === o.value ? '#3C3489' : 'var(--text-primary)', marginBottom: 3 }}>{o.label}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{o.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {!atLimit && (tier === 'free' || storiesLeft <= 3) && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: '0 0 -12px 0' }}>
          {storiesLeft === 1
            ? `Last story this month on your plan`
            : `${storiesLeft} of ${storyLimit} stories left this month`}
        </p>
      )}
      {/* What is still needed, shown while anything is missing */}
      {missingKeys.length > 0 && (
        <div style={{ background: 'var(--surface-card)', border: `0.5px solid ${showMissing ? '#E24B4A' : 'var(--border)'}`, borderRadius: 12, padding: '12px 14px', marginBottom: -8 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>ⓘ To create your story you need to:</p>
          {[
            { key: 'characters', text: 'Choose at least one character', done: !needsCharacters },
            { key: 'prompt', text: 'Say what the story is about (a few words is enough)', done: !needsIdea },
          ].map(item => (
            <p key={item.key} style={{ fontSize: 13, margin: '3px 0', color: item.done ? '#1D9E75' : 'var(--text-primary)' }}>
              {item.done ? '✓' : '○'} {item.text}
            </p>
          ))}
        </div>
      )}
      <Button
        onClick={onGenerateClick}
        disabled={hardBlocked}
        style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: 15, borderRadius: 14, marginTop: 4, opacity: hardBlocked ? 0.5 : (canGenerate ? 1 : 0.6) }}
      >
        {hardBlocked ? 'Monthly limit reached' : atLimit ? '✨ Start a story (first page)' : continuing ? '✨ Write the next chapter' : '✨ Generate story'}
      </Button>
    </div>
  )
}
