import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'

export default function Friends() {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [connections, setConnections] = useState([]) // all rows involving me, any status
  const [loadingConnections, setLoadingConnections] = useState(true)
  const [profilesById, setProfilesById] = useState({})

  const loadConnections = useCallback(async () => {
    if (!user) return
    setLoadingConnections(true)
    const { data, error } = await supabase
      .from('connections')
      .select('*')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    if (error) {
      console.error('Failed to load connections:', error)
      setLoadingConnections(false)
      return
    }
    setConnections(data || [])

    // Fetch the other-party profile for every connection row so we can
    // show names instead of raw ids.
    const otherIds = [...new Set((data || []).map(c => c.requester_id === user.id ? c.addressee_id : c.requester_id))]
    if (otherIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, display_name, email').in('id', otherIds)
      const map = {}
      ;(profiles || []).forEach(p => { map[p.id] = p })
      setProfilesById(map)
    }
    setLoadingConnections(false)
  }, [user])

  useEffect(() => { loadConnections() }, [loadConnections])

  const handleSearch = async (e) => {
    e.preventDefault()
    const q = query.trim()
    if (!q || !user) return
    setSearching(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .or(`display_name.ilike.%${q}%,email.ilike.%${q}%`)
      .neq('id', user.id)
      .limit(20)
    setSearching(false)
    if (error) { console.error('Search failed:', error); return }
    setResults(data || [])
  }

  const connectionWith = (otherId) => connections.find(c => c.requester_id === otherId || c.addressee_id === otherId)

  const sendInvite = async (otherId) => {
    const { error } = await supabase.from('connections').insert({ requester_id: user.id, addressee_id: otherId })
    if (error) { console.error('Invite failed:', error); return }
    await loadConnections()
  }

  const respond = async (connectionId, status) => {
    const { error } = await supabase
      .from('connections')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('id', connectionId)
    if (error) { console.error('Response failed:', error); return }
    await loadConnections()
  }

  const incoming = connections.filter(c => c.addressee_id === user?.id && c.status === 'pending')
  const accepted = connections.filter(c => c.status === 'accepted')

  return (
    <div style={{ flex: 1, padding: 20, maxWidth: 560, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '8px 0 4px' }}>Friends</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
        Connect with other families to use each other's characters in your stories.
      </p>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          style={{ flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 14, border: '0.5px solid var(--border)', background: 'var(--surface-input)', color: 'var(--text-primary)' }}
        />
        <button type="submit" disabled={searching} style={{ padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: '#534AB7', color: 'white', border: 'none', cursor: 'pointer' }}>
          {searching ? '…' : 'Search'}
        </button>
      </form>

      {results.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Results</p>
          {results.map(p => {
            const conn = connectionWith(p.id)
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: 'var(--surface-card)', marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{p.display_name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{p.email}</p>
                </div>
                {!conn && (
                  <button onClick={() => sendInvite(p.id)} style={{ fontSize: 12, fontWeight: 600, color: '#534AB7', background: 'none', border: '1px solid #534AB7', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                    Invite
                  </button>
                )}
                {conn?.status === 'pending' && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pending</span>}
                {conn?.status === 'accepted' && <span style={{ fontSize: 12, color: '#1D9E75' }}>Connected</span>}
                {conn?.status === 'declined' && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Declined</span>}
              </div>
            )
          })}
        </div>
      )}

      {incoming.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Invites for you</p>
          {incoming.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: 'var(--surface-card)', marginBottom: 8 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{profilesById[c.requester_id]?.display_name || '…'}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => respond(c.id, 'accepted')} style={{ fontSize: 12, fontWeight: 600, color: 'white', background: '#1D9E75', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Accept</button>
                <button onClick={() => respond(c.id, 'declined')} style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Connected</p>
        {loadingConnections ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
        ) : accepted.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No connections yet — search above to invite someone.</p>
        ) : (
          accepted.map(c => {
            const otherId = c.requester_id === user.id ? c.addressee_id : c.requester_id
            return (
              <div key={c.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-card)', marginBottom: 8 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{profilesById[otherId]?.display_name || '…'}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Their characters are available in Create</p>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
