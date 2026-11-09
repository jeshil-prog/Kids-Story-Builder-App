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
  language: row.language || 'en',
  toBeContinued: !!row.to_be_continued,
  chapterNumber: row.chapter_number || 1,
  continuesStoryId: row.continues_story_id || null,
  isShared: row.is_shared !== false,
  // Only saved stories live in the library. Anything else is a draft.
  inLibrary: row.in_library === true,
  deletedAt: row.deleted_at || null,
  pickupDismissed: row.pickup_dismissed === true,
  // A one page preview made after the monthly limit was reached.
  paywalled: row.paywalled === true,
  createdAt: row.created_at
})

// --- what to show where ----------------------------------------------------
// The store holds every story row this person owns, including drafts and
// deleted ones. These pick out the right ones for each screen.
const hasContent = (s) => (s.scenes?.length || 0) > 0

// Saved stories, newest first.
export const libraryOf = (stories) =>
  stories.filter(s => s.inLibrary && !s.deletedAt && hasContent(s))

// Deleted stories still within their 30 days.
export const deletedOf = (stories) =>
  stories.filter(s => s.deletedAt && hasContent(s))
    .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt))

// Ids of stories that already have a next chapter.
export const continuedIdsOf = (stories) =>
  new Set(stories.filter(s => s.continuesStoryId && !s.deletedAt && hasContent(s)).map(s => s.continuesStoryId))

// "Pick up where you left off": a to be continued story that has no next
// chapter yet, saved or not, that the person has not dismissed.
export const pickupOf = (stories) => {
  const continued = new Set(stories.filter(s => s.continuesStoryId && !s.deletedAt && hasContent(s)).map(s => s.continuesStoryId))
  return stories.filter(s =>
    s.toBeContinued && !s.pickupDismissed && !s.deletedAt && !s.paywalled && hasContent(s) && !continued.has(s.id))
}

// How many stories count toward this month's limit. Matches the server: drafts
// and deleted stories count, one page previews do not.
export const usedThisMonthOf = (stories) => {
  const now = new Date()
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  return stories.filter(s => !s.paywalled && new Date(s.createdAt).getTime() >= start).length
}

// How many days a deleted story has left before it is removed for good.
export const DELETED_KEEP_DAYS = 30
export const daysLeftOf = (story) => {
  const ms = new Date(story.deletedAt).getTime() + DELETED_KEEP_DAYS * 86400000 - Date.now()
  return Math.max(0, Math.ceil(ms / 86400000))
}

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
    // Housekeeping first: removes stories deleted over 30 days ago and empties
    // old unsaved ones. Also turns any invites sent to this person's email or
    // phone into friend requests. Neither may ever stop the app from loading.
    await Promise.allSettled([
      supabase.rpc('cleanup_my_stories'),
      supabase.rpc('claim_invites')
    ])
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
      characters: story.characters || [],
      language: story.language || 'en',
      to_be_continued: !!story.toBeContinued,
      chapter_number: story.chapterNumber || 1,
      continues_story_id: story.continuesStoryId || null,
      in_library: !!story.inLibrary,
      paywalled: !!story.paywalled
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

  // Updates one story row in the database and in local state together.
  _patchStory: async (id, dbPatch, localPatch) => {
    const { error } = await supabase.from('stories').update(dbPatch).eq('id', id)
    if (error) { console.error('Failed to update story:', error); throw error }
    set({ stories: get().stories.map(s => s.id === id ? { ...s, ...localPatch } : s) })
  },

  // Only the pictures and voices, which arrive after the story is made. A
  // narrow write, so it can never undo something else (like saving to library).
  updateScenes: async (id, scenes) => {
    set({ stories: get().stories.map(s => s.id === id ? { ...s, scenes } : s) })
    const { error } = await supabase.from('stories').update({ scenes }).eq('id', id)
    if (error) console.error('Failed to save scenes:', error)
  },

  saveToLibrary: (id) => get()._patchStory(id, { in_library: true }, { inLibrary: true }),

  // "Don't save": the story's content is removed. The empty row stays so the
  // monthly story count stays honest.
  discardStory: async (id) => {
    const { error } = await supabase.from('stories').update({ scenes: [], characters: [] }).eq('id', id)
    if (error) { console.error('Failed to discard story:', error); throw error }
    set({ stories: get().stories.map(s => s.id === id ? { ...s, scenes: [], characters: [], inLibrary: false } : s) })
  },

  // Deleting moves a story to Deleted stories, where it stays for 30 days.
  deleteStory: (id) => {
    const now = new Date().toISOString()
    return get()._patchStory(id, { deleted_at: now }, { deletedAt: now })
  },

  restoreStory: (id) => get()._patchStory(id, { deleted_at: null }, { deletedAt: null }),

  deleteStoryForever: async (id) => {
    const { error } = await supabase.from('stories').delete().eq('id', id)
    if (error) { console.error('Failed to delete story:', error); throw error }
    set({ stories: get().stories.filter(s => s.id !== id) })
  },

  // Hides a to be continued story from "Pick up where you left off".
  dismissPickup: (id) => get()._patchStory(id, { pickup_dismissed: true }, { pickupDismissed: true })
}))
