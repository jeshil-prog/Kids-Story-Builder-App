import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const AuthContext = createContext(null)

// Turns Supabase's technical messages into something a parent can act on.
function friendlyError(error) {
  const m = (error?.message || '').toLowerCase()
  if (m.includes('invalid login credentials')) return 'That email and password do not match. If you signed up with Google, use the Google button instead.'
  if (m.includes('email not confirmed')) return 'Please confirm your email first. Check your inbox for our message and click the link.'
  if (m.includes('already registered')) return 'There is already an account with that email. Try signing in instead.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a few minutes and try again.'
  if (m.includes('password') && m.includes('characters')) return 'Your password needs at least 8 characters.'
  if (m.includes('same password')) return 'Please choose a different password from your old one.'
  return error?.message || 'Something went wrong. Please try again.'
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = not checked yet, null = checked, no session
  const [authError, setAuthError] = useState(null)
  const [recovering, setRecovering] = useState(false) // true when arriving from a password reset email

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Google handles identity verification entirely. Supabase auto-creates the
  // user (and, via the DB trigger, their profile and free subscription row)
  // the first time someone completes this.
  const signInWithGoogle = async () => {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
    if (error) setAuthError(friendlyError(error))
  }

  // Returns 'ok' when signed in, or false on failure (authError is set).
  const signIn = async (email, password) => {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setAuthError(friendlyError(error)); return false }
    return 'ok'
  }

  // Returns 'confirm' when a confirmation email was sent, 'ok' when the
  // account is signed in straight away (only if email confirmation is turned
  // off in Supabase), or false on failure.
  const signUp = async (email, password) => {
    setAuthError(null)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin }
    })
    if (error) { setAuthError(friendlyError(error)); return false }
    // Supabase hides whether an email is already registered by returning a
    // user with no identities. Say so plainly instead of showing a
    // "check your email" message that will never arrive.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setAuthError('There is already an account with that email. Try signing in, or use Continue with Google.')
      return false
    }
    return data.session ? 'ok' : 'confirm'
  }

  const sendPasswordReset = async (email) => {
    setAuthError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    if (error) { setAuthError(friendlyError(error)); return false }
    return true
  }

  const updatePassword = async (password) => {
    setAuthError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setAuthError(friendlyError(error)); return false }
    setRecovering(false)
    return true
  }

  const logout = () => supabase.auth.signOut()

  const value = {
    session,
    user: session?.user ?? null,
    loading: session === undefined,
    signInWithGoogle,
    signIn,
    signUp,
    sendPasswordReset,
    updatePassword,
    recovering,
    authError,
    clearAuthError: () => setAuthError(null),
    logout
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
