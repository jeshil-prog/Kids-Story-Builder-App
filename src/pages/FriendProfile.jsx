import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { Avatar, Spinner } from '../components/UI'
import LibraryGrid from '../components/LibraryGrid'

const fromRow = (r) => ({
  id: r.id,
  ownerId: r.owner_id,
  title: r.title,
  genre: r.genre,
  scenes: r.scenes || [],
  characters: r.characters || [],
  language: r.language || 'en',
  toBeContinued: !!r.to_be_continued,
  chapterNumber: r.chapter_number || 1
})

// Only stories that are fully finished are listed, so a friend never opens
// a half made story that cannot be read yet.
const isFinished = (s) => s.scenes.length > 0 && s.scenes.every(sc => sc.imageUrl && sc.narrationUrl)

// What a friend sees: their name and their story library. Nothing else.
// The database only returns these stories if the two of you are connected.
export default function FriendProfile() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, profile: null, stories: [], connected: false })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: conn } = await supabase
        .from('connections').select('id')
        .eq('status', 'accepted')
        .or(`and(requester_id.eq.${user.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${user.id})`)
        .limit(1)
      const connected = !!(conn && conn.length)
      if (!connected) { if (!cancelled) setState({ loading: false, profile: null, stories: [], connected: false }); return }

      const [{ data: profile }, { data: rows }] = await Promise.all([
        supabase.from('profiles').select('id, display_name, avatar_url').eq('id', id).single(),
        supabase.from('stories')
          .select('id, owner_id, title, genre, scenes, characters, language, to_be_continued, chapter_number, created_at')
          .eq('owner_id', id).eq('is_shared', true).order('created_at', { ascending: false })
      ])
      if (cancelled) return
      setState({ loading: false, profile, stories: (rows || []).map(fromRow).filter(isFinished), connected: true })
    })()
    return () => { cancelled = true }
  }, [id, user.id])

  const back = (
    <button onClick={() => navigate('/profile?tab=friends')} style={{ background: 'none', border: 'none', color: '#534AB7', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 14 }}>
      ← Back to friends
    </button>
  )

  if (state.loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}><Spinner /></div>

  if (!state.connected || !state.profile) {
    return (
      <div style={{ flex: 1, padding: 20, maxWidth: 720, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {back}
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>You are not connected with this person</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>You can only see the library of someone who has accepted your friend invite.</p>
      </div>
    )
  }

  const { profile, stories } = state
  return (
    <div style={{ flex: 1, padding: 20, maxWidth: 720, margin: '0 auto', width: '100%', boxSizing: 'border-box', overflowY: 'auto' }}>
      {back}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <Avatar name={profile.display_name} photo={profile.avatar_url} size={56} />
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{profile.display_name}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {stories.length} {stories.length === 1 ? 'story' : 'stories'} in their library
          </p>
        </div>
      </div>
      {stories.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{profile.display_name} has not shared any finished stories yet.</p>
      ) : (
        <LibraryGrid stories={stories} owner={false} />
      )}
    </div>
  )
}
