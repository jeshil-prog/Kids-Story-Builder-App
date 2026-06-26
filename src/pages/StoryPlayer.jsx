import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'

export default function StoryPlayer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getStory } = useStore()
  const story = getStory(id)
  const [scene, setScene] = useState(0)
  const [projector, setProjector] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [loadingAudio, setLoadingAudio] = useState(false)
  const audioRef = useRef(null)
  const autoAdvanceRef = useRef(null)

  const scenes = story?.scenes || []
  const current = scenes[scene]

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    clearTimeout(autoAdvanceRef.current)
    setSpeaking(false)
    setLoadingAudio(false)
  }, [])

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
    setLoadingAudio(true)
    try {
      const res = await fetch('/api/generate-narration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: current.narration })
      })
      if (!res.ok) throw new Error('Narration failed')
      const { b64 } = await res.json()
      const audio = new Audio(`data:audio/mpeg;base64,${b64}`)
      audioRef.current = audio
      setLoadingAudio(false)
      setSpeaking(true)
      audio.play()
      audio.onended = () => {
        setSpeaking(false)
        // Auto-advance after a short pause
        autoAdvanceRef.current = setTimeout(() => goNext(), 1500)
      }
      audio.onerror = () => { setSpeaking(false); setLoadingAudio(false) }
    } catch {
      setLoadingAudio(false)
      // Fall back to browser TTS
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(current.narration)
        u.rate = 0.88; u.pitch = 1.05
        u.onend = () => { setSpeaking(false); autoAdvanceRef.current = setTimeout(() => goNext(), 1500) }
        setSpeaking(true)
        window.speechSynthesis.speak(u)
      }
    }
  }, [current, speaking, loadingAudio, goNext])

  // Keyboard nav
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

  useEffect(() => { return () => stopAudio() }, [stopAudio])

  if (!story) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 40 }}>
      <p style={{ fontSize: 28 }}>📖</p>
      <p style={{ fontSize: 16, color: 'var(--text-muted)' }}>Story not found.</p>
      <button onClick={() => navigate('/')} style={{ color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>← Back home</button>
    </div>
  )

  const progress = ((scene + 1) / scenes.length) * 100

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      background: '#0d0b1a',
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
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{story.genre} · {story.style}</p>
        </div>
        <button onClick={() => { stopAudio(); setProjector(p => !p) }} style={{ background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.7)', padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
          {projector ? '⊠ Exit' : '⊡ Fullscreen'}
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: '#7F77DD', transition: 'width 0.4s' }} />
      </div>

      {/* Scene */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: projector ? '32px' : '16px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: projector ? 800 : 540, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 24, overflow: 'hidden' }}>

          {/* Image */}
          <div style={{ width: '100%', aspectRatio: '1/1', background: '#1a1830', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
            {current?.imageData ? (
              <img key={scene} src={`data:${current.imageType || 'image/png'};base64,${current.imageData}`} alt={`Scene ${scene + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', animation: 'fadeIn 0.6s ease' }} />
            ) : (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)' }}>
                <p style={{ fontSize: 40, marginBottom: 8 }}>🎨</p>
                <p style={{ fontSize: 13 }}>Scene {scene + 1}</p>
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
            {scenes.map((_, i) => (
              <div key={i} onClick={() => { stopAudio(); setScene(i) }} style={{ height: 6, borderRadius: 3, cursor: 'pointer', transition: 'all 0.2s', width: i === scene ? 20 : 6, background: i === scene ? '#7F77DD' : 'rgba(255,255,255,0.2)' }} />
            ))}
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px 20px', justifyContent: 'center' }}>
            <button onClick={goPrev} disabled={scene === 0} aria-label="Previous" style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', cursor: scene === 0 ? 'not-allowed' : 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: scene === 0 ? 0.4 : 1 }}>‹</button>

            {/* NARRATION BUTTON — prominent */}
            <button
              onClick={() => speaking ? stopAudio() : playNarration()}
              disabled={loadingAudio}
              aria-label={speaking ? 'Stop narration' : 'Play narration'}
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
            {scene + 1} of {scenes.length} · {projector ? 'Space to play · ← → to navigate · Esc to exit' : 'Space to play · ← → to navigate'}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(1.02); } to { opacity: 1; transform: scale(1); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
