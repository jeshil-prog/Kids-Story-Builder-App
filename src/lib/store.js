import { create } from 'zustand'
import { supabase } from './supabaseClient'

// --- field mapping helpers -------------------------------------------------
// The rest of the app reads/writes characters and stories using the same
// camelCase shape it always has (c.photoUrl, s.createdAt, etc). Supabase's
// Postgres columns are snake_case. Mapping happens only here, once, so nothing
// else in the app needs to change how it accesses these objects.

const characterFromRow = (row) => ({
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
  age: row.age,
  role: row.role,
  personality: row.personality,
  photoUrl: row.photo_url,
  description: row.description,
  createdAt: row.created_at
})

const characterToRow = (char, ownerId) => ({
  owner_id: ownerId,
  name: char.name,
  age: char.age || null,
  role: char.role || null,
  personality: char.personality || null,
  photo_url: char.photoUrl || null,
  description: char.description || null
})

const storyFromRow = (row) => ({
  id: row.id,
  ownerId: row.owner_id,
  title: row.title,
  tagline: row.tagline,
  genre: row.genre,
  style: row.style,
  scenes: row.scenes || [],
  characters: row.characters || [],
  createdAt: row.created_at
})

// -----------------------------------------------------------------------

export const useStore = create((set, get) => ({
  characters: [],
  stories: [],
  userId: null,
  initialized: false,

  // Called once auth resolves (see AuthContext-driven effect in App.jsx).
  // Fetches everything this user can see — own characters AND, thanks to
  // Row Level Security, any accepted connection's characters too, with no
  // extra query needed for that: the database filters it for us.
  init: async (userId) => {
    if (!userId) {
      set({ characters: [], stories: [], userId: null, initialized: true })
      return
    }
    set({ userId })
    const [{ data: characters, error: charErr }, { data: stories, error: storyErr }] = await Promise.all([
      supabase.from('characters').select('*').order('created_at', { ascending: false }),
      supabase.from('stories').select('*').eq('owner_id', userId).order('created_at', { ascending: false })
    ])
    if (charErr) console.error('Failed to load characters:', charErr)
    if (storyErr) console.error('Failed to load stories:', storyErr)
    set({
      characters: (characters || []).map(characterFromRow),
      stories: (stories || []).map(storyFromRow),
      initialized: true
    })
  },

  // Clears local state on logout so a different account signing in on the
  // same tab never sees a flash of the previous user's data.
  reset: () => set({ characters: [], stories: [], userId: null, initialized: false }),

  addCharacter: async (char) => {
    const { userId } = get()
    const { data, error } = await supabase
      .from('characters')
      .insert(characterToRow(char, userId))
      .select()
      .single()
    if (error) { console.error('Failed to add character:', error); throw error }
    const newChar = characterFromRow(data)
    set({ characters: [newChar, ...get().characters] })
    return newChar
  },

  updateCharacter: async (id, patch) => {
    const { userId } = get()
    const { data, error } = await supabase
      .from('characters')
      .update(characterToRow({ ...get().characters.find(c => c.id === id), ...patch }, userId))
      .eq('id', id)
      .select()
      .single()
    if (error) { console.error('Failed to update character:', error); throw error }
    const updated = characterFromRow(data)
    set({ characters: get().characters.map(c => c.id === id ? updated : c) })
    return updated
  },

  deleteCharacter: async (id) => {
    const { error } = await supabase.from('characters').delete().eq('id', id)
    if (error) { console.error('Failed to delete character:', error); throw error }
    set({ characters: get().characters.filter(c => c.id !== id) })
  },

  // Deliberately NOT awaited by callers during story creation — see
  // Create.jsx. Updates local state immediately (synchronously, from the
  // caller's point of view) so navigation and the reader never wait on the
  // network; the actual database write happens in the background. This is
  // what keeps the "navigate to the reader instantly" behaviour we built
  // earlier intact rather than reintroducing a wait exactly where we'd
  // removed one.
  saveStory: async (story) => {
    const { userId } = get()
    const id = story.id
    const existingIndex = get().stories.findIndex(s => s.id === id)

    // Optimistic local update first — instant from the caller's perspective.
    const optimistic = { ...story, ownerId: userId }
    set({
      stories: existingIndex >= 0
        ? get().stories.map((s, i) => i === existingIndex ? optimistic : s)
        : [optimistic, ...get().stories]
    })

    const row = {
      id,
      owner_id: userId,
      title: story.title,
      tagline: story.tagline || null,
      genre: story.genre || null,
      style: story.style || null,
      scenes: story.scenes || [],
      characters: story.characters || []
    }
    const { data, error } = await supabase.from('stories').upsert(row).select().single()
    if (error) { console.error('Failed to save story:', error); throw error }
    const saved = storyFromRow(data)
    set({ stories: get().stories.map(s => s.id === id ? saved : s) })
    return id
  },

  // Looks up the story locally first (already loaded by init(), or by an
  // earlier saveStory() in this session) — no network round-trip in the
  // common case. Falls back to fetching it directly for a fresh page load /
  // direct link, where local state may not have it yet.
  getStory: async (id) => {
    const local = get().stories.find(s => s.id === id)
    if (local) return local

    const { data, error } = await supabase.from('stories').select('*').eq('id', id).single()
    if (error) {
      console.error('Failed to fetch story:', error)
      return null
    }
    return storyFromRow(data)
  },

  deleteStory: async (id) => {
    const { error } = await supabase.from('stories').delete().eq('id', id)
    if (error) { console.error('Failed to delete story:', error); throw error }
    set({ stories: get().stories.filter(s => s.id !== id) })
  }
}))
