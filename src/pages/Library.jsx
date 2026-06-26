import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { SectionLabel, Tag } from '../components/UI'

const GENRE_EMOJI = { Ocean:'🌊', Bedtime:'🌙', Fantasy:'🧙', Space:'🚀', Jungle:'🦁', Comedy:'😄', Adventure:'⚗️', Magic:'✨' }
const PALETTE = ['#0F3460','#1a0533','#023020','#1a1000','#2d0a20','#001a2d']

export default function Library() {
  const navigate = useNavigate()
  const { stories, deleteStory } = useStore()

  if (stories.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 40, textAlign: 'center' }}>
        <p style={{ fontSize: 36 }}>📚</p>
        <p style={{ fontSize: 16, fontWeight: 600 }}>Your library is empty</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>Generated stories will be saved here automatically.</p>
        <button onClick={() => navigate('/create')} style={{ color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>Create your first story →</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Your library</h2>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{stories.length} {stories.length === 1 ? 'story' : 'stories'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 14 }}>
        {stories.map((s, i) => (
          <div
            key={s.id}
            style={{
              background: 'var(--surface-card)', border: '0.5px solid var(--border)',
              borderRadius: 16, overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.15s',
              display: 'flex', flexDirection: 'column'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#7F77DD'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            onClick={() => navigate(`/story/${s.id}`)}
          >
            <div style={{
              height: 100, position: 'relative',
              background: s.scenes?.[0]?.imageData ? 'transparent' : PALETTE[i % PALETTE.length],
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, overflow: 'hidden'
            }}>
              {s.scenes?.[0]?.imageData
                ? <img src={`data:${s.scenes[0].imageType || 'image/png'};base64,${s.scenes[0].imageData}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : GENRE_EMOJI[s.genre] || '📖'
              }
              <span style={{
                position: 'absolute', top: 8, right: 8, fontSize: 9, padding: '2px 7px',
                background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.8)',
                borderRadius: 100
              }}>{s.scenes?.length} scenes</span>
            </div>
            <div style={{ padding: '10px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{s.title}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {s.characters?.map(c => c.name).join(' · ')}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 'auto', paddingTop: 6 }}>
                {s.genre && <Tag>{s.genre}</Tag>}
              </div>
              <button
                onClick={e => { e.stopPropagation(); if (confirm(`Delete "${s.title}"?`)) deleteStory(s.id) }}
                style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, marginTop: 6 }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        <div
          onClick={() => navigate('/create')}
          style={{
            background: 'transparent', border: '0.5px dashed var(--border-strong)',
            borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 8, padding: 20, cursor: 'pointer', minHeight: 180,
            transition: 'border-color 0.15s', color: 'var(--text-muted)'
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#534AB7'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
        >
          <span style={{ fontSize: 24 }}>+</span>
          <span style={{ fontSize: 13 }}>New story</span>
        </div>
      </div>
    </div>
  )
}
