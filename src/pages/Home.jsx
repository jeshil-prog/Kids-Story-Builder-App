import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Avatar, SectionLabel, Tag } from '../components/UI'

const GENRE_EMOJI = { Ocean:'🌊', Bedtime:'🌙', Fantasy:'🧙', Space:'🚀', Jungle:'🦁', Comedy:'😄', Adventure:'⚗️', Magic:'✨' }

export default function Home() {
  const navigate = useNavigate()
  const { characters, stories } = useStore()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, padding: '24px 20px', overflowY: 'auto', flex: 1 }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #534AB7 0%, #3C3489 100%)',
        borderRadius: 20, padding: 28, color: 'white', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: -24, right: -24, width: 160, height: 160, background: '#7F77DD', borderRadius: '50%', opacity: 0.3 }} />
        <div style={{ position: 'absolute', bottom: -32, right: 48, width: 100, height: 100, background: '#26215C', borderRadius: '50%' }} />
        <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.65, marginBottom: 8 }}>Personalised bedtime stories</p>
        <h1 style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.3, marginBottom: 8, position: 'relative', zIndex: 1 }}>
          Every night, a new adventure starring your family
        </h1>
        <p style={{ fontSize: 13, opacity: 0.75, marginBottom: 20, lineHeight: 1.6, position: 'relative', zIndex: 1 }}>
          Add your family's characters and watch them star in magical, illustrated bedtime stories — read aloud, just for them.
        </p>
        <button
          onClick={() => navigate('/create')}
          style={{
            background: 'white', color: '#3C3489', border: 'none', borderRadius: 10,
            padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: 6
          }}
        >
          ✨ Create a story
        </button>
      </div>

      {/* Characters */}
      <div>
        <SectionLabel>Your characters</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {characters.map(c => (
            <div
              key={c.id}
              onClick={() => navigate('/characters')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--surface-card)', border: '0.5px solid var(--border)',
                borderRadius: 100, padding: '6px 16px 6px 6px', cursor: 'pointer',
                transition: 'border-color 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#7F77DD'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <Avatar name={c.name} photo={c.photo} size={28} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
            </div>
          ))}
          <button
            onClick={() => navigate('/characters')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px',
              background: 'transparent', border: '0.5px dashed var(--border-strong)',
              borderRadius: 100, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer'
            }}
          >
            + Add character
          </button>
        </div>
      </div>

      {/* Recent stories */}
      {stories.length > 0 && (
        <div>
          <SectionLabel>Recent stories</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {stories.slice(0, 6).map(s => (
              <div
                key={s.id}
                onClick={() => navigate(`/story/${s.id}`)}
                style={{
                  background: 'var(--surface-card)', border: '0.5px solid var(--border)',
                  borderRadius: 14, overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#7F77DD'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{
                  height: 90, background: s.scenes?.[0]?.imageData ? 'transparent' : '#1a1830',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, overflow: 'hidden'
                }}>
                  {s.scenes?.[0]?.imageData
                    ? <img src={`data:${s.scenes[0].imageType || 'image/png'};base64,${s.scenes[0].imageData}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (GENRE_EMOJI[s.genre] || '📖')}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{s.title}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.characters?.map(c => c.name).join(' · ')} · {s.scenes?.length} scenes</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stories.length === 0 && characters.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>🌙</p>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Your first story is waiting</p>
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>Add your family as characters, then create your first personalised bedtime story.</p>
        </div>
      )}
    </div>
  )
}
