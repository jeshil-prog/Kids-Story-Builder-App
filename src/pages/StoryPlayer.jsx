import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useNarration } from '../hooks/useNarration'

export default function StoryPlayer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { stories } = useStore()
  const story = stories.find(s => s.id === id)
  const [scene, setScene] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)
  const [projector, setProjector] = useState(false)
  const { speak, stop, speaking } = useNarration()

  const scenes = story?.scenes || []
  const current = scenes[scene]

  const goNext = useCallback(() => {
    if (scene < scenes.length - 1) { stop(); setScene(s => s + 1) }
    else { setAutoPlay(false); stop() }
  }, [scene, scenes.length, stop])

  const goPrev = () => { stop(); setScene(s => Math.max(0, s - 1)) }

  useEffect(() => {
    if (!autoPlay || !current) return
    speak(current.narration, goNext)
  }, [scene, autoPlay])

  useEffect(() => {
    return () => stop()
  }, [])

  // Keyboard nav
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'Escape') setProjector(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext])

  if (!story) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 40 }}>
        <p style={{ fontSize: 28 }}>📖</p>
        <p style={{ fontSize: 16, color: 'var(--text-muted)' }}>Story not found.</p>
        <button onClick={() => navigate('/')} style={{ color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>← Back home</button>
      </div>
    )
  }

  const progress = ((scene + 1) / scenes.length) * 100

  const mainBg = projector ? '#0d0b1a' : 'var(--bg-story)'

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      background: mainBg, transition: 'background 0.4s',
      ...(projector ? { position: 'fixed', inset: 0, zIndex: 9999 } : {})
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        background: 'rgba(0,0,0,0.2)',
        backdropFilter: 'blur(8px)'
      }}>
        {!projector && (
          <button onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.7)', padding: '6px 12px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            ← Back
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.title}</p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{story.genre} · {story.style}</p>
        </div>
        <button
          onClick={() => { setProjector(p => !p); stop(); setAutoPlay(false) }}
          style={{ background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.7)', padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}
          title={projector ? 'Exit projector mode' : 'Projector mode (fullscreen)'}
        >
          {projector ? '⊠ Exit' : '⊡ Project'}
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: '#7F77DD', transition: 'width 0.4s' }} />
      </div>

      {/* Scene area */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: projector ? '32px' : '20px', overflowY: 'auto' }}>
        <div style={{
          width: '100%', maxWidth: projector ? 800 : 540,
          background: 'rgba(255,255,255,0.04)',
          border: '0.5px solid rgba(255,255,255,0.1)',
          borderRadius: 24, overflow: 'hidden'
        }}>
          {/* Image */}
          <div style={{
            width: '100%',
            aspectRatio: '4/3',
            background: '#1a1830',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', overflow: 'hidden'
          }}>
            {current?.imageData ? (
              <img
                key={scene}
                src={`data:${current.imageType || 'image/png'};base64,${current.imageData}`}
                alt={`Scene ${scene + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', animation: 'fadeIn 0.6s ease' }}
              />
            ) : (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                <p style={{ fontSize: 40, marginBottom: 8 }}>🎨</p>
                <p style={{ fontSize: 13 }}>Scene {scene + 1}</p>
              </div>
            )}
            {/* Scene number badge */}
            <div style={{
              position: 'absolute', top: 12, left: 12,
              background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
              borderRadius: 100, padding: '3px 10px', fontSize: 11,
              color: 'rgba(255,255,255,0.7)', border: '0.5px solid rgba(255,255,255,0.15)'
            }}>
              {current?.chapter}
            </div>
          </div>

          {/* Narration text */}
          <div style={{ padding: projector ? '24px 28px 20px' : '18px 20px 16px' }}>
            <p style={{
              fontSize: projector ? 18 : 15,
              lineHeight: 1.75,
              color: 'rgba(255,255,255,0.88)',
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontStyle: 'italic',
              marginBottom: 16
            }}>
              {current?.narration}
            </p>

            {/* Page dots */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
              {scenes.map((_, i) => (
                <div
                  key={i}
                  onClick={() => { stop(); setScene(i) }}
                  style={{
                    height: 6, borderRadius: 3, cursor: 'pointer', transition: 'all 0.2s',
                    width: i === scene ? 20 : 6,
                    background: i === scene ? '#7F77DD' : 'rgba(255,255,255,0.2)'
                  }}
                />
              ))}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={goPrev}
                disabled={scene === 0}
                style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.7)', cursor: scene === 0 ? 'not-allowed' : 'pointer',
                  fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: scene === 0 ? 0.4 : 1
                }}
                aria-label="Previous scene"
              >‹</button>

              {/* Play / Pause narration */}
              <button
                onClick={() => {
                  if (speaking) { stop(); setAutoPlay(false) }
                  else { setAutoPlay(true); speak(current?.narration, goNext) }
                }}
                style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: '#534AB7', border: 'none',
                  color: 'white', cursor: 'pointer', fontSize: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s'
                }}
                aria-label={speaking ? 'Pause narration' : 'Play narration'}
              >
                {speaking ? '⏸' : '▶'}
              </button>

              <button
                onClick={goNext}
                disabled={scene === scenes.length - 1}
                style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.7)', cursor: scene === scenes.length - 1 ? 'not-allowed' : 'pointer',
                  fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: scene === scenes.length - 1 ? 0.4 : 1
                }}
                aria-label="Next scene"
              >›</button>

              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{scene + 1} / {scenes.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Projector instruction */}
      {projector && (
        <div style={{ textAlign: 'center', padding: '8px 0 16px', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
          Use ← → arrow keys to navigate · Press Esc to exit
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(1.02); } to { opacity: 1; transform: scale(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  )
}
