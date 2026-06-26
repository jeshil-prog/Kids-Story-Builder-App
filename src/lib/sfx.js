// One-shot sound effects triggered at specific moments during narration
// All synthesised via Web Audio API — no external files needed

let audioCtx = null

function getCtx() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function playSound(fn) {
  try {
    const ctx = getCtx()
    fn(ctx)
  } catch (err) {
    console.error('SFX error:', err)
  }
}

// --- SOUND DEFINITIONS ---

const SOUNDS = {
  birds: (ctx) => {
    // 3 quick chirps
    [0, 0.18, 0.36].forEach(delay => {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(2800 + Math.random()*400, ctx.currentTime + delay)
      osc.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + delay + 0.1)
      env.gain.setValueAtTime(0, ctx.currentTime + delay)
      env.gain.linearRampToValueAtTime(0.3, ctx.currentTime + delay + 0.02)
      env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.12)
      osc.connect(env)
      env.connect(ctx.destination)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + 0.15)
    })
  },

  wind: (ctx) => {
    const bufferSize = ctx.sampleRate * 1.5
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 800
    filter.Q.value = 0.5
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, ctx.currentTime)
    env.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.3)
    env.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.9)
    env.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5)
    src.connect(filter); filter.connect(env); env.connect(ctx.destination)
    src.start(); src.stop(ctx.currentTime + 1.5)
  },

  rain: (ctx) => {
    const bufferSize = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'; filter.frequency.value = 2000
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, ctx.currentTime)
    env.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.2)
    env.gain.setValueAtTime(0.25, ctx.currentTime + 1.5)
    env.gain.linearRampToValueAtTime(0, ctx.currentTime + 2)
    src.connect(filter); filter.connect(env); env.connect(ctx.destination)
    src.start(); src.stop(ctx.currentTime + 2)
  },

  thunder: (ctx) => {
    const bufferSize = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'; filter.frequency.value = 200
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.8, ctx.currentTime)
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2)
    src.connect(filter); filter.connect(env); env.connect(ctx.destination)
    src.start(); src.stop(ctx.currentTime + 2)
  },

  magic: (ctx) => {
    // Ascending sparkle arpeggio
    const notes = [523, 659, 784, 1047, 1319, 1568]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      const t = ctx.currentTime + i * 0.07
      osc.type = 'sine'; osc.frequency.value = freq
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(0.2, t + 0.03)
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
      osc.connect(env); env.connect(ctx.destination)
      osc.start(t); osc.stop(t + 0.3)
    })
  },

  sparkle: (ctx) => {
    // Short high shimmer
    for (let i = 0; i < 5; i++) {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      const t = ctx.currentTime + i * 0.04
      osc.type = 'sine'
      osc.frequency.value = 2000 + Math.random() * 2000
      env.gain.setValueAtTime(0.15, t)
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
      osc.connect(env); env.connect(ctx.destination)
      osc.start(t); osc.stop(t + 0.18)
    }
  },

  ocean: (ctx) => {
    // Wave crash
    const bufferSize = ctx.sampleRate * 2.5
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let b = 0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      b = 0.98 * b + white * 0.02
      data[i] = b
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'; filter.frequency.value = 500; filter.Q.value = 0.3
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, ctx.currentTime)
    env.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.4)
    env.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 1.2)
    env.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.5)
    src.connect(filter); filter.connect(env); env.connect(ctx.destination)
    src.start(); src.stop(ctx.currentTime + 2.5)
  },

  splash: (ctx) => {
    const bufferSize = ctx.sampleRate * 0.8
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'; filter.frequency.value = 1500; filter.Q.value = 1
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.4, ctx.currentTime)
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
    src.connect(filter); filter.connect(env); env.connect(ctx.destination)
    src.start(); src.stop(ctx.currentTime + 0.8)
  },

  jungle: (ctx) => {
    // Monkey call + rustling
    SOUNDS.rustle(ctx)
    setTimeout(() => {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(600, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.3)
      env.gain.setValueAtTime(0.2, ctx.currentTime)
      env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      osc.connect(env); env.connect(ctx.destination)
      osc.start(); osc.stop(ctx.currentTime + 0.4)
    }, 200)
  },

  footsteps: (ctx) => {
    [0, 0.35, 0.7].forEach(delay => {
      const bufferSize = Math.floor(ctx.sampleRate * 0.08)
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i/bufferSize)
      const src = ctx.createBufferSource()
      src.buffer = buffer
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'; filter.frequency.value = 400
      const env = ctx.createGain(); env.gain.value = 0.4
      src.connect(filter); filter.connect(env); env.connect(ctx.destination)
      src.start(ctx.currentTime + delay)
    })
  },

  gasp: (ctx) => {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(300, ctx.currentTime)
    osc.frequency.linearRampToValueAtTime(500, ctx.currentTime + 0.15)
    env.gain.setValueAtTime(0, ctx.currentTime)
    env.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05)
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
    osc.connect(env); env.connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 0.25)
  },

  laugh: (ctx) => {
    ['ha','ha','ha'].forEach((_, i) => {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      const t = ctx.currentTime + i * 0.15
      osc.type = 'sine'
      osc.frequency.value = 350 + i * 20
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(0.15, t + 0.04)
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
      osc.connect(env); env.connect(ctx.destination)
      osc.start(t); osc.stop(t + 0.15)
    })
  },

  whoosh: (ctx) => {
    const bufferSize = ctx.sampleRate * 0.6
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(200, ctx.currentTime)
    filter.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 0.3)
    filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.6)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, ctx.currentTime)
    env.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.15)
    env.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6)
    src.connect(filter); filter.connect(env); env.connect(ctx.destination)
    src.start(); src.stop(ctx.currentTime + 0.6)
  },

  fanfare: (ctx) => {
    const notes = [523, 659, 784, 1047]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      const t = ctx.currentTime + i * 0.12
      osc.type = 'triangle'; osc.frequency.value = freq
      env.gain.setValueAtTime(0.2, t)
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
      osc.connect(env); env.connect(ctx.destination)
      osc.start(t); osc.stop(t + 0.45)
    })
  },

  rustle: (ctx) => {
    const bufferSize = ctx.sampleRate * 0.5
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'; filter.frequency.value = 3000
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, ctx.currentTime)
    env.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.1)
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    src.connect(filter); filter.connect(env); env.connect(ctx.destination)
    src.start(); src.stop(ctx.currentTime + 0.5)
  },

  knock: (ctx) => {
    [0, 0.25].forEach(delay => {
      const bufferSize = Math.floor(ctx.sampleRate * 0.06)
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3))
      const src = ctx.createBufferSource()
      src.buffer = buffer
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'; filter.frequency.value = 300
      const env = ctx.createGain(); env.gain.value = 0.6
      src.connect(filter); filter.connect(env); env.connect(ctx.destination)
      src.start(ctx.currentTime + delay)
    })
  },

  creaking: (ctx) => {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(150, ctx.currentTime)
    osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.8)
    env.gain.setValueAtTime(0.15, ctx.currentTime)
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9)
    osc.connect(env); env.connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 0.9)
  },

  growl: (ctx) => {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = 'sawtooth'; osc.frequency.value = 80
    env.gain.setValueAtTime(0, ctx.currentTime)
    env.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.1)
    env.gain.setValueAtTime(0.25, ctx.currentTime + 0.5)
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
    osc.connect(env); env.connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 0.85)
  },

  chime: (ctx) => {
    const freq = 880
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = 'sine'; osc.frequency.value = freq
    env.gain.setValueAtTime(0.3, ctx.currentTime)
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2)
    osc.connect(env); env.connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 1.25)
    // Add harmonic
    const osc2 = ctx.createOscillator()
    const env2 = ctx.createGain()
    osc2.type = 'sine'; osc2.frequency.value = freq * 2.76
    env2.gain.setValueAtTime(0.1, ctx.currentTime)
    env2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
    osc2.connect(env2); env2.connect(ctx.destination)
    osc2.start(); osc2.stop(ctx.currentTime + 0.85)
  },

  fire: (ctx) => {
    const bufferSize = ctx.sampleRate * 1.5
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'; filter.frequency.value = 600; filter.Q.value = 0.5
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, ctx.currentTime)
    env.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.3)
    env.gain.setValueAtTime(0.2, ctx.currentTime + 1.0)
    env.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5)
    src.connect(filter); filter.connect(env); env.connect(ctx.destination)
    src.start(); src.stop(ctx.currentTime + 1.5)
  }
}

// Play a one-shot sound effect by name
export function playSfx(soundName) {
  if (!soundName || !SOUNDS[soundName]) return
  playSound(SOUNDS[soundName])
}

// Parse sfxCues from scene and return an array of {wordIndex, sound}
// triggerPhrase is matched against the narration to find word position
export function buildSfxTimeline(narration, sfxCues) {
  if (!narration || !sfxCues?.length) return []
  const words = narration.split(/\s+/)
  const timeline = []

  for (const cue of sfxCues) {
    if (!cue.triggerPhrase || !cue.sound) continue
    const phraseWords = cue.triggerPhrase.toLowerCase().split(/\s+/)
    const firstWord = phraseWords[0]

    // Find the word index where this phrase starts
    for (let i = 0; i < words.length; i++) {
      const clean = words[i].toLowerCase().replace(/[^a-z]/g, '')
      if (clean === firstWord.replace(/[^a-z]/g, '')) {
        // Verify next words match too
        let match = true
        for (let j = 1; j < Math.min(phraseWords.length, 3); j++) {
          const nextClean = (words[i+j] || '').toLowerCase().replace(/[^a-z]/g, '')
          if (nextClean !== phraseWords[j].replace(/[^a-z]/g, '')) {
            match = false; break
          }
        }
        if (match) {
          timeline.push({ wordIndex: i, sound: cue.sound })
          break
        }
      }
    }
  }

  return timeline.sort((a, b) => a.wordIndex - b.wordIndex)
}

// Stop any ongoing audio context
export function stopAmbientSfx() {
  if (audioCtx) {
    try { audioCtx.close() } catch {}
    audioCtx = null
  }
}

export function playAmbientSfx() {}
export function fadeOutAmbient() {}
export function getSfxForScene() { return null }
