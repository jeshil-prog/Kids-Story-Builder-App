import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Tag } from './UI'
import StoryCover from './StoryCover'
import { langName } from '../lib/languages'

const actionStyle = { fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }

// A grid of story cards. Used for your own library (owner = true, with
// continue, export and delete) and for a friend's library (read only).
// continuedIds: stories that already have a next chapter, so "Continue" is not offered again.
export default function LibraryGrid({ stories, owner = false, onDelete, continuedIds, newStoryTile = false }) {
  const navigate = useNavigate()
  return (
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
          <StoryCover
            story={s}
            index={i}
            pill={s.toBeContinued ? (
              <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, fontWeight: 600, padding: '2px 8px', background: '#534AB7', color: 'white', borderRadius: 100 }}>
                To be continued…
              </span>
            ) : null}
          />
          <div style={{ padding: '10px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
              {s.characters?.map(c => c.name).join(' · ')}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {s.genre && <Tag>{s.genre}</Tag>}
              {s.language && s.language !== 'en' && <Tag>{langName(s.language)}</Tag>}
              <Tag>{s.scenes?.length} {s.scenes?.length === 1 ? 'page' : 'pages'}</Tag>
            </div>
            {owner && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 'auto', paddingTop: 6 }}>
                {s.toBeContinued && !continuedIds?.has(s.id) && (
                  <button onClick={e => { e.stopPropagation(); navigate(`/create?continue=${s.id}`) }} style={{ ...actionStyle, color: '#534AB7', fontWeight: 600 }}>
                    Continue
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); navigate(`/story/${s.id}/print`) }} style={{ ...actionStyle, color: '#534AB7' }}>
                  Export
                </button>
                <button onClick={e => { e.stopPropagation(); onDelete?.(s.id) }} style={{ ...actionStyle, color: 'var(--text-muted)' }}>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
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
