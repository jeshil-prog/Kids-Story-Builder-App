import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { normalisePhone, PHONE_HELP } from '../lib/phone'

const label = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }
const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-card)', marginBottom: 8 }
const smallBtn = { fontSize: 12, fontWeight: 600, color: '#534AB7', background: 'none', border: '1px solid #534AB7', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }

// Works out whether what was typed is an email or a phone number. Names are not
// searchable on purpose.
function parseContact(raw) {
  const q = raw.trim()
  if (!q) return { error: 'Enter an email address or a mobile number.' }
  if (q.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q) ? { email: q.toLowerCase() } : { error: 'That does not look like an email address.' }
  }
  const phone = normalisePhone(q)
  return phone ? { phone } : { error: `That does not look like a mobile number. ${PHONE_HELP}` }
}

export default function FriendsPanel() {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  // null = nothing searched yet. Otherwise { contact, match } where match is the person found, or null.
  const [outcome, setOutcome] = useState(null)
  const [connections, setConnections] = useState([])
  const [loadingConnections, setLoadingConnections] = useState(true)
  const [profilesById, setProfilesById] = useState({})
  const [pendingInvites, setPendingInvites] = useState([]) // invites to people without an account yet
  const [myName, setMyName] = useState('')
  const [copied, setCopied] = useState(false)
  const [tier, setTier] = useState(null)

  useEffect(() => {
    supabase.from('subscriptions').select('tier, status').eq('user_id', user.id).single()
      .then(({ data }) => setTier(data?.status === 'active' ? (data.tier || 'free') : 'free'))
    supabase.from('profiles').select('display_name').eq('id', user.id).single()
      .then(({ data }) => setMyName(data?.display_name || ''))
  }, [user.id])

  const loadConnections = useCallback(async () => {
    if (!user) return
    setLoadingConnections(true)
    const { data, error } = await supabase
      .from('connections').select('*')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    if (error) {
      console.error('Failed to load connections:', error)
      setLoadingConnections(false)
      return
    }
    setConnections(data || [])
    const otherIds = [...new Set((data || []).map(c => c.requester_id === user.id ? c.addressee_id : c.requester_id))]
    if (otherIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', otherIds)
      const map = {}
      ;(profiles || []).forEach(p => { map[p.id] = p })
      setProfilesById(map)
    }
    const { data: invites } = await supabase.from('invites').select('*').is('claimed_at', null).order('created_at', { ascending: false })
    setPendingInvites(invites || [])
    setLoadingConnections(false)
  }, [user])

  useEffect(() => { loadConnections() }, [loadConnections])

  const handleSearch = async (e) => {
    e.preventDefault()
    setSearchError(null)
    setOutcome(null)
    setCopied(false)
    const contact = parseContact(query)
    if (contact.error) { setSearchError(contact.error); return }
    setSearching(true)
    const { data, error } = await supabase.rpc('find_profile_by_contact', {
      p_email: contact.email || null,
      p_phone: contact.phone || null
    })
    setSearching(false)
    if (error) { console.error('Search failed:', error); setSearchError('Search did not work. Please try again.'); return }
    setOutcome({ contact, match: data?.[0] || null })
  }

  const connectionWith = (otherId) => connections.find(c => c.requester_id === otherId || c.addressee_id === otherId)

  const sendInvite = async (otherId) => {
    const { error } = await supabase.from('connections').insert({ requester_id: user.id, addressee_id: otherId })
    if (error) { console.error('Invite failed:', error); return }
    await loadConnections()
  }

  const respond = async (connectionId, status) => {
    const { error } = await supabase.from('connections').update({ status, responded_at: new Date().toISOString() }).eq('id', connectionId)
    if (error) { console.error('Response failed:', error); return }
    await loadConnections()
  }

  // ---- Inviting someone who has no account yet ----
  const inviteText = `${myName || 'A friend'} invited you to StoryDream, where you can make illustrated, read-aloud stories starring your family. Join here: ${window.location.origin}`

  // Remembers the invite, so when that person signs up with this email or
  // number they arrive with a friend request from you already waiting.
  const rememberInvite = async (contact) => {
    const already = pendingInvites.some(i => (contact.email && i.email?.toLowerCase() === contact.email) || (contact.phone && i.phone === contact.phone))
    if (already) return
    const { error } = await supabase.from('invites').insert({ inviter_id: user.id, email: contact.email || null, phone: contact.phone || null })
    if (error) console.error('Could not save the invite:', error)
    else loadConnections()
  }

  const inviteByEmail = async (contact) => {
    await rememberInvite(contact)
    const subject = encodeURIComponent('Join me on StoryDream')
    window.location.href = `mailto:${encodeURIComponent(contact.email)}?subject=${subject}&body=${encodeURIComponent(inviteText)}`
  }
  const inviteByText = async (contact) => {
    await rememberInvite(contact)
    const sep = /iPhone|iPad|iPod/.test(navigator.userAgent) ? '&' : '?'
    window.location.href = `sms:${contact.phone}${sep}body=${encodeURIComponent(inviteText)}`
  }
  const copyInvite = async (contact) => {
    await rememberInvite(contact)
    try { await navigator.clipboard.writeText(inviteText); setCopied(true) } catch { setCopied(false); alert(inviteText) }
  }

  const incoming = connections.filter(c => c.addressee_id === user?.id && c.status === 'pending')
  const accepted = connections.filter(c => c.status === 'accepted')

  if (tier === null) return null
  const canInvite = tier !== 'free'

  const incomingList = incoming.length > 0 && (
    <div style={{ marginBottom: 24 }}>
      <p style={label}>Invites for you</p>
      {incoming.map(c => (
        <div key={c.id} style={row}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{profilesById[c.requester_id]?.display_name || '…'}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => respond(c.id, 'accepted')} style={{ fontSize: 12, fontWeight: 600, color: 'white', background: '#1D9E75', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Accept</button>
            <button onClick={() => respond(c.id, 'declined')} style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Decline</button>
          </div>
        </div>
      ))}
    </div>
  )

  const friendsList = (
    <div>
      <p style={label}>Connected</p>
      {loadingConnections ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
      ) : accepted.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{canInvite ? 'No friends yet. Search above to invite someone.' : 'No friends yet.'}</p>
      ) : (
        accepted.map(c => {
          const otherId = c.requester_id === user.id ? c.addressee_id : c.requester_id
          return (
            <Link key={c.id} to={`/friend/${otherId}`} style={{ ...row, textDecoration: 'none' }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{profilesById[otherId]?.display_name || '…'}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Their characters are available in Create</p>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#534AB7', whiteSpace: 'nowrap' }}>View library →</span>
            </Link>
          )
        })
      )}
    </div>
  )

  // Free plan: friends can be accepted and read, but sending invites is a paid feature.
  if (!canInvite) {
    return (
      <div style={{ maxWidth: 560 }}>
        {incomingList}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 20px', textAlign: 'center', gap: 12, marginBottom: 20, borderRadius: 14, background: 'var(--surface-card)' }}>
          <div style={{ fontSize: 36 }}>🤝</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Inviting friends is a paid feature</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 320, margin: 0 }}>
            Upgrade to Tier 1 or Tier 2 to invite other families, read each other's stories and use each other's characters.
          </p>
          <Link to="/profile?tab=plan" style={{ marginTop: 4, padding: '10px 18px', borderRadius: 10, background: '#534AB7', color: 'white', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            View plans
          </Link>
        </div>
        {accepted.length > 0 && friendsList}
      </div>
    )
  }

  const conn = outcome?.match ? connectionWith(outcome.match.id) : null
  const typed = outcome?.contact?.email || outcome?.contact?.phone

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
        Connect with other families to read each other's stories and use each other's characters.
      </p>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Their email or mobile number"
          inputMode="email"
          autoComplete="off"
          style={{ flex: 1, minWidth: 0, padding: '10px 14px', borderRadius: 10, fontSize: 14, border: '0.5px solid var(--border)', background: 'var(--surface-input)', color: 'var(--text-primary)' }}
        />
        <button type="submit" disabled={searching} style={{ padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: '#534AB7', color: 'white', border: 'none', cursor: 'pointer' }}>
          {searching ? '…' : 'Find'}
        </button>
      </form>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 20px' }}>People can only be found by their exact email or mobile number.</p>
      {searchError && <p style={{ fontSize: 13, color: '#E24B4A', margin: '-10px 0 16px', lineHeight: 1.5 }}>{searchError}</p>}

      {outcome?.match && (
        <div style={{ marginBottom: 24 }}>
          <p style={label}>Found</p>
          <div style={row}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{outcome.match.display_name}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{typed}</p>
            </div>
            {!conn && <button onClick={() => sendInvite(outcome.match.id)} style={smallBtn}>Invite</button>}
            {conn?.status === 'pending' && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pending</span>}
            {conn?.status === 'accepted' && <span style={{ fontSize: 12, color: '#1D9E75' }}>Connected</span>}
            {conn?.status === 'declined' && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Declined</span>}
          </div>
        </div>
      )}

      {outcome && !outcome.match && (
        <div style={{ marginBottom: 24, padding: '14px 16px', borderRadius: 12, background: 'var(--surface-card)', border: '0.5px solid var(--border)' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No StoryDream account for {typed}</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
            Invite them to join. When they sign up with this {outcome.contact.email ? 'email' : 'number'}, your friend request will be waiting for them.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {outcome.contact.email && <button onClick={() => inviteByEmail(outcome.contact)} style={smallBtn}>✉️ Send an email invite</button>}
            {outcome.contact.phone && <button onClick={() => inviteByText(outcome.contact)} style={smallBtn}>💬 Send a text invite</button>}
            <button onClick={() => copyInvite(outcome.contact)} style={{ ...smallBtn, color: 'var(--text-secondary)', borderColor: 'var(--border-strong)' }}>{copied ? '✓ Copied' : 'Copy invite message'}</button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
            This opens your own email or messages app with the invite ready to send.
          </p>
        </div>
      )}

      {incomingList}

      {pendingInvites.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={label}>Invited, not joined yet</p>
          {pendingInvites.map(i => (
            <div key={i.id} style={row}>
              <p style={{ fontSize: 14, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.email || i.phone}</p>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(i.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
            </div>
          ))}
        </div>
      )}

      {friendsList}
    </div>
  )
}
