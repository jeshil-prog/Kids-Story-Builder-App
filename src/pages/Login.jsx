import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function Login() {
  const { sendMagicLink, authError, user, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />


  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || sending) return
    setSending(true)
    const ok = await sendMagicLink(email.trim())
    setSending(false)
    if (ok) setSent(true)
  }

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: '100dvh', background: 'var(--surface-0)' }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#534AB7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>🌙</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>StoryDream</h1>

        {sent ? (
          <>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '24px 0 8px' }}>Check your email</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
              We sent a sign-in link to <strong>{email}</strong>. Open it on this device to continue.
            </p>
            <button
              onClick={() => setSent(false)}
              style={{ marginTop: 16, background: 'none', border: 'none', color: '#534AB7', fontSize: 13, cursor: 'pointer' }}
            >
              Use a different email
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.6 }}>
              Enter your email and we'll send you a link to sign in — no password needed.
            </p>
            <form onSubmit={handleSubmit}>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 14,
                  border: '0.5px solid var(--border)', background: 'var(--surface-input)',
                  color: 'var(--text-primary)', boxSizing: 'border-box', marginBottom: 12
                }}
              />
              <button
                type="submit"
                disabled={sending}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                  background: '#534AB7', color: 'white', border: 'none', cursor: sending ? 'wait' : 'pointer',
                  opacity: sending ? 0.7 : 1
                }}
              >
                {sending ? 'Sending…' : 'Send sign-in link'}
              </button>
            </form>
            {authError && (
              <p style={{ fontSize: 12, color: '#E24B4A', marginTop: 12 }}>{authError}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
