import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { buildSfxTimeline, stopAmbientSfx } from '../lib/sfx'

// ---- Learning mode: word highlighting -------------------------------------
// Narration audio is a single file with no per-word timestamps, so the active
// word is estimated from playback progress. Each word is weighted by its
// length (longer words take longer to say) plus a small pause after commas,
// full stops and the like. Costs nothing extra and needs no pipeline change.
function buildWordTimings(text) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean)
  const weights = words.map(w => {
    const letters = w.replace(/[^\p{L}\p{N}]/gu, '').length || 1
    let wt = 2 + letters
    if (/[.!?]["')\]]*$/.test(w)) wt += 5
    else if (/[,;:\u2014\u2013]["')\]]*$/.test(w)) wt += 2.5
    return wt
  })
  const total = weights.reduce((a, b) => a + b, 0) || 1
  let acc = 0
  const ends = weights.map(wt => { acc += wt; return acc / total })
  return { words, ends }
}

function wordIndexAt(ends, progress) {
  for (let i = 0; i < ends.length; i++) if (progress < ends[i]) return i
  return ends.length - 1
}

// Picks the largest text size that fits a box without scrolling. Used by the
// phone full screen layout, where there is no room for the text to scroll.
function fitFontSize(len, w, h, max = 22, min = 11) {
  for (let fs = max; fs >= min; fs--) {
    const perLine = Math.max(8, Math.floor(w / (fs * 0.52)))
    const lines = Math.floor(h / (fs * 1.55))
    if (len <= perLine * lines * 0.85) return fs
  }
  return min
}

function NarrationText({ text, learning, activeIndex, dark }) {
  if (!learning || activeIndex < 0) return <>{text}</>
  const words = (text || '').trim().split(/\s+/).filter(Boolean)
  return (
    <>
      {words.map((w, i) => (
        <React.Fragment key={i}>
          <span style={{
            borderRadius: 6,
            padding: '1px 3px',
            margin: '0 -3px',
            transition: 'background 0.12s, color 0.12s',
            background: i === activeIndex ? '#ffd24d' : 'transparent',
            color: i === activeIndex ? '#2e1a08' : (dark
              ? (i < activeIndex ? 'rgba(255,255,255,0.5)' : '#ffffff')
              : (i < activeIndex ? 'rgba(46,26,8,0.55)' : '#2e1a08')),
            fontWeight: i === activeIndex ? 700 : 'inherit',
            boxShadow: i === activeIndex ? '0 1px 0 rgba(120,80,0,0.35)' : 'none',
          }}>{w}</span>
          {i < words.length - 1 ? ' ' : ''}
        </React.Fragment>
      ))}
    </>
  )
}

function FinishingTouchesScreen({ title, onBack, stuck }) {
  const MESSAGES = [
    { emoji: '🎨', text: 'Painting your first page…' },
    { emoji: '🖌️', text: 'Adding the finishing touches…' },
    { emoji: '✨', text: 'Almost ready to read…' },
    { emoji: '📖', text: 'Turning to page one…' },
  ]
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (stuck) return
    const t = setInterval(() => setIdx(i => (i + 1) % MESSAGES.length), 2800)
    return () => clearInterval(t)
  }, [stuck])
  const msg = stuck
    ? { emoji: '😕', text: "This page is taking much longer than expected" }
    : MESSAGES[idx]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, padding: 32, background: 'var(--surface-0)', position: 'relative', overflow: 'hidden', minHeight: '100vh' }}>
      <style>{`
        @keyframes drift { 0%{transform:translateY(100vh) rotate(0deg);opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{transform:translateY(-20px) rotate(720deg);opacity:0} }
        @keyframes bounce { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
      `}</style>

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

      <div style={{ fontSize: 72, marginBottom: 24, animation: stuck ? undefined : 'bounce 1.5s ease-in-out infinite' }}>
        {msg.emoji}
      </div>
      <p style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, textAlign: 'center' }}>
        {msg.text}
      </p>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 8, textAlign: 'center', maxWidth: 280 }}>
        {stuck ? 'Sorry about this — please go back and try creating the story again.' : title}
      </p>
      <button onClick={onBack} style={{ marginTop: 16, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>← Back home</button>
    </div>
  )
}

export default function StoryPlayer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getStory, saveStory } = useStore()
  const [story, setStory] = useState(null)
  const [storyLoading, setStoryLoading] = useState(true)
  const [scene, setScene] = useState(0)
  const isLandscape = () => window.innerWidth > window.innerHeight
  const [projector, setProjector] = useState(true)
  const [landscape, setLandscape] = useState(isLandscape)
  // Real viewport height in px. iOS Safari's 100dvh doesn't reliably match the
  // actual visible viewport when the address/tab bar is shown, which is what
  // was leaving a dead-space gap below the story panel. Measuring innerHeight
  // directly and re-measuring on resize/orientationchange/scroll is robust.
  const [viewportH, setViewportH] = useState(() => window.innerHeight)
  // Distinguishes phones/tablets from desktop — the whole portrait-required,
  // stacked layout below only applies to touch devices. A desktop browser
  // window is normally landscape-shaped and can't be "rotated," so forcing
  // a portrait requirement there would just break desktop reading.
  const [isTouchDevice] = useState(() => window.matchMedia('(hover: none) and (pointer: coarse)').matches)

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
  // Now means "mobile device in the required portrait orientation" — this
  // is what triggers the stacked (image-on-top) layout below, replacing the
  // old side-by-side landscape layout for touch devices entirely.
  const compact = isTouchDevice && !landscape
  const [speaking, setSpeaking] = useState(false)
  // Learning mode (word highlighting while the narration plays) is the
  // default. The choice is remembered per device; storage can be blocked
  // (private windows), so every access is wrapped.
  const [learningMode, setLearningMode] = useState(() => {
    try { return localStorage.getItem('sd_reading_mode') !== 'regular' } catch { return true }
  })
  const [activeWord, setActiveWord] = useState(-1)

  // Phone full screen ("cinema") mode, like YouTube's landscape full screen.
  // Where the phone's browser allows it (Android Chrome), this hides the
  // address and tab bars and turns the screen sideways. iPhone Safari does
  // not let any web page hide its bars or lock rotation, so there it still
  // gives the full screen layout once the phone is turned sideways.
  const [cinema, setCinema] = useState(false)
  const enterCinema = useCallback(async () => {
    setCinema(true)
    try {
      const el = document.documentElement
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
    } catch {}
    try { await window.screen?.orientation?.lock?.('landscape') } catch {}
  }, [])
  const exitCinema = useCallback(() => {
    setCinema(false)
    try { window.screen?.orientation?.unlock?.() } catch {}
    try { if (document.fullscreenElement) document.exitFullscreen() } catch {}
  }, [])
  // iPhone Safari has no full screen for web pages, but it does tuck its bar
  // away when the page is scrolled up. So where the real Fullscreen API is
  // missing, make the page scrollable behind the full screen layout (a tall
  // invisible spacer) so a swipe up collapses the bar, and say so once.
  const [barHint, setBarHint] = useState(false)
  useEffect(() => {
    const needsSwipeTrick = isTouchDevice && !document.documentElement.requestFullscreen
    if (!cinema || !needsSwipeTrick) return
    const spacer = document.createElement('div')
    spacer.setAttribute('aria-hidden', 'true')
    spacer.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:300vh;pointer-events:none;'
    document.body.appendChild(spacer)
    setBarHint(true)
    const t = setTimeout(() => setBarHint(false), 6000)
    return () => {
      clearTimeout(t)
      setBarHint(false)
      spacer.remove()
      window.scrollTo(0, 0)
    }
  }, [cinema, isTouchDevice])

  useEffect(() => {
    // The phone's own back gesture or swipe can leave full screen; keep in step.
    const onChange = () => {
      if (!document.fullscreenElement) {
        setCinema(false)
        try { window.screen?.orientation?.unlock?.() } catch {}
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      try { window.screen?.orientation?.unlock?.() } catch {}
      try { if (document.fullscreenElement) document.exitFullscreen() } catch {}
    }
  }, [])
  const toggleReadingMode = () => {
    setLearningMode(prev => {
      const next = !prev
      try { localStorage.setItem('sd_reading_mode', next ? 'learning' : 'regular') } catch {}
      return next
    })
  }
  const [loadingAudio, setLoadingAudio] = useState(false)
  // True when the reader has asked to advance (manually or via auto-advance
  // after narration) but the next scene's image isn't ready yet. We hold at
  // the current scene rather than showing any kind of placeholder — the
  // reader never sees an unfinished page, just a brief pause on the page
  // they're already looking at.
  const [waitingForNext, setWaitingForNext] = useState(false)
  const audioRef = useRef(null)
  const sfxCacheRef = useRef({})
  // SFX now play through the Web Audio API instead of separate <audio>
  // elements — narration (which already works correctly) is untouched.
  // The reasoning: HTMLAudioElement's autoplay policy appears to check each
  // .play() call individually for a connection to a trusted gesture, which
  // is why sequential narration-to-narration chaining could be fixed (each
  // call happens inside a trusted event) but *overlapping* SFX playing
  // alongside already-playing narration still got blocked on mobile even
  // after being tied to trusted timeupdate/onboundary events — starting a
  // second, separate, concurrent media element is a stricter case. Web
  // Audio API's restriction is different: the AudioContext itself needs
  // unlocking once via a real gesture, and after that, scheduling any
  // number of sounds through it — including from timer/event callbacks not
  // themselves directly tied to a gesture — just works, because the
  // permission lives on the context, not on each individual play call.
  const audioContextRef = useRef(null)
  const sfxBufferCacheRef = useRef({}) // { [sound]: AudioBuffer }
  const sfxSourceNodesRef = useRef([]) // currently-playing SFX source nodes, for stopAudio()

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (Ctx) audioContextRef.current = new Ctx()
    }
    return audioContextRef.current
  }, [])
  // Incremented every time playback is stopped or restarted. An in-flight
  // playNarration() fetch checks this before acting on its result, so a
  // slow request that resolves after the user has already navigated away
  // (or pressed play again) can't start audio on top of what's now playing.
  const playTokenRef = useRef(0)
  // Remembers whether the pending advance (blocked by waitingForNext) should
  // also auto-play narration once it goes through — i.e. whether this was a
  // continuous-playthrough advance or a plain manual "next" click.
  const pendingContinueRef = useRef(false)
  // Set right before a scene-index change when that change should
  // auto-play narration once rendered (continuous audiobook-style mode).
  const autoPlayNextRef = useRef(false)

  // Load story on mount
  useEffect(() => {
    let cancelled = false
    setStoryLoading(true)
    getStory(id).then((s) => {
      if (cancelled) return
      setStory(s)
      setStoryLoading(false)
    })
    return () => { cancelled = true }
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
  const [stuckSceneIndices, setStuckSceneIndices] = useState([])
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
        name: c.name, photoBase64: c.photoBase64 || null, photoUrl: c.photoUrl || null,
        photoMime: c.photoMime || 'image/jpeg', description: c.description || null
      }))
      try {
        await fetch('/api/submit-image-job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imagePrompt: sceneData.imagePrompt, style: story.style,
            storyId: id, sceneIndex, characters: charPayload,
            narrationText: sceneData.narration
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
            let updated = sc
            if (!sc.imageUrl && statuses[i]?.status === 'done') {
              changed = true
              updated = { ...updated, imageUrl: statuses[i].imageUrl }
            }
            if (!updated.narrationUrl && statuses[i]?.narrationUrl) {
              changed = true
              updated = { ...updated, narrationUrl: statuses[i].narrationUrl }
            }
            if (!updated.narrationWordTimes && statuses[i]?.narrationWordTimes) {
              changed = true
              updated = { ...updated, narrationWordTimes: statuses[i].narrationWordTimes }
            }
            return updated
          })
          if (changed) {
            const updatedStory = { ...story, scenes: updatedScenes }
            setStory(updatedStory)
            saveStory(updatedStory)
          }

          // Kick off retries for any failed scenes, independent of the "are
          // we done" check below. Staggered ~4s apart across scenes in this
          // same tick — without this, several scenes failing together would
          // retry all at once and likely re-trigger whatever caused the
          // failure in the first place. Retries any error EXCEPT
          // insufficient_quota, which won't resolve by retrying — it needs
          // billing fixed on the OpenAI account, and retrying it just burns
          // through the retry budget uselessly. Previously this only
          // retried rate_limit_exceeded specifically, meaning any other
          // error type (a dropped webhook, a different OpenAI error) would
          // silently never retry and eventually leave the reader stuck with
          // no explanation at all.
          const toRetry = statuses
            .map((st, i) => ({ st, i }))
            .filter(({ st, i }) => {
              const imageFailed = st?.status === 'error' && st?.errorCode !== 'insufficient_quota' && !updatedScenes[i].imageUrl
              const narrationFailed = st?.narrationStatus === 'error' && !updatedScenes[i].narrationUrl
              return imageFailed || narrationFailed
            })
          toRetry.forEach(({ i }, orderIndex) => {
            setTimeout(() => retryRateLimitedScene(i), orderIndex * 4000)
          })

          // Surfaced once a scene has exhausted its retries and still isn't
          // ready — previously there was no ceiling-reached feedback at all,
          // just a poller that quietly gave up after 20 minutes leaving the
          // reader on an unexplained spinner forever.
          const exhausted = updatedScenes
            .map((sc, i) => ({ sc, i }))
            .filter(({ sc, i }) => !isSceneReady(sc) && (retryCountsRef.current[i] || 0) >= MAX_RETRIES_PER_SCENE)
          if (exhausted.length > 0) {
            setStuckSceneIndices(exhausted.map(({ i }) => i))
          }

          const stillMissing = updatedScenes.some((sc) => !isSceneReady(sc))
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
      const ctx = getAudioContext()
      if (!ctx) return // Web Audio API unsupported — silently skip, same as before

      let buffer = sfxBufferCacheRef.current[sound]
      if (!buffer) {
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
        const binary = atob(b64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        buffer = await ctx.decodeAudioData(bytes.buffer)
        sfxBufferCacheRef.current[sound] = buffer
      }

      const source = ctx.createBufferSource()
      source.buffer = buffer
      const gain = ctx.createGain()
      gain.gain.value = 0.35 // matches the previous audio.volume = 0.35
      source.connect(gain)
      gain.connect(ctx.destination)

      sfxSourceNodesRef.current.push(source)
      source.onended = () => {
        sfxSourceNodesRef.current = sfxSourceNodesRef.current.filter((s) => s !== source)
      }
      source.start(0)
    } catch (err) {
      console.error('SFX error:', err)
    }
  }, [getAudioContext])

  const stopAudio = useCallback(() => {
    // Invalidates any in-flight playNarration() request — see playTokenRef.
    playTokenRef.current += 1
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    // Stop any SFX that's already actively playing. This is the fix for SFX
    // continuing to play after narration is paused/stopped — they previously
    // had nothing linking them to the narration's stop action. Pending
    // (not-yet-fired) cues need no separate cancellation now — they're tied
    // to the (now paused) audio's own timeupdate/onboundary events, which
    // stop firing the moment playback stops, and the myToken check guards
    // any stray one regardless.
    sfxSourceNodesRef.current.forEach((s) => { try { s.stop() } catch {} })
    sfxSourceNodesRef.current = []
    setSpeaking(false)
    setLoadingAudio(false)
    setActiveWord(-1)
  }, [])

  const scenes = story?.scenes || []
  const current = scenes[scene]

  // continueReading=true means this advance came from narration finishing,
  // and should auto-play the new scene's narration too once it lands
  // (continuous audiobook-style playthrough). Manual next-button/arrow-key
  // presses call this with no argument, so they just move the page.
  // A scene is only "ready" once BOTH its image and its narration audio
  // exist — narration used to be generated live during playback (no image
  // check needed for it), but it's now pre-generated alongside the image at
  // creation time, so advancing needs to wait on both the same way.
  const isSceneReady = (sc) => !!(sc?.imageUrl || sc?.imageData) && !!sc?.narrationUrl

  const goNext = useCallback((continueReading = false) => {
    const nextIndex = scene + 1
    if (nextIndex >= scenes.length) { stopAudio(); return }
    const nextReady = isSceneReady(scenes[nextIndex])
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

  // Real browser Fullscreen API (hides the OS-level tab bar/URL bar) works
  // on Android Chrome and desktop browsers, but iOS Safari does not support
  // it for anything other than a <video> element — no JS workaround exists
  // for that platform restriction. This is a best-effort enhancement on top
  // of the CSS-only "projector" overlay, which is the most iOS can get.
  // Must be called directly inside a click handler — browsers require
  // fullscreen requests to originate from a genuine user gesture, so this
  // can't live in a useEffect reacting to state changes.
  const toggleProjector = useCallback(() => {
    setProjector(p => {
      const next = !p
      try {
        if (next && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {})
        } else if (!next && document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {})
        }
      } catch {}
      return next
    })
  }, [])

  // Once the scene we were waiting on actually becomes ready (via the
  // backfill poller updating `story`), complete the advance we held earlier.
  useEffect(() => {
    if (!waitingForNext) return
    const nextIndex = scene + 1
    const nextReady = isSceneReady(scenes[nextIndex])
    if (nextReady) {
      setWaitingForNext(false)
      if (pendingContinueRef.current) autoPlayNextRef.current = true
      pendingContinueRef.current = false
      setScene(nextIndex)
    }
  }, [story, waitingForNext, scene, scenes])

  // Plays a specific scene's audio given explicit data — deliberately NOT
  // tied to the `current`/`scene` closure, so this can be called directly
  // and synchronously from within the PREVIOUS scene's own onended handler
  // for the auto-continue case. That matters because every hop through
  // React (a state update, waiting for re-render, a useEffect firing)
  // is exactly the kind of indirection iOS Safari's autoplay heuristics
  // can treat as disconnected from the original tap and silently block.
  const playSceneAudio = useCallback((sceneIndex, sceneData, url) => {
    const myToken = ++playTokenRef.current
    const audio = new Audio(url)
    audioRef.current = audio
    setLoadingAudio(false)

    // SFX used to fire from setTimeout — a bare timer with no connection to
    // any actively-playing trusted audio, which is very plausibly why they
    // got silently blocked on mobile even after narration itself started
    // working (narration's play() is tied to a real gesture/media event;
    // setTimeout looks the same to the browser whether it followed one or
    // not). Tying each cue to this audio element's own timeupdate event
    // instead means every SFX play() call happens from inside a handler on
    // audio that's already trusted and actively playing — same underlying
    // fix as the narration chaining, applied to SFX. Scaled by actual
    // playback progress (currentTime/duration) rather than an estimated
    // words-per-second guess, so timing also tracks the real TTS speed
    // instead of an approximation.
    const sfxTimeline = buildSfxTimeline(sceneData.narration, sceneData.sfxCues)
    const totalWords = sceneData.narration.trim().split(/\s+/).length
    // Capped below 1.0 — a cue firing in the very last moment of narration
    // doesn't have time to finish before the scene transitions to the next
    // one, which was very likely why SFX sometimes sounded cut off when the
    // page turned on desktop.
    const MAX_CUE_FRACTION = 0.7
    const cueState = sfxTimeline.map(cue => ({ fraction: Math.min(cue.wordIndex / totalWords, MAX_CUE_FRACTION), sound: cue.sound, fired: false }))

    const wordTimings = buildWordTimings(sceneData.narration)
    const exactTimes = Array.isArray(sceneData.narrationWordTimes) && sceneData.narrationWordTimes.length === wordTimings.words.length
      ? sceneData.narrationWordTimes : null
    let lastWord = -1
    setActiveWord(-1)

    // Word highlight runs on its own per-frame loop. The audio element's
    // timeupdate event only fires about 4 times a second, which made the
    // highlight move in visible jumps; reading the playback position every
    // screen frame follows the voice smoothly. Uses exact word times from
    // story creation when the scene has them, else the length based estimate.
    // The loop ends by itself when playback is stopped or replaced (token).
    const highlightTick = () => {
      if (myToken !== playTokenRef.current) return
      if (audio.duration && !isNaN(audio.duration)) {
        let w
        if (exactTimes) {
          w = 0
          const t = audio.currentTime + 0.04
          while (w + 1 < exactTimes.length && exactTimes[w + 1] <= t) w++
        } else {
          w = wordIndexAt(wordTimings.ends, audio.currentTime / audio.duration)
        }
        if (w !== lastWord) { lastWord = w; setActiveWord(w) }
      }
      if (!audio.ended) requestAnimationFrame(highlightTick)
    }
    requestAnimationFrame(highlightTick)

    audio.ontimeupdate = () => {
      if (myToken !== playTokenRef.current) return
      if (!audio.duration || isNaN(audio.duration)) return
      const progress = audio.currentTime / audio.duration
      cueState.forEach(cue => {
        if (!cue.fired && progress >= cue.fraction) {
          cue.fired = true
          playSfx(cue.sound)
        }
      })
    }

    audio.onended = () => {
      if (myToken !== playTokenRef.current) return
      setSpeaking(false)
      setActiveWord(-1)

      const nextIndex = sceneIndex + 1
      if (nextIndex >= scenes.length) return
      const nextScene = scenes[nextIndex]

      if (isSceneReady(nextScene)) {
        // Everything's already ready — chain directly, still synchronously
        // inside this trusted onended callback. The visible page turn
        // happens in parallel via setScene, not gating playback on it.
        setScene(nextIndex)
        playSceneAudio(nextIndex, nextScene, nextScene.narrationUrl)
      } else {
        // Genuinely not ready yet (image and/or narration still
        // generating). Sync scene state to sceneIndex (the scene whose
        // audio just actually finished) before waiting, rather than calling
        // goNext() — goNext() derives "current scene" from React state,
        // which can lag behind what's actually playing when several scenes
        // have chained directly in rapid succession without React
        // re-rendering in between each one.
        stopAudio()
        setScene(sceneIndex)
        pendingContinueRef.current = true
        setWaitingForNext(true)
      }
    }
    audio.onerror = () => {
      if (myToken !== playTokenRef.current) return
      setSpeaking(false)
      setLoadingAudio(false)
    }

    // audio.play() returns a promise that silently rejects if the browser
    // blocks it — previously unchecked, which meant a blocked autoplay
    // looked identical to a successful one (UI said "playing", nothing was
    // actually audible, and it never recovered). Now it's reflected honestly.
    const playResult = audio.play()
    if (playResult?.then) {
      playResult
        .then(() => { if (myToken === playTokenRef.current) setSpeaking(true) })
        .catch((err) => {
          console.error('Playback blocked or failed:', err)
          if (myToken === playTokenRef.current) { setSpeaking(false); setLoadingAudio(false) }
        })
    } else {
      setSpeaking(true)
    }
  }, [scenes, playSfx, stopAudio])

  const playNarration = useCallback(() => {
    if (speaking || loadingAudio || !current?.narrationUrl) return
    // Unlocks the shared AudioContext used for SFX. This must happen here
    // (synchronously, before any await) rather than in a useEffect, because
    // every call path into playNarration ultimately traces back to a real
    // user gesture (a button click or the spacebar), and AudioContext only
    // grants "unlocked" status when resume() is called within that trusted
    // window. Once unlocked it stays unlocked for the rest of the page
    // session, so this only actually matters on the very first call.
    const ctx = getAudioContext()
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})

    // Narration is now a pre-generated, stored file — created once
    // alongside the scene's image at story-creation time, exactly like
    // images already work. There's no live TTS call here anymore: no
    // fetch, no cache, no rate limit to hit, and no fallback to a worse
    // browser voice, since there's nothing left that can fail at this
    // point — the file already exists or this scene isn't reachable yet
    // (see isSceneReady / the waiting states above).
    playSceneAudio(scene, current, current.narrationUrl)
  }, [current, speaking, loadingAudio, scene, playSceneAudio, getAudioContext])

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
      if (e.key === 'Escape') exitCinema()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev, speaking, stopAudio, playNarration, exitCinema])

  // Stop all audio on unmount
  useEffect(() => {
    return () => {
      stopAudio()
      stopAmbientSfx()
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
      }
    }
  }, [stopAudio])

  if (storyLoading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, minHeight: '100dvh', background: '#0d0b1a' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#7F77DD', animation: 'spin 1s linear infinite' }} />
    </div>
  )

  if (!story) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 40 }}>
      <p style={{ fontSize: 28 }}>📖</p>
      <p style={{ fontSize: 16, color: 'var(--text-muted)' }}>Story not found.</p>
      <button onClick={() => navigate('/')} style={{ color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>← Back home</button>
    </div>
  )

  // Never show a bare "no image yet" scene, including the very first one —
  // hold on a full-page loading state until scene 0's illustration exists.
  // Deliberately styled to match Create.jsx's loading screen (same floating
  // particles, bouncing emoji, rotating message) so this reads as one
  // continuous "your story is coming together" experience rather than two
  // different-looking loading screens back to back. Checked BEFORE the
  // orientation prompt below — there's no reason to tell someone to rotate
  // their device before there's anything ready for them to read yet.
  const scene0Ready = isSceneReady(scenes[0])
  if (!scene0Ready) {
    return <FinishingTouchesScreen title={story.title} onBack={() => navigate('/')} stuck={stuckSceneIndices.includes(0)} />
  }

  const progress = ((scene + 1) / scenes.length) * 100
  const readyCount = scenes.filter(isSceneReady).length

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

  // ---- One design for every screen: dark, with the picture softly blurred
  // behind. Wide screens (phone sideways, laptop, desktop) put the picture on
  // the left and the story on the right. Upright screens stack them. Turning
  // a phone sideways switches to the wide layout straight away.
  const goToScene = (i) => {
    const sc = scenes[i]
    if (sc && (sc.imageUrl || sc.imageData)) { stopAudio(); setWaitingForNext(false); setScene(i) }
  }
  const imgSrc = current?.imageUrl || (current?.imageData ? `data:${current.imageType || 'image/png'};base64,${current.imageData}` : null)
  const circleStyle = (size, disabled, dim) => ({
    width: size, height: size, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', border: '0.5px solid rgba(255,255,255,0.25)',
    color: 'white', fontSize: Math.round(size * 0.5), display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: dim ? 0.4 : 1, flexShrink: 0
  })
  const nextSpinner = <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.25)', borderTopColor: 'white', animation: 'spin 0.8s linear infinite' }} />
  const buttonsRow = (onReadAloud, size = 44) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <button onClick={goPrev} disabled={scene === 0} aria-label="Previous page" style={circleStyle(size, scene === 0, scene === 0)}>‹</button>
      <button
        onClick={onReadAloud}
        disabled={loadingAudio}
        style={{ background: speaking ? '#3C3489' : '#534AB7', border: 'none', borderRadius: 100, color: 'white', padding: `${Math.round(size * 0.27)}px ${Math.round(size * 0.55)}px`, fontSize: size >= 44 ? 15 : 14, fontWeight: 600, cursor: loadingAudio ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: loadingAudio ? 0.7 : 1, minWidth: size >= 44 ? 150 : 130 }}
      >
        {loadingAudio ? '⏳' : speaking ? '⏸ Stop' : '▶ Read aloud'}
      </button>
      <button onClick={() => goNext()} disabled={nextDisabled} aria-label="Next page" style={circleStyle(size, nextDisabled, nextIsLastAndUnreachable)}>
        {waitingForNext ? nextSpinner : '›'}
      </button>
    </div>
  )
  const dotsRow = (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
      {scenes.map((sc, i) => (
        <div key={i} onClick={() => goToScene(i)} style={{
          height: 6, borderRadius: 3, cursor: (sc.imageData || sc.imageUrl) ? 'pointer' : 'default', transition: 'all 0.2s',
          width: i === scene ? 18 : 6,
          background: i === scene ? '#7F77DD' : (sc.imageData || sc.imageUrl) ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)'
        }} />
      ))}
    </div>
  )
  const statusLine = waitingForNext ? (
    <p style={{ margin: 0, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
      {stuckSceneIndices.includes(scene + 1)
        ? 'This next page is taking much longer than expected, sorry about this'
        : 'Preparing the next page…'}
    </p>
  ) : null
  const barHintPill = barHint && (
    <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 3, background: 'rgba(0,0,0,0.75)', color: 'white', fontSize: 12, padding: '6px 14px', borderRadius: 100, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
      Swipe up to hide the browser bar
    </div>
  )
  const backdrop = imgSrc ? (
    <img src={imgSrc} alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(30px) brightness(0.4)', transform: 'scale(1.2)' }} />
  ) : null
  const pillButton = { background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: 8, color: 'rgba(255,255,255,0.8)', padding: '6px 11px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }
  const learningPill = (
    <button onClick={toggleReadingMode} aria-pressed={learningMode} title={learningMode ? 'Learning mode: words light up as they are read' : 'Regular mode: plain text'} style={{ ...pillButton, background: learningMode ? 'rgba(255,210,77,0.18)' : pillButton.background, border: learningMode ? '0.5px solid rgba(255,210,77,0.55)' : pillButton.border, color: learningMode ? '#ffd24d' : pillButton.color }}>
      {learningMode ? '🔤 Learning' : '📖 Regular'}
    </button>
  )
  const backButton = <button onClick={() => { stopAudio(); navigate(-1) }} style={pillButton}>← Back</button>
  const fullScreenButton = (
    <button onClick={cinema ? exitCinema : enterCinema} style={pillButton}>{cinema ? '✕ Exit' : '⛶ Full screen'}</button>
  )
  // Pressing Read aloud on a phone also goes full screen, like pressing play
  // on a video. On a computer it just plays.
  const onReadAloud = () => {
    if (speaking) { stopAudio(); return }
    if (isTouchDevice && !cinema) enterCinema()
    playNarration()
  }
  const rootStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, height: `${viewportH}px`, zIndex: 9999,
    background: '#05040c', overflow: 'hidden', display: 'flex', boxSizing: 'border-box',
    paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)',
  }
  const keyframes = (
    <style>{`
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes spin { to { transform: rotate(360deg); } }
    `}</style>
  )
  const narrationLen = (current?.narration || '').length

  // ---- Wide: picture left, story right ----
  if (landscape) {
    const vw = window.innerWidth
    const imgW = Math.min(viewportH, Math.round(vw * 0.56))
    const padX = isTouchDevice ? 20 : 40
    const textW = Math.max(120, vw - imgW - padX * 2)
    const textH = Math.max(60, viewportH - 190)
    const maxFs = isTouchDevice ? 22 : Math.max(22, Math.min(40, Math.round(viewportH / 20)))
    const fs = fitFontSize(narrationLen, textW, textH, maxFs)
    return (
      <div style={rootStyle}>
        {keyframes}
        {backdrop}
        {barHintPill}
        <div style={{ position: 'relative', width: imgW, height: '100%', flexShrink: 0, background: '#1a1830', overflow: 'hidden' }}>
          {imgSrc && <img key={scene} src={imgSrc} alt={`Scene ${scene + 1}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', animation: 'fadeIn 0.6s ease', display: 'block' }} />}
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: `10px ${padX}px 10px ${padX}px`, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, minHeight: 36 }}>
            {!cinema && backButton}
            <div style={{ flex: 1 }} />
            {learningPill}
            {fullScreenButton}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <p style={{ margin: '0 0 8px 0', fontSize: isTouchDevice ? 12 : 14, fontWeight: 700, color: 'rgba(255,255,255,0.65)', fontFamily: 'Georgia, serif', textTransform: 'uppercase', letterSpacing: 1 }}>{current?.chapter}</p>
            <p style={{ margin: 0, fontSize: fs, lineHeight: 1.55, color: '#fff', fontFamily: 'Georgia, serif', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
              <NarrationText text={current?.narration} learning={learningMode} activeIndex={activeWord} dark />
            </p>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {buttonsRow(onReadAloud, isTouchDevice ? 40 : 52)}
            {statusLine}
            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.12)' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: '#7F77DD', borderRadius: 2, transition: 'width 0.4s' }} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ---- Upright: picture on top, story under it, controls at the bottom ----
  const vw = window.innerWidth
  const fsUp = fitFontSize(narrationLen, vw - 40, Math.round(viewportH * 0.3), 19, 13)
  return (
    <div style={{ ...rootStyle, flexDirection: 'column', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {keyframes}
      {backdrop}
      {barHintPill}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', flexShrink: 0, background: 'rgba(0,0,0,0.35)' }}>
        {backButton}
        <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{story.title}</p>
        {learningPill}
        {fullScreenButton}
      </div>
      <div style={{ position: 'relative', flex: '1 1 0', minHeight: 120, background: '#1a1830', overflow: 'hidden' }}>
        {imgSrc && <img key={scene} src={imgSrc} alt={`Scene ${scene + 1}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', animation: 'fadeIn 0.6s ease', display: 'block' }} />}
      </div>
      <div style={{ position: 'relative', flexShrink: 0, padding: '14px 20px 10px', background: 'rgba(0,0,0,0.38)' }}>
        <p style={{ margin: '0 0 6px 0', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', fontFamily: 'Georgia, serif', textTransform: 'uppercase', letterSpacing: 1 }}>{current?.chapter}</p>
        <p style={{ margin: 0, fontSize: fsUp, lineHeight: 1.55, color: '#fff', fontFamily: 'Georgia, serif', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
          <NarrationText text={current?.narration} learning={learningMode} activeIndex={activeWord} dark />
        </p>
      </div>
      <div style={{ position: 'relative', flexShrink: 0, padding: '8px 10px 12px', display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(0,0,0,0.38)' }}>
        {dotsRow}
        {buttonsRow(onReadAloud, 44)}
        {statusLine}
      </div>
    </div>
  )
}
