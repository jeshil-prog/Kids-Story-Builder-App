import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'

const PLANS = [
  { id: 'free', name: 'Free', price: '$0', blurb: '3 stories/month, 2 characters, core styles' },
  { id: 'tier1', name: 'Tier 1', price: '$19.99/mo', blurb: '25 stories/month, 6 characters, all styles, friend sharing' },
  { id: 'tier2', name: 'Tier 2', price: '$39.99/mo', blurb: 'Unlimited stories, unlimited characters, all styles, friend sharing' }
]

export default function Welcome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [plan, setPlan] = useState('free')
  const [submitting, setSubmitting] = useState(false)

  const handleContinue = async () => {
    setSubmitting(true)

    // Marked as onboarded regardless of which plan was picked, or whether a
    // paid checkout actually completes — this screen's job is just
    // capturing an initial preference, not gating on payment success.
    // Someone who cancels checkout can still upgrade later from Profile,
    // rather than being stuck seeing this screen on every visit.
    await supabase.from('profiles').update({ onboarded: true }).eq('id', user.id)

    if (plan === 'free') {
      navigate('/')
      return
    }

    const res = await fetch('/api/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'checkout', userId: user.id, email: user.email, tier: plan, origin: window.location.origin })
    })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    else { setSubmitting(false); navigate('/') }
  }

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: '100dvh', background: 'var(--surface-0)' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#534AB7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 16px' }}>🌙</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>Welcome to StoryDream!</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Choose a plan to get started — you can change this anytime.</p>
        </div>

        {PLANS.map(p => (
          <label key={p.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 12, marginBottom: 8, cursor: 'pointer',
            border: plan === p.id ? '1.5px solid #534AB7' : '0.5px solid var(--border)',
            background: plan === p.id ? '#EEEDFE' : 'var(--surface-card)'
          }}>
            <input type="radio" name="plan" checked={plan === p.id} onChange={() => setPlan(p.id)} style={{ marginTop: 4 }} />
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{p.name} — {p.price}</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{p.blurb}</p>
            </div>
          </label>
        ))}

        <button
          onClick={handleContinue}
          disabled={submitting}
          style={{ width: '100%', marginTop: 12, padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#534AB7', color: 'white', border: 'none', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? 'Please wait…' : plan === 'free' ? 'Start creating stories' : 'Continue to checkout'}
        </button>
      </div>
    </div>
  )
}
