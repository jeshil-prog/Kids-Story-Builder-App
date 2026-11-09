import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { normalisePhone, PHONE_HELP } from '../lib/phone'

// Asked once, for anyone who signed in without a mobile number (Google sign in,
// or an account made before numbers were collected).
export default function AddPhone() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const phone = normalisePhone(value)
    if (!phone) { setError(`That does not look like a mobile number. ${PHONE_HELP}`); return }
    setSaving(true)
    setError(null)
    const { data, error: updateError } = await supabase.from('profiles').update({ phone }).eq('id', user.id).select()
    if (updateError || !data || data.length === 0) {
      setSaving(false)
      setError('Could not save your number. Please try again.')
      return
    }
    // Any invites sent to this number become friend requests.
    await supabase.rpc('claim_invites')
    navigate('/', { replace: true })
  }

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: '100dvh', background: 'var(--surface-0)' }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#534AB7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>📱</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Add your mobile number</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 22px', lineHeight: 1.6 }}>
          Friends can find you and invite you using your email or mobile number. Your number is not shown to anyone.
        </p>
        <form onSubmit={submit} style={{ textAlign: 'left' }}>
          <input
            type="tel" required autoComplete="tel" value={value} onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 0412 345 678 or +1 555 123 4567"
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 14, border: '0.5px solid var(--border)', background: 'var(--surface-input)', color: 'var(--text-primary)', boxSizing: 'border-box', marginBottom: 8 }}
          />
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>{PHONE_HELP}</p>
          {error && <p style={{ fontSize: 12, color: '#E24B4A', margin: '0 0 12px', lineHeight: 1.5 }}>{error}</p>}
          <button type="submit" disabled={saving} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#534AB7', color: 'white', border: 'none', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
