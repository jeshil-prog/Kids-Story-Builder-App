import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, libraryOf, pickupOf } from '../lib/store'
import { Avatar, SectionLabel } from '../components/UI'
import StoryCover from '../components/StoryCover'

const PAGE = 4

export default function Home() {
  const navigate = useNavigate()
  const characters = useStore(s => s.characters)
  const stories = useStore(s => s.stories)
  const saveToLibrary = useStore(s => s.saveToLibrary)
  const dismissPickup = useStore(s => s.dismissPickup)
  const [shown, setShown] = useState(PAGE)
  const [busyId, setBusyId] = useState(null)

  const library = libraryOf(stories)
  const pickups = pickupOf(stories).slice(0, 3)
  const hasAnything = library.length > 0 || characters.length > 0

  const save = async (id) => {
    setBusyId(id)
    try { await saveToLibrary(id) } catch { alert('Could not save the story. Please try again.') }
    setBusyId(null)
  }
  const dismiss = async (s) => {
    if (!s.inLibrary && !confirm('This story has not been saved. If you dismiss it, it will be removed. Dismiss it?')) return
    try { await dismissPickup(s.id) } catch { alert('Could not dismiss the story. Please try again.') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, padding: '24px 20px', overflowY: 'auto', flex: 1 }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #534AB7 0%, #3C3489 100%)',
        borderRadius: 20, padding: 28, color: 'white', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: -24, right: -24, width: 160, height: 160, background: '#7F77DD', borderRadius: '50%', opacity: 0.3 }} />
        <div style={{ position: 'absolute', bottom: -32, right: 48, width: 100, height: 100, background: '#26215C', borderRadius: '50%' }} />
        <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.65, marginBottom: 8 }}>Personalised stories</p>
        <h1 style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.3, marginBottom: 8, position: 'relative', zIndex: 1 }}>
          A new adventure, starring your family
        </h1>
        <p style={{ fontSize: 13, opacity: 0.75, marginBottom: 20, lineHeight: 1.6, position: 'relative', zIndex: 1 }}>
          Add your family's characters and watch them star in magical, illustrated stories, read aloud just for them.
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

      {/* Pick up where you left off: a to be continued story waiting for its next chapter */}
      {pickups.length > 0 && (
        <div>
          <SectionLabel>Pick up where you left off</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pickups.map(s => (
              <div key={s.id} style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--surface-card)', border: '0.5px solid var(--border)', borderRadius: 16, padding: 10 }}>
                <div onClick={() => navigate(`/story/${s.id}`)} style={{ width: 84, flexShrink: 0, borderRadius: 10, overflow: 'hidden', cursor: 'pointer' }}>
                  <StoryCover story={s} titleSize={0} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 2px', color: 'var(--text-primary)' }}>{s.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>
                    Chapter {s.chapterNumber} · To be continued{!s.inLibrary ? ' · Not saved yet' : ''}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px' }}>
                    <button onClick={() => navigate(`/create?continue=${s.id}`)} style={{ background: '#534AB7', color: 'white', border: 'none', borderRadius: 100, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      ✨ Write the next chapter
                    </button>
                    {!s.inLibrary && (
                      <button onClick={() => save(s.id)} disabled={busyId === s.id} style={{ background: 'none', border: 'none', color: '#534AB7', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                        {busyId === s.id ? 'Saving…' : 'Save to library'}
                      </button>
                    )}
                    <button onClick={() => dismiss(s)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: 0 }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
              <Avatar name={c.name} photo={c.photoUrl || c.photo} size={28} />
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

      {/* Recent stories: four at a time */}
      {library.length > 0 && (
        <div>
          <SectionLabel>Recent stories</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {library.slice(0, shown).map((s, i) => (
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
                <StoryCover story={s} index={i} />
                <div style={{ padding: '8px 12px 10px' }}>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                    {s.characters?.map(c => c.name).join(' · ')} · {s.scenes?.length} {s.scenes?.length === 1 ? 'page' : 'pages'}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 14 }}>
            {library.length > shown && (
              <button onClick={() => setShown(n => n + PAGE)} style={{ padding: '9px 22px', borderRadius: 100, fontSize: 13, fontWeight: 600, background: 'transparent', color: '#534AB7', border: '1px solid #534AB7', cursor: 'pointer' }}>
                See more
              </button>
            )}
            {shown > PAGE && library.length <= shown && (
              <button onClick={() => setShown(PAGE)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                Show less
              </button>
            )}
          </div>
        </div>
      )}

      {!hasAnything && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>🌙</p>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Your first story is waiting</p>
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>Add your family as characters, then create your first personalised story.</p>
        </div>
      )}
    </div>
  )
}
