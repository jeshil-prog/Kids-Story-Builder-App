import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Tag } from './UI'
import { langName } from '../lib/languages'

const GENRE_EMOJI = { Ocean: '🌊', Bedtime: '🌙', Fantasy: '🧙', Space: '🚀', Jungle: '🦁', Comedy: '😄', Adventure: '⚗️', Magic: '✨' }
const PALETTE = ['#0F3460', '#1a0533', '#023020', '#1a1000', '#2d0a20', '#001a2d']

const actionStyle = { fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }

// A grid of story cards. Used for your own library (owner = true, with
// continue, print and delete) and for a friend's library (read only).
export default function LibraryGrid({ stories, owner = false, onDelete, newStoryTile = false }) {
  const navigate = useNavigate()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 14 }}>
      {stories.map((s, i) => {
        const cover = s.scenes?.[0]?.imageUrl
        return (
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
              background: cover ? 'transparent' : PALETTE[i % PALETTE.length],
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, overflow: 'hidden'
            }}>
              {cover
                ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : GENRE_EMOJI[s.genre] || '📖'}
              <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 9, padding: '2px 7px', background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.8)', borderRadius: 100 }}>
                {s.scenes?.length} {s.scenes?.length === 1 ? 'scene' : 'scenes'}
              </span>
              {s.toBeContinued && (
                <span style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 10, fontWeight: 600, padding: '2px 8px', background: '#534AB7', color: 'white', borderRadius: 100 }}>
                  To be continued…
                </span>
              )}
            </div>
            <div style={{ padding: '10px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, margin: 0 }}>{s.title}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                {s.characters?.map(c => c.name).join(' · ')}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 'auto', paddingTop: 6 }}>
                {s.genre && <Tag>{s.genre}</Tag>}
                {s.chapterNumber > 1 && <Tag>Chapter {s.chapterNumber}</Tag>}
                {s.language && s.language !== 'en' && <Tag>{langName(s.language)}</Tag>}
              </div>
              {owner && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 6 }}>
                  {s.toBeContinued && (
                    <button onClick={e => { e.stopPropagation(); navigate(`/create?continue=${s.id}`) }} style={{ ...actionStyle, color: '#534AB7', fontWeight: 600 }}>
                      Continue
                    </button>
                  )}
                  <button onClick={e => { e.stopPropagation(); navigate(`/story/${s.id}/print`) }} style={{ ...actionStyle, color: '#534AB7' }}>
                    Print
                  </button>
                  <button onClick={e => { e.stopPropagation(); if (confirm(`Delete "${s.title}"?`)) onDelete?.(s.id) }} style={{ ...actionStyle, color: 'var(--text-muted)' }}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
      {newStoryTile && (
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
      )}
    </div>
  )
}
