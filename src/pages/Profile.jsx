import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { useStore } from '../lib/store'

const TIER_INFO = {
  free: { name: 'Free', storyLimit: 3, characterLimit: 2, price: null },
  tier1: { name: 'Tier 1', storyLimit: 25, characterLimit: 6, price: '$19.99/mo' },
  tier2: { name: 'Tier 2', storyLimit: 200, characterLimit: Infinity, price: '$39.99/mo' }
}

export default function Profile() {
  const { user, logout } = useAuth()
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

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const storiesThisMonth = stories.filter(s => new Date(s.createdAt) >= startOfMonth).length
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
    <div style={{ flex: 1, padding: 20, maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '8px 0 4px' }}>Profile & Billing</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>{user.email}</p>

      {checkoutResult === 'success' && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: checkoutPolling ? 'var(--surface-card)' : '#E7F7F0', color: checkoutPolling ? 'var(--text-muted)' : '#1D9E75', fontSize: 13, marginBottom: 16 }}>
          {checkoutPolling
            ? '⏳ Confirming your subscription…'
            : (subscription?.tier === 'tier1' || subscription?.tier === 'tier2')
              ? '🎉 Subscription active!'
              : "Payment succeeded, but confirming your plan is taking longer than expected — try refreshing this page in a moment, or contact support if it doesn't update."}
        </div>
      )}
      {checkoutResult === 'cancelled' && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--surface-card)', color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
          Checkout was cancelled — no charge was made.
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        <>
          <div style={{ padding: 16, borderRadius: 12, background: 'var(--surface-card)', marginBottom: 16 }}>
            <p style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 4px' }}>Current plan</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
              {info.name}{info.price ? ` — ${info.price}` : ''}
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

          {tier === 'free' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => handleUpgrade('tier1')} disabled={actionLoading} style={{ padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#534AB7', color: 'white', border: 'none', cursor: 'pointer' }}>
                Upgrade to Tier 1 — $19.99/mo
              </button>
              <button onClick={() => handleUpgrade('tier2')} disabled={actionLoading} style={{ padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: 'var(--surface-card)', color: 'var(--text-primary)', border: '0.5px solid var(--border)', cursor: 'pointer' }}>
                Upgrade to Tier 2 — $39.99/mo
              </button>
            </div>
          ) : (
            <button onClick={handleManageBilling} disabled={actionLoading} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: 'var(--surface-card)', color: 'var(--text-primary)', border: '0.5px solid var(--border)', cursor: 'pointer' }}>
              {actionLoading ? 'Loading…' : 'Manage billing / cancel plan'}
            </button>
          )}
        </>
      )}

      <button onClick={logout} style={{ marginTop: 24, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
        Log out
      </button>
    </div>
  )
}
