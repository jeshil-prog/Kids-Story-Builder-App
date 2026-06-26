// Browser-synthesised ambient sound effects using Web Audio API
// No external files, no CDN, no blocking — works everywhere

let audioCtx = null
let currentNodes = []
let masterGain = null

function getCtx() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    masterGain = audioCtx.createGain()
    masterGain.gain.value = 0.18
    masterGain.connect(audioCtx.destination)
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function stopAll() {
  currentNodes.forEach(n => { try { n.stop(); n.disconnect() } catch {} })
  currentNodes = []
}

// Pink noise generator (used for ocean, wind, rain)
function createNoise(ctx, type = 'pink') {
  const bufferSize = ctx.sampleRate * 2
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1
    if (type === 'pink') {
      b0 = 0.99886*b0 + white*0.0555179
      b1 = 0.99332*b1 + white*0.0750759
      b2 = 0.96900*b2 + white*0.1538520
      b3 = 0.86650*b3 + white*0.3104856
      b4 = 0.55000*b4 + white*0.5329522
      b5 = -0.7616*b5 - white*0.0168980
      data[i] = (b0+b1+b2+b3+b4+b5+b6 + white*0.5362) * 0.11
      b6 = white * 0.115926
    } else {
      data[i] = white * 0.5
    }
  }
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  return src
}

// Oscillator with LFO modulation
function createOsc(ctx, freq, type = 'sine', lfoFreq = 0, lfoDepth = 0) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.value = freq
  if (lfoFreq > 0) {
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.value = lfoFreq
    lfoGain.gain.value = lfoDepth
    lfo.connect(lfoGain)
    lfoGain.connect(osc.frequency)
    lfo.start()
    currentNodes.push(lfo)
  }
  return osc
}

// SOUND SYNTHESISERS

function playOcean(ctx, out) {
  // Pink noise filtered to sound like waves
  const noise = createNoise(ctx, 'pink')
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 400
  filter.Q.value = 0.5

  // LFO for wave rhythm
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  lfo.frequency.value = 0.15
  lfoGain.gain.value = 0.4
  const ampGain = ctx.createGain()
  ampGain.gain.value = 0.6

  lfo.connect(lfoGain)
  lfoGain.connect(ampGain.gain)
  noise.connect(filter)
  filter.connect(ampGain)
  ampGain.connect(out)

  noise.start(); lfo.start()
  currentNodes.push(noise, lfo)
}

function playJungle(ctx, out) {
  // Low rumble + periodic bird-like chirps
  const noise = createNoise(ctx, 'pink')
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 300
  const g = ctx.createGain(); g.gain.value = 0.3
  noise.connect(filter); filter.connect(g); g.connect(out)
  noise.start(); currentNodes.push(noise)

  // Chirp pattern
  function chirp() {
    if (!audioCtx || audioCtx.state === 'closed') return
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(2400 + Math.random()*800, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.08)
    env.gain.setValueAtTime(0, ctx.currentTime)
    env.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.02)
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
    osc.connect(env); env.connect(out)
    osc.start(); osc.stop(ctx.currentTime + 0.15)
    const delay = 0.8 + Math.random() * 2.5
    setTimeout(chirp, delay * 1000)
  }
  setTimeout(chirp, 500)
}

function playMagic(ctx, out) {
  // Shimmering high tones
  const freqs = [523, 659, 784, 1047, 1319]
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const lfo = ctx.createOscillator()
    const lfoG = ctx.createGain()
    lfo.frequency.value = 0.3 + i * 0.15
    lfoG.gain.value = 0.04
    lfo.connect(lfoG); lfoG.connect(g.gain)
    g.gain.value = 0.06
    osc.connect(g); g.connect(out)
    osc.start(); lfo.start()
    currentNodes.push(osc, lfo)
  })
  // Soft noise underneath
  const noise = createNoise(ctx, 'pink')
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000
  const g2 = ctx.createGain(); g2.gain.value = 0.04
  noise.connect(f); f.connect(g2); g2.connect(out)
  noise.start(); currentNodes.push(noise)
}

function playSpace(ctx, out) {
  // Deep drone with slow modulation
  const freqs = [55, 82, 110]
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const lfo = ctx.createOscillator()
    const lfoG = ctx.createGain()
    lfo.frequency.value = 0.05 + i * 0.03
    lfoG.gain.value = 3
    lfo.connect(lfoG); lfoG.connect(osc.frequency)
    const g = ctx.createGain(); g.gain.value = 0.08
    osc.connect(g); g.connect(out)
    osc.start(); lfo.start()
    currentNodes.push(osc, lfo)
  })
}

function playNight(ctx, out) {
  // Crickets + soft wind
  const noise = createNoise(ctx, 'pink')
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 200; f.Q.value = 0.3
  const g = ctx.createGain(); g.gain.value = 0.15
  noise.connect(f); f.connect(g); g.connect(out)
  noise.start(); currentNodes.push(noise)

  function cricket() {
    if (!audioCtx || audioCtx.state === 'closed') return
    for (let j = 0; j < 3; j++) {
      setTimeout(() => {
        const osc = ctx.createOscillator()
        const env = ctx.createGain()
        osc.frequency.value = 4200 + Math.random() * 200
        osc.type = 'square'
        env.gain.setValueAtTime(0.04, ctx.currentTime)
        env.gain.setValueAtTime(0, ctx.currentTime + 0.06)
        osc.connect(env); env.connect(out)
        osc.start(); osc.stop(ctx.currentTime + 0.07)
      }, j * 80)
    }
    setTimeout(cricket, 600 + Math.random() * 800)
  }
  setTimeout(cricket, 300)
}

function playWind(ctx, out) {
  const noise = createNoise(ctx, 'pink')
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.8
  const lfo = ctx.createOscillator()
  const lfoG = ctx.createGain()
  lfo.frequency.value = 0.08; lfoG.gain.value = 0.35
  const g = ctx.createGain(); g.gain.value = 0.5
  lfo.connect(lfoG); lfoG.connect(g.gain)
  noise.connect(f); f.connect(g); g.connect(out)
  noise.start(); lfo.start(); currentNodes.push(noise, lfo)
}

function playRain(ctx, out) {
  const noise = createNoise(ctx, 'white')
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1000
  const g = ctx.createGain(); g.gain.value = 0.25
  noise.connect(f); f.connect(g); g.connect(out)
  noise.start(); currentNodes.push(noise)
}

function playCave(ctx, out) {
  const noise = createNoise(ctx, 'pink')
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 150
  const g = ctx.createGain(); g.gain.value = 0.2
  noise.connect(f); f.connect(g); g.connect(out)
  noise.start(); currentNodes.push(noise)

  const osc = ctx.createOscillator()
  const og = ctx.createGain(); og.gain.value = 0.04
  osc.frequency.value = 60; osc.type = 'sine'
  osc.connect(og); og.connect(out); osc.start(); currentNodes.push(osc)
}

function playCelebration(ctx, out) {
  const notes = [523, 659, 784, 1047]
  notes.forEach((freq, i) => {
    setTimeout(() => {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.frequency.value = freq; osc.type = 'triangle'
      env.gain.setValueAtTime(0.15, ctx.currentTime)
      env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.connect(env); env.connect(out)
      osc.start(); osc.stop(ctx.currentTime + 0.45)
    }, i * 120)
  })
  // Then loop a gentle shimmer
  setTimeout(() => playMagic(ctx, out), 600)
}

function playAdventure(ctx, out) {
  // Heroic low drone
  const freqs = [110, 165, 220]
  freqs.forEach(freq => {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'; osc.frequency.value = freq
    const g = ctx.createGain(); g.gain.value = 0.06
    osc.connect(g); g.connect(out); osc.start(); currentNodes.push(osc)
  })
  // Some wind underneath
  playWind(ctx, out)
}

function playMystery(ctx, out) {
  const freqs = [130, 174, 196]
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'; osc.frequency.value = freq
    const lfo = ctx.createOscillator()
    const lfoG = ctx.createGain()
    lfo.frequency.value = 0.1 + i*0.07; lfoG.gain.value = 0.05
    lfo.connect(lfoG); lfoG.connect(osc.frequency)
    const g = ctx.createGain(); g.gain.value = 0.07
    osc.connect(g); g.connect(out); osc.start(); lfo.start()
    currentNodes.push(osc, lfo)
  })
}

const SYNTH_MAP = {
  ocean: playOcean, waves: playOcean, underwater: playOcean,
  jungle: playJungle, forest: playJungle, birds: playJungle,
  magic: playMagic, sparkle: playMagic,
  space: playSpace, night: playNight,
  wind: playWind, rain: playRain, thunder: playWind,
  fire: playWind, cave: playCave,
  celebration: playCelebration, victory: playCelebration, happy: playCelebration,
  adventure: playAdventure, mystery: playMystery,
}

const KEYWORD_MAP = [
  { keywords: ['ocean','sea','beach','waves','shore','sailing','boat','fish','turtle','coral','swim','splash'], sfx: 'ocean' },
  { keywords: ['jungle','forest','trees','vines','animals','wild','parrot','monkey'], sfx: 'jungle' },
  { keywords: ['space','stars','rocket','galaxy','planet','astronaut','floating'], sfx: 'space' },
  { keywords: ['magic','sparkle','glow','shimmer','wizard','spell','enchant','fairy','glowing','magical'], sfx: 'magic' },
  { keywords: ['cave','dark','tunnel','underground','echo','dripping'], sfx: 'cave' },
  { keywords: ['rain','storm','puddle','drizzle','thunder','lightning'], sfx: 'rain' },
  { keywords: ['wind','breeze','blowing','gust'], sfx: 'wind' },
  { keywords: ['night','moon','quiet','dark','sleep','dream','stars'], sfx: 'night' },
  { keywords: ['treasure','found','hooray','cheered','celebrated','victory','discovery'], sfx: 'celebration' },
  { keywords: ['mystery','secret','hidden','strange','clue','map','mysterious'], sfx: 'mystery' },
  { keywords: ['adventure','journey','quest','explore'], sfx: 'adventure' },
]

export function getSfxForScene(scene) {
  if (scene?.sfx && SYNTH_MAP[scene.sfx]) return scene.sfx
  if (scene?.narration) {
    const lower = scene.narration.toLowerCase()
    for (const { keywords, sfx } of KEYWORD_MAP) {
      if (keywords.some(k => lower.includes(k))) return sfx
    }
  }
  return 'adventure'
}

export function playAmbientSfx(sfxKey) {
  if (!sfxKey) return
  try {
    stopAll()
    const ctx = getCtx()
    const synthFn = SYNTH_MAP[sfxKey]
    if (synthFn) synthFn(ctx, masterGain)
  } catch (err) {
    console.error('SFX error:', err)
  }
}

export function stopAmbientSfx() {
  stopAll()
  if (masterGain) {
    try { masterGain.disconnect() } catch {}
  }
  masterGain = null
  if (audioCtx) {
    try { audioCtx.close() } catch {}
    audioCtx = null
  }
}

export function fadeOutAmbient(duration = 800) {
  if (!masterGain || !audioCtx) return
  const g = masterGain
  g.gain.setValueAtTime(g.gain.value, audioCtx.currentTime)
  g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration / 1000)
  setTimeout(() => stopAmbientSfx(), duration + 100)
}
