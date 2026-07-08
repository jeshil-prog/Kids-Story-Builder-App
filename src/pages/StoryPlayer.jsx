import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { buildSfxTimeline, stopAmbientSfx } from '../lib/sfx'

export default function StoryPlayer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getStory, saveStory } = useStore()
  const [story, setStory] = useState(null)
  const [scene, setScene] = useState(0)
  const isLandscape = () => window.innerWidth > window.innerHeight
  const [projector, setProjector] = useState(true)
  const [landscape, setLandscape] = useState(isLandscape)
  // Real viewport height in px. iOS Safari's 100dvh doesn't reliably match the
  // actual visible viewport when the address/tab bar is shown, which is what
  // was leaving a dead-space gap below the story panel. Measuring innerHeight
  // directly and re-measuring on resize/orientationchange/scroll is robust.
  const [viewportH, setViewportH] = useState(() => window.innerHeight)

  useEffect(() => {
    const update = () => {
      setLandscape(isLandscape())
      setViewportH(window.innerHeight)
    }
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    // iOS toggles the address bar on scroll, which changes innerHeight
    window.addEventListener('scroll', update, { passive: true })
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      window.removeEventListener('scroll', update)
    }
  }, [])

  // Short, wide viewport = phone in landscape. Give it a condensed chrome so
  // the story panel gets nearly the full screen instead of fighting fixed-height UI.
  const compact = landscape && viewportH < 560
  const [speaking, setSpeaking] = useState(false)
  const [loadingAudio, setLoadingAudio] = useState(false)
  // True when the reader has asked to advance (manually or via auto-advance
  // after narration) but the next scene's image isn't ready yet. We hold at
  // the current scene rather than showing any kind of placeholder — the
  // reader never sees an unfinished page, just a brief pause on the page
  // they're already looking at.
  const [waitingForNext, setWaitingForNext] = useState(false)
  const audioRef = useRef(null)
  const sfxCacheRef = useRef({})
  const autoAdvanceRef = useRef(null)
  // Remembers whether the pending advance (blocked by waitingForNext) should
  // also auto-play narration once it goes through — i.e. whether this was a
  // continuous-playthrough advance or a plain manual "next" click.
  const pendingContinueRef = useRef(false)
  // Set right before a scene-index change when that change should
  // auto-play narration once rendered (continuous audiobook-style mode).
  const autoPlayNextRef = useRef(false)

  // Load story on mount
  useEffect(() => {
    const s = getStory(id)
    setStory(s)
  }, [id])

  // Backfill poller: images generate asynchronously in the background and
  // are never waited on during creation, so this is the only thing that
  // patches finished images into the story as they complete. It also
  // retries scenes that come back rate-limited — OpenAI allows only 5/min
  // image requests with input images (reference photos), confirmed via
  // repeated testing, so some scenes predictably land here at least once.
  // Retrying from here (client-driven, safely bounded per attempt) rather
  // than from inside a webhook avoids ever needing a function invocation to
  // sleep through a long backoff, which risks Vercel's duration limits.
  const backfillRef = useRef(false)
  const retryCountsRef = useRef({})
  const retryLastAttemptRef = useRef({})
  const MAX_RETRIES_PER_SCENE = 5
  const RETRY_COOLDOWN_MS = 20000

  useEffect(() => {
    if (!story?.scenes?.length) return
    const missing = story.scenes.some((s) => !s.imageUrl && !s.imageData)
    if (!missing || backfillRef.current) return
    backfillRef.current = true

    let cancelled = false
    const BACKFILL_INTERVAL_MS = 8000
    // Generous ceiling — the reader may be actively reading through a long
    // story for many minutes, so this isn't a "loading screen" timeout the
    // way it once was. It just stops polling eventually so a permanently
    // broken scene (e.g. genuinely exhausted retries) doesn't poll forever.
    const BACKFILL_MAX_MS = 20 * 60 * 1000
    const startedAt = Date.now()

    const retryRateLimitedScene = async (sceneIndex) => {
      const attempts = retryCountsRef.current[sceneIndex] || 0
      const lastAttempt = retryLastAttemptRef.current[sceneIndex] || 0
      if (attempts >= MAX_RETRIES_PER_SCENE) return
      if (Date.now() - lastAttempt < RETRY_COOLDOWN_MS) return

      retryCountsRef.current[sceneIndex] = attempts + 1
      retryLastAttemptRef.current[sceneIndex] = Date.now()

      const sceneData = story.scenes[sceneIndex]
      const charPayload = (story.characters || []).map((c) => ({
        name: c.name, photoBase64: c.photoBase64 || null,
        photoMime: c.photoMime || 'image/jpeg', description: c.description || null
      }))
      try {
        await fetch('/api/submit-image-job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imagePrompt: sceneData.imagePrompt, style: story.style,
            storyId: id, sceneIndex, characters: charPayload
          })
        })
      } catch (err) {
        console.error(`Retry submission for scene ${sceneIndex} failed:`, err)
      }
    }

    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch(`/api/image-status?storyId=${id}&sceneCount=${story.scenes.length}`)
        if (res.ok) {
          const { scenes: statuses } = await res.json()
          let changed = false
          const updatedScenes = story.scenes.map((sc, i) => {
            if (!sc.imageUrl && statuses[i]?.status === 'done') {
              changed = true
              return { ...sc, imageUrl: statuses[i].imageUrl }
            }
            return sc
          })
          if (changed) {
            const updatedStory = { ...story, scenes: updatedScenes }
            setStory(updatedStory)
            saveStory(updatedStory)
          }

          // Kick off retries for any rate-limited scenes, independent of the
          // "are we done" check below. Staggered ~4s apart across scenes in
          // this same tick — without this, several scenes rate-limited
          // together would retry all at once and likely re-trigger the same
          // limit we're trying to recover from.
          const toRetry = statuses
            .map((st, i) => ({ st, i }))
            .filter(({ st, i }) => st?.status === 'error' && st?.errorCode === 'rate_limit_exceeded' && !updatedScenes[i].imageUrl)
          toRetry.forEach(({ i }, orderIndex) => {
            setTimeout(() => retryRateLimitedScene(i), orderIndex * 4000)
          })

          const stillMissing = updatedScenes.some((sc) => !sc.imageUrl && !sc.imageData)
          if (!stillMissing) return // done — stop polling
        }
      } catch (err) {
        console.error('Backfill poll failed:', err)
      }
      if (!cancelled && Date.now() - startedAt < BACKFILL_MAX_MS) {
        setTimeout(poll, BACKFILL_INTERVAL_MS)
      }
    }
    poll()

    return () => { cancelled = true }
  }, [story?.id])

  // Generate and play sfx via ElevenLabs, with in-memory cache
  const playSfx = useCallback(async (sound) => {
    try {
      let b64 = sfxCacheRef.current[sound]
      if (!b64) {
        const res = await fetch('/api/generate-sfx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sound })
        })
        if (!res.ok) return
        const data = await res.json()
        b64 = data.b64
        sfxCacheRef.current[sound] = b64
      }
      const audio = new Audio(`data:audio/mpeg;base64,${b64}`)
      audio.volume = 0.35
      audio.play().catch(() => {})
    } catch (err) {
      console.error('SFX error:', err)
    }
  }, [])

  const stopAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    clearTimeout(autoAdvanceRef.current)
    setSpeaking(false)
    setLoadingAudio(false)
  }, [])

  const scenes = story?.scenes || []
  const current = scenes[scene]

  // continueReading=true means this advance came from narration finishing,
  // and should auto-play the new scene's narration too once it lands
  // (continuous audiobook-style playthrough). Manual next-button/arrow-key
  // presses call this with no argument, so they just move the page.
  const goNext = useCallback((continueReading = false) => {
    const nextIndex = scene + 1
    if (nextIndex >= scenes.length) { stopAudio(); return }
    const nextReady = !!(scenes[nextIndex]?.imageUrl || scenes[nextIndex]?.imageData)
    stopAudio()
    if (nextReady) {
      if (continueReading) autoPlayNextRef.current = true
      setScene(nextIndex)
    } else {
      // Hold at the current, already-loaded scene rather than advancing to
      // one without an image. The waiting indicator (spinner on the next
      // arrow) is the only visible sign anything's happening.
      pendingContinueRef.current = continueReading
      setWaitingForNext(true)
    }
  }, [scene, scenes, stopAudio])

  const goPrev = useCallback(() => {
    stopAudio()
    setWaitingForNext(false)
    setScene(s => Math.max(0, s - 1))
  }, [stopAudio])

  // Once the scene we were waiting on actually becomes ready (via the
  // backfill poller updating `story`), complete the advance we held earlier.
  useEffect(() => {
    if (!waitingForNext) return
    const nextIndex = scene + 1
    const nextReady = !!(scenes[nextIndex]?.imageUrl || scenes[nextIndex]?.imageData)
    if (nextReady) {
      setWaitingForNext(false)
      if (pendingContinueRef.current) autoPlayNextRef.current = true
      pendingContinueRef.current = false
      setScene(nextIndex)
    }
  }, [story, waitingForNext, scene, scenes])

  const playNarration = useCallback(async () => {
    if (speaking || loadingAudio || !current?.narration) return
    const openAiKey = import.meta.env.VITE_OPENAI_API_KEY

    if (openAiKey) {
      setLoadingAudio(true)
      try {
        const res = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAiKey}` },
          body: JSON.stringify({ model: 'gpt-4o-mini-tts', input: current.narration, voice: 'coral', instructions: 'Speak warmly and gently, like a parent reading a bedtime story. Use a calm, expressive, storytelling tone.', speed: 0.9 })
        })
        if (res.ok) {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const audio = new Audio(url)
          audioRef.current = audio
          setLoadingAudio(false)
          setSpeaking(true)

          // Fire SFX at timed intervals during OpenAI TTS playback
          const sfxTimeline = buildSfxTimeline(current.narration, current.sfxCues)
          const wordsPerSecond = 2.5 * 0.9 // OpenAI TTS speed 0.9
          const sfxTimers = []
          sfxTimeline.forEach(cue => {
            const delayMs = (cue.wordIndex / wordsPerSecond) * 1000
            const timer = setTimeout(() => playSfx(cue.sound), delayMs)
            sfxTimers.push(timer)
          })

          audio.play()
          audio.onended = () => {
            sfxTimers.forEach(t => clearTimeout(t))
            setSpeaking(false)
            autoAdvanceRef.current = setTimeout(() => goNext(true), 1500)
          }
          audio.onerror = () => {
            sfxTimers.forEach(t => clearTimeout(t))
            setSpeaking(false)
            setLoadingAudio(false)
          }
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
        autoAdvanceRef.current = setTimeout(() => goNext(true), 1500)
      }
      u.onerror = () => {
        sfxTimers.forEach(t => clearTimeout(t))
        setSpeaking(false)
      }
      setSpeaking(true)
      window.speechSynthesis.speak(u)
    }
  }, [current, speaking, loadingAudio, goNext])

  // Keep a ref to the latest playNarration so the auto-play effect below
  // never calls a stale closure from before the scene index changed.
  const playNarrationRef = useRef(() => {})
  useEffect(() => { playNarrationRef.current = playNarration }, [playNarration])

  // After a continuous-playthrough advance lands (scene index actually
  // changes), automatically start reading the new page aloud.
  useEffect(() => {
    if (autoPlayNextRef.current) {
      autoPlayNextRef.current = false
      playNarrationRef.current()
    }
  }, [scene])

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

  if (!landscape) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 40, background: '#0d0b1a' }}>
        <div style={{ fontSize: 64 }}>📖</div>
        <p style={{ fontSize: 20, fontWeight: 600, color: 'white', textAlign: 'center', margin: 0 }}>Rotate your device</p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', maxWidth: 240, margin: 0, lineHeight: 1.6 }}>
          Stories look best in landscape mode. Turn your phone sideways to begin reading!
        </p>
      </div>
    )
  }

  if (!story) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 40 }}>
      <p style={{ fontSize: 28 }}>📖</p>
      <p style={{ fontSize: 16, color: 'var(--text-muted)' }}>Story not found.</p>
      <button onClick={() => navigate('/')} style={{ color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>← Back home</button>
    </div>
  )

  // Never show a bare "no image yet" scene, including the very first one —
  // hold on a full-page loading state until scene 0's illustration exists.
  const scene0Ready = !!(scenes[0]?.imageUrl || scenes[0]?.imageData)
  if (!scene0Ready) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 18, padding: 40, background: '#0d0b1a', minHeight: '100vh' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#7F77DD', animation: 'spin 1s linear infinite' }} />
        <p style={{ fontSize: 16, fontWeight: 600, color: 'white', textAlign: 'center', margin: 0 }}>Preparing your storybook…</p>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: 280, margin: 0 }}>{story.title}</p>
        <button onClick={() => navigate('/')} style={{ marginTop: 8, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>← Back home</button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const progress = ((scene + 1) / scenes.length) * 100
  const readyCount = scenes.filter((s) => s.imageUrl || s.imageData).length

  // Compact mode collapses onto a single overlay control bar (over the image)
  // instead of separate dots/controls/caption rows underneath the panel.
  // That was the source of the dead-space gap in landscape: those rows had a
  // fixed height, but the panel above them wasn't reliably filling exactly
  // "remaining space" on iOS Safari, so a gap opened up between them. With
  // nothing but the panel below the header/progress bar, there's nothing left
  // for a gap to appear in — the panel simply fills whatever space exists.
  const useOverlayControls = compact || projector
  const nextIsLastAndUnreachable = scene === scenes.length - 1
  const nextDisabled = nextIsLastAndUnreachable || waitingForNext

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', background: '#0d0b1a',
      height: `${viewportH}px`, maxHeight: `${viewportH}px`,
      paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)',
      boxSizing: 'border-box',
      ...(projector ? { position: 'fixed', inset: 0, zIndex: 9999 } : {})
    }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: compact ? '5px 10px' : '12px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', flexShrink: 0 }}>
        <button onClick={() => { stopAudio(); navigate(-1) }} style={{ background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.7)', padding: compact ? '4px 9px' : '6px 12px', fontSize: compact ? 12 : 13, cursor: 'pointer', flexShrink: 0 }}>
            ← Back
          </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: compact ? 12 : 14, fontWeight: 600, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{story.title}</p>
          {!compact && (
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
              {story.genre} · {story.style}
              {readyCount < scenes.length && ` · ${readyCount}/${scenes.length} illustrated`}
            </p>
          )}
        </div>
        <button onClick={() => { stopAudio(); setProjector(p => !p) }} style={{ background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.7)', padding: compact ? '4px 9px' : '6px 12px', fontSize: compact ? 12 : 13, cursor: 'pointer', flexShrink: 0 }}>
          {projector ? '⊠ Exit' : '⊡ Fullscreen'}
        </button>
      </div>

      {/* Story progress bar */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${progress}%`, background: '#7F77DD', transition: 'width 0.4s' }} />
      </div>

      {/* Scene */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'stretch', justifyContent: 'center', overflow: 'hidden' }}>
        <div style={{ width: '100%', maxWidth: (projector || compact) ? '100%' : 900, height: '100%', background: 'rgba(255,255,255,0.04)', border: (projector || compact) ? 'none' : '0.5px solid rgba(255,255,255,0.1)', borderRadius: (projector || compact) ? 0 : 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* Scene: parchment scroll + image, side by side, fills 100% of available height */}
          <div style={{ width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', overflow: 'hidden', background: '#1a1830' }}>

            {/* Left: parchment — scrolls internally if narration is long, so text is never clipped */}
            <div style={{
              width: compact ? '44%' : (projector ? '35%' : '40%'),
              flexShrink: 0,
              background: 'linear-gradient(175deg, #f7ecd4 0%, #eedcb2 50%, #e8d49e 100%)',
              display: 'flex', flexDirection: 'column',
              padding: compact ? '12px 14px 12px 12px' : (projector ? '28px 26px 24px 24px' : '18px 18px 16px 16px'),
              boxSizing: 'border-box',
              position: 'relative',
              zIndex: 2,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              clipPath: 'polygon(0 0, 97% 0, 100% 1.5%, 98% 3%, 100% 5%, 97% 7%, 99% 10%, 97% 13%, 100% 16%, 98% 20%, 100% 25%, 97% 30%, 100% 35%, 98% 40%, 100% 45%, 97% 50%, 100% 55%, 98% 60%, 100% 65%, 97% 70%, 100% 75%, 98% 80%, 100% 85%, 97% 90%, 100% 93%, 98% 96%, 100% 98.5%, 97% 100%, 0 100%)',
            }}>
              {/* Chapter title */}
              <p style={{
                fontSize: compact ? 10 : (projector ? 12 : 10),
                fontWeight: 700,
                color: '#6b4423',
                fontFamily: 'Georgia, serif',
                textTransform: 'uppercase',
                letterSpacing: 1,
                margin: '0 0 6px 0',
                opacity: 0.8,
                flexShrink: 0,
              }}>
                {current?.chapter}
              </p>
              {/* Narration — scrolls rather than clipping if it doesn't fit */}
              <p style={{
                fontSize: compact ? 12 : (projector ? 15 : 13),
                lineHeight: 1.65,
                color: '#2e1a08',
                fontFamily: 'Georgia, serif',
                margin: 0,
              }}>
                {current?.narration}
              </p>
            </div>

            {/* Right: full illustration, always fills height, hosts overlay controls in compact/fullscreen */}
            <div style={{ flex: 1, position: 'relative', marginLeft: -2, minHeight: compact ? 140 : 280, overflow: 'hidden' }}>
              {(current?.imageUrl || current?.imageData) ? (
                <img
                  key={`${scene}-${(current.imageUrl || current.imageData)?.slice(0,10)}`}
                  src={current.imageUrl || `data:${current.imageType || 'image/png'};base64,${current.imageData}`}
                  alt={`Scene ${scene + 1}`}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', animation: 'fadeIn 0.6s ease', display: 'block' }}
                />
              ) : (
                // Should be effectively unreachable — gating in goNext/the
                // auto-advance effect means we only ever move to a scene once
                // its image exists. Kept minimal (no cheerful placeholder
                // text/emoji) purely as a silent safety net.
                <div style={{ position: 'absolute', inset: 0, background: '#1a1830' }} />
              )}

              {/* Overlay controls — used in compact/mobile-landscape and fullscreen so the
                  panel above never has to share space with a separate controls row */}
              {useOverlayControls && (
                <div style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: compact ? 6 : 10,
                  padding: compact ? '10px 10px 8px' : '18px 20px 16px',
                  background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.35) 60%, transparent 100%)',
                }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {scenes.map((sc, i) => (
                      <div key={i} onClick={() => { if (sc.imageUrl || sc.imageData) { stopAudio(); setWaitingForNext(false); setScene(i) } }} style={{
                        height: 5, borderRadius: 3, cursor: (sc.imageData || sc.imageUrl) ? 'pointer' : 'default', transition: 'all 0.2s',
                        width: i === scene ? 16 : 5,
                        background: i === scene ? '#7F77DD' : (sc.imageData || sc.imageUrl) ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)'
                      }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 12 }}>
                    <button onClick={goPrev} disabled={scene === 0} aria-label="Previous" style={{ width: compact ? 32 : 40, height: compact ? 32 : 40, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '0.5px solid rgba(255,255,255,0.2)', color: 'white', cursor: scene === 0 ? 'not-allowed' : 'pointer', fontSize: compact ? 16 : 18, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: scene === 0 ? 0.4 : 1 }}>‹</button>

                    <button
                      onClick={() => speaking ? stopAudio() : playNarration()}
                      disabled={loadingAudio}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: speaking ? '#3C3489' : '#534AB7',
                        border: 'none', borderRadius: 100,
                        color: 'white', cursor: loadingAudio ? 'wait' : 'pointer',
                        padding: compact ? '8px 16px' : '10px 20px', fontSize: compact ? 12 : 14, fontWeight: 600,
                        transition: 'all 0.2s', opacity: loadingAudio ? 0.7 : 1, whiteSpace: 'nowrap'
                      }}
                    >
                      {loadingAudio ? '⏳' : speaking ? '⏸ Stop' : '▶ Read aloud'}
                    </button>

                    <button onClick={() => goNext()} disabled={nextDisabled} aria-label="Next" style={{ width: compact ? 32 : 40, height: compact ? 32 : 40, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '0.5px solid rgba(255,255,255,0.2)', color: 'white', cursor: nextDisabled ? 'not-allowed' : 'pointer', fontSize: compact ? 16 : 18, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: nextIsLastAndUnreachable ? 0.4 : 1 }}>
                      {waitingForNext ? <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.25)', borderTopColor: 'white', animation: 'spin 0.8s linear infinite' }} /> : '›'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Below-panel controls — only when there's room to spare (desktop / tall windowed view) */}
          {!useOverlayControls && (
            <>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '12px 20px', flexShrink: 0 }}>
                {scenes.map((sc, i) => (
                  <div key={i} onClick={() => { if (sc.imageUrl || sc.imageData) { stopAudio(); setWaitingForNext(false); setScene(i) } }} style={{
                    height: 6, borderRadius: 3, cursor: (sc.imageData || sc.imageUrl) ? 'pointer' : 'default', transition: 'all 0.2s',
                    width: i === scene ? 20 : 6,
                    background: i === scene ? '#7F77DD' : (sc.imageData || sc.imageUrl) ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)'
                  }} />
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px 20px', justifyContent: 'center', flexShrink: 0 }}>
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

                <button onClick={() => goNext()} disabled={nextDisabled} aria-label="Next" style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', cursor: nextDisabled ? 'not-allowed' : 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: nextIsLastAndUnreachable ? 0.4 : 1 }}>
                  {waitingForNext ? <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'rgba(255,255,255,0.8)', animation: 'spin 0.8s linear infinite' }} /> : '›'}
                </button>
              </div>

              <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.3)', paddingBottom: 16, flexShrink: 0 }}>
                {waitingForNext ? 'Preparing the next page…' : `${scene + 1} of ${scenes.length} · Space to play · ← → to navigate`}
              </p>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(1.02); } to { opacity: 1; transform: scale(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
