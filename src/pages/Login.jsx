import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function Login() {
  const { signInWithGoogle, authError, user, loading } = useAuth()

  if (!loading && user) return <Navigate to="/" replace />

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: '100dvh', background: 'var(--surface-0)' }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#534AB7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>🌙</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>StoryDream</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 28px', lineHeight: 1.6 }}>
          Personalised bedtime stories starring your family.
        </p>

        <button
          onClick={signInWithGoogle}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600,
            background: 'white', color: '#1a1a1a', border: '1px solid var(--border)', cursor: 'pointer'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62Z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.98v2.33A9 9 0 0 0 9 18Z"/>
            <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.05l2.99-2.33Z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59A9 9 0 0 0 .98 4.95L3.97 7.28C4.68 5.16 6.66 3.58 9 3.58Z"/>
          </svg>
          Continue with Google
        </button>

        {authError && <p style={{ fontSize: 12, color: '#E24B4A', marginTop: 12 }}>{authError}</p>}

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 20, lineHeight: 1.5 }}>
          We use Google to verify it's really you — no separate password to remember.
        </p>
      </div>
    </div>
  )
}
