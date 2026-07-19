import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = not checked yet, null = checked, no session
  const [authError, setAuthError] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Google handles identity verification entirely — no password, no
  // confirmation email, no custom SMTP dependency. Supabase auto-creates
  // the user (and, via the DB trigger, their profiles + free subscription
  // row) the first time someone completes this.
  const signInWithGoogle = async () => {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
    if (error) setAuthError(error.message)
  }

  const logout = () => supabase.auth.signOut()

  const value = {
    session,
    user: session?.user ?? null,
    loading: session === undefined,
    signInWithGoogle,
    authError,
    logout
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
