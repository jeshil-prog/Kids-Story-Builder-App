import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { playSfx, buildSfxTimeline, stopAmbientSfx } from '../lib/sfx'

const STYLE_PROMPTS = {
  'Watercolour': "soft watercolour children's book illustration, painterly, gentle colours,",
  'Pixar-like': 'Pixar 3D animation style, warm cinematic lighting, expressive cute characters, highly detailed,',
  'Storybook': "classic storybook illustration, detailed, warm, hand-painted, fairy tale style,",
  'Comic book': 'bold comic book illustration, clean linework, bright vivid colours, dynamic composition,',
  'Anime': 'Studio Ghibli anime style, detailed painterly backgrounds, soft lighting, expressive characters,',
  'Claymation': 'claymation stop-motion style, tactile textures, warm whimsical, colourful,'
}

export default function StoryPlayer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getStory, saveStory } = useStore()
  const [story, setStory] = useState(null)
  const [scene, setScene] = useState(0)
  const [projector, setProjector] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [loadingAudio, setLoadingAudio] = useState(false)
  const [generatingImages, setGeneratingImages] = useState(false)
  const [imageProgress, setImageProgress] = useState(0)
  const audioRef = useRef(null)
  const autoAdvanceRef = useRef(null)
  const imageGenRef = useRef(false)

  // Load story on mount
  useEffect(() => {
    const s = getStory(id)
    setStory(s)
    if (s?.imagesGenerating) {
      startImageGeneration(s)
    }
  }, [id])

  const startImageGeneration = async (s) => {
    if (imageGenRef.current) return
    imageGenRef.current = true
    setGeneratingImages(true)

    const scenes = [...s.scenes]
    const total = scenes.length

    // Get character photo URL from first character (if available)
    const characterPhotoUrl = s.characters?.[0]?.photoUrl || null

    for (let i = 0; i < total; i++) {
      setImageProgress(i)
      try {
        // Call Bedrock via server API (AWS credentials stay server-side)
        const stylePrefix = {
          'Watercolour': "soft watercolour children's book illustration, painterly,",
          'Pixar-like': 'Pixar 3D animation style, warm cinematic lighting, expressive,',
          'Storybook': "classic storybook illustration, hand-painted, warm,",
          'Comic book': 'bold comic book illustration, clean linework, vivid colours,',
          'Anime': 'Studio Ghibli anime style, detailed painterly backgrounds,',
          'Claymation': 'claymation stop-motion style, tactile textures, whimsical,'
        }
        const charDesc = s.characters?.map(c => {
          const parts = [c.name]
          if (c.age) parts.push(`age ${c.age}`)
          if (c.description) parts.push(c.description)
          return parts.join(', ')
        }).join(' | ') || ''

        const imgRes = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imagePrompt: scenes[i].imagePrompt || 'magical storybook scene',
            style: s.style,
            characterDescriptions: charDesc
          })
        })

        let b64 = null
        if (imgRes.ok) {
          const data = await imgRes.json()
          b64 = data.b64
        } else {
          console.error(`Scene ${i+1} failed:`, imgRes.status, await imgRes.text())
        }

        if (b64) {
          scenes[i] = { ...scenes[i], imageData: b64, imageType: 'image/jpeg' }
          setStory(prev => ({
            ...prev,
            scenes: prev.scenes.map((sc, idx) => idx === i ? { ...sc, imageData: b64, imageType: 'image/jpeg' } : sc)
          }))
          try {
            localStorage.setItem(`sd_img_${id}_${i}`, JSON.stringify({ imageData: b64, imageType: 'image/jpeg' }))
          } catch {}
        }
      } catch (err) {
        console.error(`Scene ${i+1} error:`, err)
      }
    }

    setImageProgress(total)
    setGeneratingImages(false)
    const updated = { ...s, scenes, imagesGenerating: false }
    saveStory(updated)
  }

  const stopAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    clearTimeout(autoAdvanceRef.current)
    setSpeaking(false)
    setLoadingAudio(false)
  }, [])

  const scenes = story?.scenes || []
  const current = scenes[scene]

  const goNext = useCallback(() => {
    stopAudio()
    if (scene < scenes.length - 1) setScene(s => s + 1)
  }, [scene, scenes.length, stopAudio])

  const goPrev = useCallback(() => {
    stopAudio()
    setScene(s => Math.max(0, s - 1))
  }, [stopAudio])

  const playNarration = useCallback(async () => {
    if (speaking || loadingAudio || !current?.narration) return
    const openAiKey = import.meta.env.VITE_OPENAI_API_KEY

    if (openAiKey) {
      setLoadingAudio(true)
      try {
        const res = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAiKey}` },
          body: JSON.stringify({ model: 'tts-1', input: current.narration, voice: 'nova', speed: 0.9 })
        })
        if (res.ok) {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const audio = new Audio(url)
          audioRef.current = audio
          setLoadingAudio(false)
          setSpeaking(true)
          audio.play()
          audio.onended = () => { setSpeaking(false); autoAdvanceRef.current = setTimeout(goNext, 1500) }
          audio.onerror = () => { setSpeaking(false); setLoadingAudio(false) }
          return
        }
      } catch {}
      setLoadingAudio(false)
    }

    // Fallback to browser TTS with SFX word boundary triggers
    if (window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(current.narration)
      u.rate = 0.88; u.pitch = 1.05

      // Build SFX timeline from scene cues
      const sfxTimeline = buildSfxTimeline(current.narration, current.sfxCues)
      let sfxIdx = 0

      // Time-based SFX — fire sounds at estimated word times
      // Average speaking rate ~2.5 words/second at rate 0.88
      const wordsPerSecond = 2.5 * 0.88
      const sfxTimers = []
      sfxTimeline.forEach(cue => {
        const delayMs = (cue.wordIndex / wordsPerSecond) * 1000
        const timer = setTimeout(() => playSfx(cue.sound), delayMs)
        sfxTimers.push(timer)
      })

      u.onend = () => {
        sfxTimers.forEach(t => clearTimeout(t))
        setSpeaking(false)
        autoAdvanceRef.current = setTimeout(goNext, 1500)
      }
      u.onerror = () => {
        sfxTimers.forEach(t => clearTimeout(t))
        setSpeaking(false)
      }
      setSpeaking(true)
      window.speechSynthesis.speak(u)
    }
  }, [current, speaking, loadingAudio, goNext])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === ' ') { e.preventDefault(); speaking ? stopAudio() : playNarration() }
      if (e.key === 'Escape') setProjector(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev, speaking, stopAudio, playNarration])

  // Stop all audio on unmount
  useEffect(() => {
    return () => {
      stopAudio()
      stopAmbientSfx()
    }
  }, [stopAudio])

  if (!story) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 40 }}>
      <p style={{ fontSize: 28 }}>📖</p>
      <p style={{ fontSize: 16, color: 'var(--text-muted)' }}>Story not found.</p>
      <button onClick={() => navigate('/')} style={{ color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>← Back home</button>
    </div>
  )

  const progress = ((scene + 1) / scenes.length) * 100
  const imagesReady = imageProgress

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', background: '#0d0b1a',
      ...(projector ? { position: 'fixed', inset: 0, zIndex: 9999 } : {})
    }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)' }}>
        {!projector && (
          <button onClick={() => { stopAudio(); navigate(-1) }} style={{ background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.7)', padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
            ← Back
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.title}</p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            {story.genre} · {story.style}
            {generatingImages && ` · 🎨 Illustrating ${imagesReady}/${scenes.length}…`}
          </p>
        </div>
        <button onClick={() => { stopAudio(); setProjector(p => !p) }} style={{ background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.7)', padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
          {projector ? '⊠ Exit' : '⊡ Fullscreen'}
        </button>
      </div>

      {/* Story progress bar */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: '#7F77DD', transition: 'width 0.4s' }} />
      </div>

      {/* Scene */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: projector ? '32px' : '16px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: projector ? 800 : 540, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 24, overflow: 'hidden' }}>

          {/* Image area */}
          <div style={{ width: '100%', aspectRatio: '1/1', background: '#1a1830', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
            {current?.imageData ? (
              <img
                key={`${scene}-${current.imageData?.slice(0,10)}`}
                src={`data:${current.imageType || 'image/png'};base64,${current.imageData}`}
                alt={`Scene ${scene + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', animation: 'fadeIn 0.6s ease' }}
              />
            ) : (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)' }}>
                {generatingImages && scene >= imagesReady ? (
                  <>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#7F77DD', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 13 }}>Illustrating scene {scene + 1}…</p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 36, marginBottom: 8 }}>🎨</p>
                    <p style={{ fontSize: 13 }}>Scene {scene + 1}</p>
                  </>
                )}
              </div>
            )}
            <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', borderRadius: 100, padding: '3px 12px', fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>
              {current?.chapter}
            </div>
          </div>

          {/* Narration */}
          <div style={{ padding: projector ? '24px 28px 8px' : '18px 20px 8px' }}>
            <p style={{ fontSize: projector ? 18 : 15, lineHeight: 1.8, color: 'rgba(255,255,255,0.88)', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
              {current?.narration}
            </p>
          </div>

          {/* Page dots */}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '12px 20px' }}>
            {scenes.map((sc, i) => (
              <div key={i} onClick={() => { stopAudio(); setScene(i) }} style={{
                height: 6, borderRadius: 3, cursor: 'pointer', transition: 'all 0.2s',
                width: i === scene ? 20 : 6,
                background: i === scene ? '#7F77DD' : sc.imageData ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)'
              }} />
            ))}
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px 20px', justifyContent: 'center' }}>
            <button onClick={goPrev} disabled={scene === 0} aria-label="Previous" style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', cursor: scene === 0 ? 'not-allowed' : 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: scene === 0 ? 0.4 : 1 }}>‹</button>

            <button
              onClick={() => speaking ? stopAudio() : playNarration()}
              disabled={loadingAudio}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: speaking ? '#3C3489' : '#534AB7',
                border: 'none', borderRadius: 100,
                color: 'white', cursor: loadingAudio ? 'wait' : 'pointer',
                padding: '12px 24px', fontSize: 14, fontWeight: 600,
                transition: 'all 0.2s', opacity: loadingAudio ? 0.7 : 1
              }}
            >
              {loadingAudio ? '⏳ Loading…' : speaking ? '⏸ Stop' : '▶ Read aloud'}
            </button>

            <button onClick={goNext} disabled={scene === scenes.length - 1} aria-label="Next" style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', cursor: scene === scenes.length - 1 ? 'not-allowed' : 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: scene === scenes.length - 1 ? 0.4 : 1 }}>›</button>
          </div>

          <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.3)', paddingBottom: 16 }}>
            {scene + 1} of {scenes.length} · Space to play · ← → to navigate
          </p>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(1.02); } to { opacity: 1; transform: scale(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
