import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 14,
  border: '0.5px solid var(--border)', background: 'var(--surface-input)',
  color: 'var(--text-primary)', boxSizing: 'border-box', marginBottom: 10
}

// Reached from the link in the password reset email. The link signs the
// person in temporarily, and this page lets them choose a new password.
export default function ResetPassword() {
  const { updatePassword, authError, logout } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState(null)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setLocalError(null)
    if (password.length < 8) { setLocalError('Your password needs at least 8 characters.'); return }
    if (password !== confirm) { setLocalError('The two passwords do not match.'); return }
    setSubmitting(true)
    const ok = await updatePassword(password)
    setSubmitting(false)
    if (ok) setDone(true)
  }

  const error = localError || authError

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: '100dvh', background: 'var(--surface-0)' }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#534AB7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>🌙</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Choose a new password</h1>

        {done ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: '8px 0 20px' }}>Your password has been changed.</p>
            <button onClick={() => navigate('/', { replace: true })} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#534AB7', color: 'white', border: 'none', cursor: 'pointer' }}>
              Continue to StoryDream
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.6 }}>Pick something you will remember, with at least 8 characters.</p>
            <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
              <input type="password" required autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" style={inputStyle} />
              <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" style={inputStyle} />
              <button type="submit" disabled={submitting} style={{ width: '100%', marginTop: 6, padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#534AB7', color: 'white', border: 'none', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
                {submitting ? 'Please wait…' : 'Save new password'}
              </button>
            </form>
            {error && <p style={{ fontSize: 12, color: '#E24B4A', marginTop: 12, lineHeight: 1.5 }}>{error}</p>}
            <button onClick={logout} style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          </>
        )}
      </div>
    </div>
  )
}
