import React, { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 14,
  border: '0.5px solid var(--border)', background: 'var(--surface-input)',
  color: 'var(--text-primary)', boxSizing: 'border-box', marginBottom: 10
}
const linkBtn = { background: 'none', border: 'none', color: '#534AB7', fontSize: 13, cursor: 'pointer', padding: 0 }

export default function Login() {
  const { signInWithGoogle, signIn, signUp, sendPasswordReset, authError, clearAuthError, user, loading, recovering } = useAuth()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState(null)
  const [done, setDone] = useState(null) // 'confirm' | 'reset'

  if (!loading && user) return <Navigate to={recovering ? '/reset-password' : '/'} replace />

  const switchMode = (m) => { setMode(m); setLocalError(null); clearAuthError(); setPassword(''); setConfirmPassword('') }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setLocalError(null)

    if (mode === 'signup') {
      if (password.length < 8) { setLocalError('Your password needs at least 8 characters.'); return }
      if (password !== confirmPassword) { setLocalError('The two passwords do not match.'); return }
    }

    setSubmitting(true)
    if (mode === 'signin') {
      await signIn(email.trim(), password)
    } else if (mode === 'signup') {
      const result = await signUp(email.trim(), password)
      if (result === 'confirm') setDone('confirm')
    } else {
      const ok = await sendPasswordReset(email.trim())
      if (ok) setDone('reset')
    }
    setSubmitting(false)
  }

  const error = localError || authError
  const title = mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: '100dvh', background: 'var(--surface-0)' }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#534AB7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>🌙</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>StoryDream</h1>

        {done ? (
          <>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '24px 0 8px' }}>Check your email</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
              {done === 'confirm'
                ? <>We sent a confirmation link to <strong>{email}</strong>. Click it, then come back and sign in. It can take a minute, and it is worth checking your spam folder.</>
                : <>If there is an account for <strong>{email}</strong>, we sent a link to choose a new password. It can take a minute, and it is worth checking your spam folder.</>}
            </p>
            <button onClick={() => { setDone(null); switchMode('signin') }} style={{ ...linkBtn, marginTop: 16 }}>Back to sign in</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.6 }}>
              {mode === 'forgot' ? 'Enter your email and we will send you a link to set a new password.' : 'Personalised bedtime stories starring your family.'}
            </p>

            {mode !== 'forgot' && (
              <>
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

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
                  <div style={{ flex: 1, height: '0.5px', background: 'var(--border)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or use your email</span>
                  <div style={{ flex: 1, height: '0.5px', background: 'var(--border)' }} />
                </div>
              </>
            )}

            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px', textAlign: 'left', display: mode === 'forgot' ? 'none' : 'block' }}>{title}</p>

            <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
              <input
                type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" style={inputStyle}
              />
              {mode !== 'forgot' && (
                <input
                  type="password" required minLength={mode === 'signup' ? 8 : undefined}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Create a password (at least 8 characters)' : 'Password'}
                  style={inputStyle}
                />
              )}
              {mode === 'signup' && (
                <input
                  type="password" required autoComplete="new-password"
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Type the password again" style={inputStyle}
                />
              )}

              {mode === 'signin' && (
                <div style={{ textAlign: 'right', margin: '-2px 0 12px' }}>
                  <button type="button" onClick={() => switchMode('forgot')} style={linkBtn}>Forgot password?</button>
                </div>
              )}

              <button
                type="submit" disabled={submitting}
                style={{ width: '100%', marginTop: mode === 'signin' ? 0 : 6, padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#534AB7', color: 'white', border: 'none', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
              </button>
            </form>

            {error && <p style={{ fontSize: 12, color: '#E24B4A', marginTop: 12, lineHeight: 1.5 }}>{error}</p>}

            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 20 }}>
              {mode === 'signin' && <>New here? <button onClick={() => switchMode('signup')} style={linkBtn}>Create an account</button></>}
              {mode === 'signup' && <>Already have an account? <button onClick={() => switchMode('signin')} style={linkBtn}>Sign in</button></>}
              {mode === 'forgot' && <button onClick={() => switchMode('signin')} style={linkBtn}>Back to sign in</button>}
            </p>

            {mode === 'signup' && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                By creating an account you agree to our <Link to="/terms" style={{ color: '#534AB7' }}>Terms</Link> and <Link to="/privacy" style={{ color: '#534AB7' }}>Privacy Policy</Link>.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
