import React from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Characters from './pages/Characters'
import Create from './pages/Create'
import StoryPlayer from './pages/StoryPlayer'
import Library from './pages/Library'

function Nav() {
  const loc = useLocation()
  const [narrow, setNarrow] = React.useState(window.innerWidth < 400)
  React.useEffect(() => {
    const handler = () => setNarrow(window.innerWidth < 400)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  const isStory = loc.pathname.startsWith('/story/')
  if (isStory) return null

  const tabs = [
    { to: '/', label: 'Home', icon: '🏠' },
    { to: '/create', label: 'Create', icon: '✨' },
    { to: '/characters', label: 'Characters', icon: '🧒' },
    { to: '/library', label: 'Library', icon: '📚' },
  ]

  return (
    <>
      {/* Top nav */}
      <div style={{
        background: 'var(--surface-nav)',
        borderBottom: '0.5px solid var(--border)',
        padding: '0 16px',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        display: 'flex', alignItems: 'center', gap: 8,
        height: 'calc(52px + env(safe-area-inset-top, 0px))',
        flexShrink: 0, width: '100%', boxSizing: 'border-box',
        overflowX: 'hidden'  
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#534AB7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🌙</div>
          {!narrow && <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>StoryDream</span>}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
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
        </div>
      </div>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--surface-0)', overflowX: 'hidden' }}>
        <Nav />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', overflowX: 'hidden' }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create" element={<Create />} />
            <Route path="/characters" element={<Characters />} />
            <Route path="/story/:id" element={<StoryPlayer />} />
            <Route path="/library" element={<Library />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
