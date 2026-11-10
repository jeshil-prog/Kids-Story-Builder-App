import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { useStore, libraryOf, deletedOf, continuedIdsOf, usedThisMonthOf, daysLeftOf, DELETED_KEEP_DAYS } from '../lib/store'
import { normalisePhone, PHONE_HELP } from '../lib/phone'
import StoryCover from '../components/StoryCover'
import { Avatar } from '../components/UI'
import SmartImage from '../components/SmartImage'
import LibraryGrid from '../components/LibraryGrid'
import FriendsPanel from '../components/FriendsPanel'

const TIER_INFO = {
  free: { name: 'Free', storyLimit: 3, characterLimit: 2, price: null },
  tier1: { name: 'Tier 1', storyLimit: 25, characterLimit: 6, price: '$19.99/mo' },
  tier2: { name: 'Tier 2', storyLimit: 200, characterLimit: Infinity, price: '$39.99/mo' }
}

// What each plan includes, shown side by side so people can see the
// difference before choosing. These must match what the app really enforces:
// story and character limits (generate-story.js, Characters.jsx), art styles
// (Create.jsx: free gets the first two) and friend sharing (Friends.jsx).
const COMPARE_ROWS = [
  { label: 'Price', free: 'Free', tier1: '$19.99/mo', tier2: '$39.99/mo' },
  { label: 'Stories each month', free: '3', tier1: '25', tier2: 'Up to ~200' },
  { label: 'Characters', free: '2', tier1: '6', tier2: 'Unlimited' },
  { label: 'Art styles', free: '2', tier1: 'All 6', tier2: 'All 6' },
  { label: 'Share with friends', free: '✕', tier1: '✓', tier2: '✓' },
  { label: 'Stories from your own pictures', free: '✕', tier1: '✕', tier2: '✓' },
]

// The plan and billing section (the old Profile page), now one tab of the new Profile.
function PlanPanel() {
  const { user } = useAuth()
  const { stories, characters } = useStore()
  const [searchParams] = useSearchParams()
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [checkoutPolling, setCheckoutPolling] = useState(false)

  const fetchSubscription = () =>
    supabase.from('subscriptions').select('*').eq('user_id', user.id).single()
      .then(({ data }) => { setSubscription(data); return data })

  useEffect(() => {
    fetchSubscription().then(() => setLoading(false))
  }, [user.id])

  const checkoutResult = searchParams.get('checkout') // 'success' | 'cancelled' | null

  // The webhook that actually updates your tier runs asynchronously after
  // Stripe redirects you back here — there's a real gap (usually a few
  // seconds) where this page would otherwise show stale "Free" data with no
  // way to know it's about to change. This polls until the tier reflects the
  // upgrade (or gives up after a reasonable window and asks you to refresh).
  useEffect(() => {
    if (checkoutResult !== 'success') return
    setCheckoutPolling(true)
    let cancelled = false
    let attempts = 0
    const maxAttempts = 10 // ~20s at 2s apart

    const poll = async () => {
      if (cancelled) return
      attempts += 1
      const data = await fetchSubscription()
      const upgraded = data?.status === 'active' && (data?.tier === 'tier1' || data?.tier === 'tier2')
      if (upgraded || attempts >= maxAttempts) {
        if (!cancelled) setCheckoutPolling(false)
        return
      }
      setTimeout(poll, 2000)
    }
    poll()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutResult])

  const tier = subscription?.status === 'active' ? (subscription?.tier || 'free') : 'free'
  const info = TIER_INFO[tier]

  // Counted the way the server counts: drafts and deleted stories count, one page previews do not.
  const storiesThisMonth = usedThisMonthOf(stories)
  const ownCharacterCount = characters.filter(c => c.ownerId === user.id).length

  const handleUpgrade = async (targetTier) => {
    setActionLoading(true)
    const res = await fetch('/api/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'checkout', userId: user.id, email: user.email, tier: targetTier, origin: window.location.origin })
    })
    const data = await res.json()
    setActionLoading(false)
    if (data.url) window.location.href = data.url
  }

  const handleManageBilling = async () => {
    setActionLoading(true)
    const res = await fetch('/api/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'portal', userId: user.id, origin: window.location.origin })
    })
    const data = await res.json()
    setActionLoading(false)
    if (data.url) window.location.href = data.url
    else if (data.error) alert(data.error)
  }

  return (
    <div style={{ maxWidth: 520 }}>

      {checkoutResult === 'success' && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: checkoutPolling ? 'var(--surface-card)' : '#E7F7F0', color: checkoutPolling ? 'var(--text-muted)' : '#1D9E75', fontSize: 13, marginBottom: 16 }}>
          {checkoutPolling
            ? '⏳ Confirming your subscription…'
            : (subscription?.tier === 'tier1' || subscription?.tier === 'tier2')
              ? '🎉 Subscription active!'
              : "Payment succeeded, but confirming your plan is taking longer than expected. Try refreshing this page in a moment, or contact support if it doesn't update."}
        </div>
      )}
      {checkoutResult === 'cancelled' && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--surface-card)', color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
          Checkout was cancelled. No charge was made.
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        <>
          <div style={{ padding: 16, borderRadius: 12, background: 'var(--surface-card)', marginBottom: 16 }}>
            <p style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 4px' }}>Current plan</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
              {info.name}{info.price ? `, ${info.price}` : ''}
            </p>

            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                <span>Stories this month</span>
                <span>{storiesThisMonth} / {info.storyLimit === 200 ? '~200' : info.storyLimit}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-input)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (storiesThisMonth / info.storyLimit) * 100)}%`, background: '#534AB7' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                <span>Characters</span>
                <span>{ownCharacterCount} / {info.characterLimit === Infinity ? '∞' : info.characterLimit}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-input)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${info.characterLimit === Infinity ? 0 : Math.min(100, (ownCharacterCount / info.characterLimit) * 100)}%`, background: '#534AB7' }} />
              </div>
            </div>
          </div>

          {/* Side by side comparison, so the difference between plans is clear */}
          <div style={{ padding: '14px 12px 6px', borderRadius: 12, background: 'var(--surface-card)', marginBottom: 16 }}>
            <p style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 4px 10px' }}>Compare plans</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr 1fr 1fr', alignItems: 'stretch', fontSize: 13 }}>
              <div />
              {['free', 'tier1', 'tier2'].map(t => (
                <div key={t} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: '10px 10px 0 0', fontWeight: 700, color: t === tier ? '#3C3489' : 'var(--text-primary)', background: t === tier ? '#EEEDFE' : 'transparent' }}>
                  {TIER_INFO[t].name}
                  {t === tier && <div style={{ fontSize: 10, fontWeight: 600, color: '#534AB7', marginTop: 2 }}>Your plan</div>}
                </div>
              ))}
              {COMPARE_ROWS.map((row, ri) => (
                <React.Fragment key={row.label}>
                  <div style={{ padding: '11px 4px', color: 'var(--text-muted)', borderTop: '0.5px solid var(--border)' }}>{row.label}</div>
                  {['free', 'tier1', 'tier2'].map(t => (
                    <div key={t} style={{
                      padding: '11px 4px', textAlign: 'center', borderTop: '0.5px solid var(--border)',
                      color: row[t] === '✕' ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: 500,
                      background: t === tier ? '#EEEDFE' : 'transparent',
                      borderRadius: t === tier && ri === COMPARE_ROWS.length - 1 ? '0 0 10px 10px' : 0
                    }}>{row[t]}</div>
                  ))}
                </React.Fragment>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 4px 8px', lineHeight: 1.5 }}>
              All plans include narration, sound effects and all story lengths. Tier 1 is about one story a night. Tier 2 is for families who read several a night.
            </p>
          </div>

          {tier === 'free' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => handleUpgrade('tier1')} disabled={actionLoading} style={{ padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#534AB7', color: 'white', border: 'none', cursor: 'pointer' }}>
                Upgrade to Tier 1: $19.99/mo
                <span style={{ display: 'block', fontSize: 12, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>25 stories a month, 6 characters, all art styles, friend sharing</span>
              </button>
              <button onClick={() => handleUpgrade('tier2')} disabled={actionLoading} style={{ padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: 'var(--surface-card)', color: 'var(--text-primary)', border: '0.5px solid var(--border)', cursor: 'pointer' }}>
                Upgrade to Tier 2: $39.99/mo
                <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>Up to ~200 stories a month, unlimited characters, stories from your own pictures, everything in Tier 1</span>
              </button>
            </div>
          ) : (
            <button onClick={handleManageBilling} disabled={actionLoading} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: 'var(--surface-card)', color: 'var(--text-primary)', border: '0.5px solid var(--border)', cursor: 'pointer' }}>
              {actionLoading ? 'Loading…' : 'Manage billing / cancel plan'}
            </button>
          )}
        </>
      )}

    </div>
  )
}

// ---------------------------------------------------------------------------

const TABS = [
  { id: 'library', label: 'Library' },
  { id: 'friends', label: 'Friends' },
  { id: 'avatars', label: 'Avatars' },
  { id: 'deleted', label: 'Deleted' },
  { id: 'plan', label: 'Plan' },
]

const tabButton = (active) => ({
  flex: '1 0 auto', padding: '9px 14px', borderRadius: 100, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
  border: '0.5px solid', transition: 'all 0.15s',
  background: active ? '#EEEDFE' : 'transparent',
  borderColor: active ? '#534AB7' : 'var(--border-strong)',
  color: active ? '#3C3489' : 'var(--text-secondary)',
  fontWeight: active ? 600 : 400
})

export default function Profile() {
  const { user, logout } = useAuth()
  const stories = useStore(s => s.stories)
  const characters = useStore(s => s.characters)
  const deleteStory = useStore(s => s.deleteStory)
  const restoreStory = useStore(s => s.restoreStory)
  const deleteStoryForever = useStore(s => s.deleteStoryForever)
  const library = libraryOf(stories)
  const deleted = deletedOf(stories)
  const continuedIds = continuedIdsOf(stories)
  // A short "moved to Deleted, undo" message after deleting a story.
  const [toast, setToast] = useState(null)
  const toastTimer = React.useRef(null)
  const moveToDeleted = async (id) => {
    const story = library.find(x => x.id === id)
    try { await deleteStory(id) } catch { alert('Could not delete the story. Please try again.'); return }
    setToast({ id, title: story?.title || 'Story' })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 7000)
  }
  const undoDelete = async () => {
    if (!toast) return
    try { await restoreStory(toast.id) } catch { alert('Could not restore the story.') }
    setToast(null)
  }
  const [searchParams, setSearchParams] = useSearchParams()

  // Coming back from checkout lands on the Plan tab. Otherwise the Library opens first.
  const requested = searchParams.get('tab')
  const tab = TABS.some(t => t.id === requested || (requested === 'photos' && t.id === 'avatars')) ? (requested === 'photos' ? 'avatars' : requested) : (searchParams.get('checkout') ? 'plan' : 'library')
  const goTab = (id) => setSearchParams(id === 'library' ? {} : { tab: id }, { replace: true })

  const [displayName, setDisplayName] = useState(null) // null until loaded
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState(null)
  const [phone, setPhone] = useState(null)
  const [editingPhone, setEditingPhone] = useState(false)
  const [draftPhone, setDraftPhone] = useState('')
  const [phoneError, setPhoneError] = useState(null)

  useEffect(() => {
    supabase.from('profiles').select('display_name, phone').eq('id', user.id).single()
      .then(({ data }) => { setDisplayName(data?.display_name || user.email.split('@')[0]); setPhone(data?.phone || null) })
  }, [user.id])

  const savePhone = async () => {
    const next = normalisePhone(draftPhone)
    if (!next) { setPhoneError(`That does not look like a mobile number. ${PHONE_HELP}`); return }
    const { error } = await supabase.from('profiles').update({ phone: next }).eq('id', user.id)
    if (error) { setPhoneError('Could not save your number. Please try again.'); return }
    setPhone(next)
    setEditingPhone(false)
    setPhoneError(null)
    supabase.rpc('claim_invites')
  }

  const saveName = async () => {
    const name = draftName.trim()
    if (name.length < 1 || name.length > 40) { setNameError('Please use between 1 and 40 characters.'); return }
    setSavingName(true)
    setNameError(null)
    const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', user.id)
    setSavingName(false)
    if (error) { setNameError('Could not save your name. Please try again.'); return }
    setDisplayName(name)
    setEditing(false)
  }

  const ownPhotos = characters
    .filter(c => c.ownerId === user.id && c.photoUrl && c.photoUrl.includes('/avatars/'))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const shownName = displayName || user.email.split('@')[0]

  return (
    <div style={{ flex: 1, padding: 20, maxWidth: 720, margin: '0 auto', width: '100%', boxSizing: 'border-box', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '8px 0 20px' }}>
        <Avatar name={shownName} size={60} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  autoFocus value={draftName} maxLength={40}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditing(false) }}
                  style={{ flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: 10, fontSize: 15, border: '0.5px solid var(--border)', background: 'var(--surface-input)', color: 'var(--text-primary)' }}
                />
                <button onClick={saveName} disabled={savingName} style={{ padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: '#534AB7', color: 'white', border: 'none', cursor: 'pointer' }}>{savingName ? '…' : 'Save'}</button>
                <button onClick={() => setEditing(false)} style={{ padding: '8px 10px', borderRadius: 10, fontSize: 13, background: 'none', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>Cancel</button>
              </div>
              {nameError && <p style={{ fontSize: 12, color: '#E24B4A', margin: '6px 0 0' }}>{nameError}</p>}
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0' }}>This is the name your friends see.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shownName}</h1>
                <button onClick={() => { setDraftName(shownName); setNameError(null); setEditing(true) }} style={{ background: 'none', border: 'none', color: '#534AB7', fontSize: 12, cursor: 'pointer', padding: 0 }}>Edit name</button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0' }}>{user.email}</p>
              {editingPhone ? (
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input autoFocus type="tel" value={draftPhone} onChange={(e) => setDraftPhone(e.target.value)} placeholder="Mobile number"
                      onKeyDown={(e) => { if (e.key === 'Enter') savePhone(); if (e.key === 'Escape') setEditingPhone(false) }}
                      style={{ flex: 1, minWidth: 0, padding: '6px 10px', borderRadius: 8, fontSize: 13, border: '0.5px solid var(--border)', background: 'var(--surface-input)', color: 'var(--text-primary)' }} />
                    <button onClick={savePhone} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#534AB7', color: 'white', border: 'none', cursor: 'pointer' }}>Save</button>
                    <button onClick={() => { setEditingPhone(false); setPhoneError(null) }} style={{ padding: '6px 8px', fontSize: 12, background: 'none', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>Cancel</button>
                  </div>
                  {phoneError && <p style={{ fontSize: 12, color: '#E24B4A', margin: '4px 0 0' }}>{phoneError}</p>}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  {phone || 'No mobile number'}{' '}
                  <button onClick={() => { setDraftPhone(phone || ''); setPhoneError(null); setEditingPhone(true) }} style={{ background: 'none', border: 'none', color: '#534AB7', fontSize: 12, cursor: 'pointer', padding: 0 }}>Edit</button>
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 2 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => goTab(t.id)} aria-pressed={tab === t.id} style={tabButton(tab === t.id)}>
            {t.label}{t.id === 'library' && library.length > 0 ? ` (${library.length})` : ''}{t.id === 'deleted' && deleted.length > 0 ? ` (${deleted.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'library' && (
        library.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 36, margin: 0 }}>📚</p>
            <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Your library is empty</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>Stories you save appear here. When a story ends, choose Save to library.</p>
            <Link to="/create" style={{ color: '#534AB7', fontSize: 14 }}>Create your first story →</Link>
          </div>
        ) : (
          <LibraryGrid stories={library} owner onDelete={moveToDeleted} continuedIds={continuedIds} newStoryTile />
        )
      )}

      {tab === 'friends' && <FriendsPanel />}

      {tab === 'avatars' && (
        ownPhotos.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 36, margin: 0 }}>🎨</p>
            <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>No portraits yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0, maxWidth: 320 }}>When you add a photo to a character, we turn it into a cartoon portrait. The portraits appear here.</p>
            <Link to="/characters?new=1" style={{ color: '#534AB7', fontSize: 14 }}>Add a character →</Link>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px' }}>
              The cartoon portraits of your characters. We do not keep the photos they were made from.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
              {ownPhotos.map(c => (
                <a key={c.id} href={c.photoUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ aspectRatio: '1 / 1', borderRadius: 14, overflow: 'hidden', background: 'var(--surface-card)', border: '0.5px solid var(--border)' }}>
                    <SmartImage src={c.photoUrl} alt={c.name} lazy style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '6px 0 0' }}>{c.name}</p>
                  {c.createdAt && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{new Date(c.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                </a>
              ))}
            </div>
          </>
        )
      )}

      {tab === 'deleted' && (
        deleted.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 36, margin: 0 }}>🗑️</p>
            <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>No deleted stories</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0, maxWidth: 320 }}>
              A story you delete waits here for {DELETED_KEEP_DAYS} days, so you can bring it back. After that it is removed for good.
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
              Deleted stories are removed for good after {DELETED_KEEP_DAYS} days. Restore a story to put it back in your library.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {deleted.map(s => {
                const left = daysLeftOf(s)
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-card)', border: '0.5px solid var(--border)', borderRadius: 14, padding: 10 }}>
                    <div style={{ width: 72, flexShrink: 0, borderRadius: 10, overflow: 'hidden' }}><StoryCover story={s} titleSize={0} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 2px', color: 'var(--text-primary)' }}>{s.title}</p>
                      <p style={{ fontSize: 12, color: left <= 3 ? '#B26A00' : 'var(--text-muted)', margin: '0 0 8px' }}>
                        {left === 0 ? 'Removed soon' : `Removed for good in ${left} ${left === 1 ? 'day' : 'days'}`}
                      </p>
                      <div style={{ display: 'flex', gap: 14 }}>
                        <button onClick={() => restoreStory(s.id).catch(() => alert('Could not restore the story.'))} style={{ background: '#534AB7', color: 'white', border: 'none', borderRadius: 100, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Restore</button>
                        <button onClick={() => { if (confirm(`Delete "${s.title}" for good? This cannot be undone.`)) deleteStoryForever(s.id).catch(() => alert('Could not delete the story.')) }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: 0 }}>Delete for good</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )
      )}

      {tab === 'plan' && <PlanPanel />}

      {toast && (
        <div style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))', maxWidth: 420, margin: '0 auto', zIndex: 200, background: '#26215C', color: 'white', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 6px 24px rgba(0,0,0,0.3)' }}>
          <span style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>"{toast.title}" moved to Deleted.</span>
          <button onClick={undoDelete} style={{ background: 'none', border: 'none', color: '#C9C5F4', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Undo</button>
        </div>
      )}

      <button onClick={logout} style={{ marginTop: 28, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
        Log out
      </button>
    </div>
  )
}
