import React from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Characters from './pages/Characters'
import Create from './pages/Create'
import StoryPlayer from './pages/StoryPlayer'
import Library from './pages/Library'
import Login from './pages/Login'
import Welcome from './pages/Welcome'
import ResetPassword from './pages/ResetPassword'
import Friends from './pages/Friends'
import Profile from './pages/Profile'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { useStore } from './lib/store'
import { supabase } from './lib/supabaseClient'

function FullPageSpinner() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: '#534AB7', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } `}</style>
    </div>
  )
}

// Wraps every real page. Redirects to /login if there's no session, sends
// first-time users to /welcome to pick a plan before anything else, and
// waits for the store's Supabase-backed character/story data to finish
// loading before rendering children — every page was originally built
// assuming that data was already synchronously present from localStorage on
// first render, so this preserves that same guarantee now that it's async.
function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const init = useStore(s => s.init)
  const initialized = useStore(s => s.initialized)
  const storeUserId = useStore(s => s.userId)
  const [onboarded, setOnboarded] = React.useState(undefined) // undefined = not checked yet

  React.useEffect(() => {
    if (!loading && user && storeUserId !== user.id) {
      init(user.id)
    }
  }, [loading, user, storeUserId, init])

  React.useEffect(() => {
    if (loading || !user) return
    supabase.from('profiles').select('onboarded').eq('id', user.id).single()
      .then(({ data }) => setOnboarded(!!data?.onboarded))
  }, [loading, user])

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (onboarded === undefined) return <FullPageSpinner />
  if (!onboarded) return <Navigate to="/welcome" replace />
  if (!initialized || storeUserId !== user.id) return <FullPageSpinner />
  return children
}

// /welcome needs a session but deliberately does NOT require onboarding to
// already be complete — that's the whole point of the page.
function RequireSession({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function Nav() {
  const loc = useLocation()
  const { logout } = useAuth()
  const isStory = loc.pathname.startsWith('/story/')
  const isLogin = loc.pathname === '/login'
  const isWelcome = loc.pathname === '/welcome'
  const isLegal = loc.pathname === '/privacy' || loc.pathname === '/terms'
  const isReset = loc.pathname === '/reset-password'
  if (isStory || isLogin || isWelcome || isLegal || isReset) return null

  const tabs = [
    { to: '/', label: 'Home', icon: '🏠' },
    { to: '/create', label: 'Create', icon: '✨' },
    { to: '/characters', label: 'Characters', icon: '🧒' },
    { to: '/friends', label: 'Friends', icon: '🤝' },
    { to: '/library', label: 'Library', icon: '📚' },
    { to: '/profile', label: 'Profile', icon: '👤' },
  ]

  return (
    <>
      <style>{`
        .sd-topnav { display: flex; }
        .sd-bottomnav { display: none; }
        @media (max-width: 720px) {
          .sd-topnav { display: none; }
          .sd-bottomnav { display: flex; }
          .sd-page-content { padding-bottom: calc(58px + env(safe-area-inset-bottom, 0px)); }
        }
      `}</style>

      {/* Desktop: full top bar with text labels, same as before */}
      <div className="sd-topnav" style={{
        background: 'var(--surface-nav)',
        borderBottom: '0.5px solid var(--border)',
        padding: '0 16px',
        alignItems: 'center', gap: 8,
        height: '52px',
        flexShrink: 0, width: '100%', boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#534AB7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🌙</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>StoryDream</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, alignItems: 'center' }}>
          {tabs.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              style={({ isActive }) => ({
                padding: '6px 10px', borderRadius: 8, fontSize: 12,
                color: isActive ? '#3C3489' : 'var(--text-secondary)',
                background: isActive ? '#EEEDFE' : 'transparent',
                fontWeight: isActive ? 600 : 400,
                textDecoration: 'none', transition: 'all 0.15s',
                whiteSpace: 'nowrap'
              })}
            >
              {t.label}
            </NavLink>
          ))}
          <button
            onClick={logout}
            style={{ marginLeft: 4, padding: '6px 10px', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Log out
          </button>
        </div>
      </div>

      {/* Mobile: fixed bottom tab bar — the standard pattern for primary
          mobile navigation, rather than squeezing 6 destinations into a
          horizontal top row. No "Log out" here — it's already on the
          Profile page itself, so this isn't losing anything, just removing
          a redundant, space-competing entry. */}
      <div className="sd-bottomnav" style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 100,
        background: 'var(--surface-nav)',
        borderTop: '0.5px solid var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        justifyContent: 'space-around', alignItems: 'stretch',
        boxSizing: 'border-box'
      }}>
        {tabs.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            aria-label={t.label}
            style={({ isActive }) => ({
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              padding: '8px 2px 6px',
              color: isActive ? '#3C3489' : 'var(--text-secondary)',
              textDecoration: 'none'
            })}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 500 }}>{t.label}</span>
          </NavLink>
        ))}
      </div>
    </>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Public — deliberately NOT behind RequireAuth. These need to be
          visible to logged-out visitors and to Google's own OAuth review,
          which is the whole reason they exist. */}
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/welcome" element={<RequireSession><Welcome /></RequireSession>} />
      <Route path="/reset-password" element={<RequireSession><ResetPassword /></RequireSession>} />
      <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
      <Route path="/create" element={<RequireAuth><Create /></RequireAuth>} />
      <Route path="/characters" element={<RequireAuth><Characters /></RequireAuth>} />
      <Route path="/friends" element={<RequireAuth><Friends /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
      <Route path="/story/:id" element={<RequireAuth><StoryPlayer /></RequireAuth>} />
      <Route path="/library" element={<RequireAuth><Library /></RequireAuth>} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--surface-0)', overflowX: 'hidden' }}>
          <Nav />
          <div className="sd-page-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', overflowX: 'hidden' }}>
            <AppRoutes />
          </div>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}
