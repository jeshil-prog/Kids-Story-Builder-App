// Sound effects — free royalty-free sounds from Pixabay CDN
const SFX_LIBRARY = {
  ocean:       'https://cdn.pixabay.com/audio/2022/03/10/audio_8b56e1c352.mp3',
  waves:       'https://cdn.pixabay.com/audio/2022/03/10/audio_8b56e1c352.mp3',
  jungle:      'https://cdn.pixabay.com/audio/2022/03/15/audio_c8c8a73467.mp3',
  forest:      'https://cdn.pixabay.com/audio/2022/03/15/audio_c8c8a73467.mp3',
  birds:       'https://cdn.pixabay.com/audio/2022/03/09/audio_c3f0c1c90a.mp3',
  wind:        'https://cdn.pixabay.com/audio/2022/01/18/audio_d0c6ff1a93.mp3',
  rain:        'https://cdn.pixabay.com/audio/2022/05/13/audio_1808fbf07a.mp3',
  thunder:     'https://cdn.pixabay.com/audio/2022/03/19/audio_808cbed7b0.mp3',
  fire:        'https://cdn.pixabay.com/audio/2022/01/13/audio_6b3ebbfc37.mp3',
  magic:       'https://cdn.pixabay.com/audio/2022/03/15/audio_3e0e9cf7c5.mp3',
  sparkle:     'https://cdn.pixabay.com/audio/2022/03/15/audio_3e0e9cf7c5.mp3',
  space:       'https://cdn.pixabay.com/audio/2022/08/04/audio_2dde668d05.mp3',
  adventure:   'https://cdn.pixabay.com/audio/2022/10/30/audio_946c7d9dfa.mp3',
  happy:       'https://cdn.pixabay.com/audio/2022/10/30/audio_946c7d9dfa.mp3',
  mystery:     'https://cdn.pixabay.com/audio/2022/03/15/audio_8169b0f903.mp3',
  night:       'https://cdn.pixabay.com/audio/2021/09/06/audio_3df8fd4b4e.mp3',
  underwater:  'https://cdn.pixabay.com/audio/2022/03/10/audio_8b56e1c352.mp3',
  cave:        'https://cdn.pixabay.com/audio/2022/03/19/audio_808cbed7b0.mp3',
  celebration: 'https://cdn.pixabay.com/audio/2021/08/09/audio_dc39bde4b4.mp3',
  victory:     'https://cdn.pixabay.com/audio/2021/08/09/audio_dc39bde4b4.mp3',
}

// Fallback keyword matching for older stories without sfx field
const KEYWORD_MAP = [
  { keywords: ['ocean', 'sea', 'beach', 'waves', 'shore', 'sailing', 'boat', 'fish', 'turtle', 'coral'], sfx: 'ocean' },
  { keywords: ['jungle', 'forest', 'trees', 'vines', 'animals', 'wild'], sfx: 'jungle' },
  { keywords: ['space', 'stars', 'rocket', 'galaxy', 'planet', 'astronaut'], sfx: 'space' },
  { keywords: ['magic', 'sparkle', 'glow', 'shimmer', 'wizard', 'spell', 'enchant', 'fairy'], sfx: 'magic' },
  { keywords: ['cave', 'dark', 'tunnel', 'underground', 'echo'], sfx: 'cave' },
  { keywords: ['rain', 'storm', 'puddle', 'drizzle'], sfx: 'rain' },
  { keywords: ['thunder', 'lightning', 'rumble'], sfx: 'thunder' },
  { keywords: ['fire', 'flame', 'campfire', 'burning'], sfx: 'fire' },
  { keywords: ['wind', 'breeze', 'blowing', 'gust'], sfx: 'wind' },
  { keywords: ['night', 'moon', 'sleep', 'dream', 'quiet', 'dark'], sfx: 'night' },
  { keywords: ['birds', 'chirping', 'morning', 'dawn'], sfx: 'birds' },
  { keywords: ['swim', 'splash', 'underwater', 'diving', 'reef'], sfx: 'underwater' },
  { keywords: ['treasure', 'found', 'hooray', 'cheered', 'celebrated', 'victory'], sfx: 'celebration' },
  { keywords: ['mystery', 'secret', 'hidden', 'strange', 'clue', 'map'], sfx: 'mystery' },
]

// Get SFX URL for a scene — uses Claude-assigned sfx first, then keyword fallback, then adventure default
export function getSfxForScene(scene) {
  // Use the sfx field Claude assigned during story generation
  if (scene?.sfx && SFX_LIBRARY[scene.sfx]) {
    return SFX_LIBRARY[scene.sfx]
  }

  // Fallback: keyword match on narration
  if (scene?.narration) {
    const lower = scene.narration.toLowerCase()
    for (const { keywords, sfx } of KEYWORD_MAP) {
      if (keywords.some(k => lower.includes(k))) {
        return SFX_LIBRARY[sfx]
      }
    }
  }

  // Final fallback: always return something
  return SFX_LIBRARY.adventure
}

let currentAmbient = null
let currentAmbientUrl = null

export function playAmbientSfx(url, volume = 0.12) {
  if (!url) return stopAmbientSfx()
  if (currentAmbientUrl === url && currentAmbient && !currentAmbient.paused) return

  stopAmbientSfx()
  try {
    const audio = new Audio(url)
    audio.loop = true
    audio.volume = volume
    audio.play().catch(() => {})
    currentAmbient = audio
    currentAmbientUrl = url
  } catch {}
}

export function stopAmbientSfx() {
  if (currentAmbient) {
    currentAmbient.pause()
    currentAmbient = null
    currentAmbientUrl = null
  }
}

export function fadeOutAmbient(duration = 800) {
  if (!currentAmbient) return
  const audio = currentAmbient
  const startVol = audio.volume
  const steps = 16
  const interval = duration / steps
  let step = 0
  const fade = setInterval(() => {
    step++
    audio.volume = Math.max(0, startVol * (1 - step / steps))
    if (step >= steps) {
      clearInterval(fade)
      audio.pause()
      if (currentAmbient === audio) { currentAmbient = null; currentAmbientUrl = null }
    }
  }, interval)
}
