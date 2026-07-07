import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

// Safe localStorage save — strips large base64 data to avoid quota errors
const saveCharacters = (chars) => {
  try {
    // Strip photo base64 before saving — keep only the small thumbnail data URL
    const slim = chars.map(c => ({
      ...c,
      photoBase64: undefined,  // don't store raw base64
      photo: c.photo ? c.photo.slice(0, 2000) : null  // keep tiny thumbnail only
    }))
    localStorage.setItem('sd_characters', JSON.stringify(slim))
  } catch (e) {
    console.warn('Could not save characters:', e.message)
  }
}

const saveStories = (stories) => {
  try {
    // Strip scene images from story list — stored separately
    const slim = stories.map(s => ({
      ...s,
      characters: s.characters?.map(c => ({
        ...c,
        photo: null,
        photoBase64: undefined
      })),
      scenes: s.scenes?.map(({ imageData, imageType, ...rest }) => rest)
    }))
    localStorage.setItem('sd_stories', JSON.stringify(slim))
  } catch (e) {
    console.warn('Could not save stories:', e.message)
    // If still failing, clear old stories and try with just the newest
    try {
      localStorage.removeItem('sd_stories')
    } catch {}
  }
}

const loadImages = (storyId, scenes) => {
  return scenes.map((scene, i) => {
    // If scene already has S3 imageUrl, use it — no need to load from localStorage
    if (scene.imageUrl) return scene
    // Fall back to legacy localStorage base64 images
    try {
      const raw = localStorage.getItem(`sd_img_${storyId}_${i}`)
      if (raw) {
        const { imageData, imageType } = JSON.parse(raw)
        return { ...scene, imageData, imageType }
      }
    } catch {}
    return scene
  })
}

const deleteImages = (storyId, sceneCount = 20) => {
  for (let i = 0; i < sceneCount; i++) {
    try { localStorage.removeItem(`sd_img_${storyId}_${i}`) } catch {}
  }
}

const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}

export const useStore = create((set, get) => ({
  characters: load('sd_characters', []),
  stories: load('sd_stories', []),

  addCharacter: (char) => {
    const next = [...get().characters, { ...char, id: uuidv4() }]
    set({ characters: next })  // keep photoBase64 in memory
    saveCharacters(next)       // strips photoBase64 for localStorage
  },
  updateCharacter: (id, patch) => {
    const next = get().characters.map(c => c.id === id ? { ...c, ...patch } : c)
    set({ characters: next })  // keep photoBase64 in memory
    saveCharacters(next)       // strips photoBase64 for localStorage
  },
  deleteCharacter: (id) => {
    const next = get().characters.filter(c => c.id !== id)
    set({ characters: next })
    saveCharacters(next)
  },

  saveStory: (story) => {
    const id = story.id || uuidv4()

    // Save each scene image separately
    if (story.scenes) {
      story.scenes.forEach((scene, i) => {
        if (scene.imageData) {
          try {
            localStorage.setItem(`sd_img_${id}_${i}`, JSON.stringify({
              imageData: scene.imageData,
              imageType: scene.imageType || 'image/jpeg'
            }))
          } catch { /* image won't persist but story still works */ }
        }
      })
    }

    const existing = get().stories.find(s => s.id === id)
    const storyMeta = { ...story, id, createdAt: story.createdAt || Date.now() }
    const next = existing
      ? get().stories.map(s => s.id === id ? storyMeta : s)
      : [storyMeta, ...get().stories]

    set({ stories: next })
    saveStories(next)
    return id
  },

  getStory: (id) => {
    const story = get().stories.find(s => s.id === id)
    if (!story) return null
    return {
      ...story,
      scenes: loadImages(id, story.scenes || [])
    }
  },

  deleteStory: (id) => {
    const story = get().stories.find(s => s.id === id)
    deleteImages(id, story?.scenes?.length)
    const next = get().stories.filter(s => s.id !== id)
    set({ stories: next })
    saveStories(next)
  }
}))
