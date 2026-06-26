import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}

// Safe save — catches QuotaExceededError
const save = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val))
    return true
  } catch (e) {
    console.error('localStorage save failed:', e)
    return false
  }
}

// Save images separately by storyId+sceneIndex to avoid one giant blob
const saveImages = (storyId, scenes) => {
  scenes.forEach((scene, i) => {
    if (scene.imageData) {
      try {
        localStorage.setItem(`sd_img_${storyId}_${i}`, JSON.stringify({
          imageData: scene.imageData,
          imageType: scene.imageType || 'image/jpeg'
        }))
      } catch {
        // image won't be saved — story still loads without it
      }
    }
  })
}

const loadImages = (storyId, scenes) => {
  return scenes.map((scene, i) => {
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

const deleteImages = (storyId, sceneCount) => {
  for (let i = 0; i < (sceneCount || 20); i++) {
    localStorage.removeItem(`sd_img_${storyId}_${i}`)
  }
}

export const useStore = create((set, get) => ({
  characters: load('sd_characters', []),
  stories: load('sd_stories', []),

  addCharacter: (char) => {
    const next = [...get().characters, { ...char, id: uuidv4() }]
    set({ characters: next })
    save('sd_characters', next)
  },
  updateCharacter: (id, patch) => {
    const next = get().characters.map(c => c.id === id ? { ...c, ...patch } : c)
    set({ characters: next })
    save('sd_characters', next)
  },
  deleteCharacter: (id) => {
    const next = get().characters.filter(c => c.id !== id)
    set({ characters: next })
    save('sd_characters', next)
  },

  saveStory: (story) => {
    const id = story.id || uuidv4()

    // Save images separately
    if (story.scenes) saveImages(id, story.scenes)

    // Save story metadata WITHOUT image data (keeps it small)
    const storyMeta = {
      ...story,
      id,
      createdAt: story.createdAt || Date.now(),
      scenes: story.scenes?.map(s => {
        const { imageData, imageType, ...rest } = s
        return rest
      })
    }

    const existing = get().stories.find(s => s.id === id)
    const next = existing
      ? get().stories.map(s => s.id === id ? storyMeta : s)
      : [storyMeta, ...get().stories]

    set({ stories: next })
    save('sd_stories', next)
    return id
  },

  // Load a story and rehydrate its images
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
    save('sd_stories', next)
  },
}))
