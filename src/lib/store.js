import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
const save = (key, val) => localStorage.setItem(key, JSON.stringify(val))

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
    const existing = get().stories.find(s => s.id === story.id)
    const next = existing
      ? get().stories.map(s => s.id === story.id ? story : s)
      : [{ ...story, id: story.id || uuidv4(), createdAt: Date.now() }, ...get().stories]
    set({ stories: next })
    save('sd_stories', next)
    return next[0]?.id || story.id
  },
  deleteStory: (id) => {
    const next = get().stories.filter(s => s.id !== id)
    set({ stories: next })
    save('sd_stories', next)
  },
}))
