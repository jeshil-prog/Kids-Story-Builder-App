import React, { useState, useRef } from 'react'
import { useStore } from '../lib/store'
import { Avatar, Button, Input, Spinner } from '../components/UI'

const PERSONALITIES = ['Brave', 'Curious', 'Funny', 'Kind', 'Adventurous', 'Clever', 'Gentle', 'Playful']

const MAX_PHOTO_SIZE = 800
const PHOTO_QUALITY = 0.8

function compressImage(dataUrl, mimeType) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > height) {
        if (width > MAX_PHOTO_SIZE) { height = Math.round(height * MAX_PHOTO_SIZE / width); width = MAX_PHOTO_SIZE }
      } else {
        if (height > MAX_PHOTO_SIZE) { width = Math.round(width * MAX_PHOTO_SIZE / height); height = MAX_PHOTO_SIZE }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY))
    }
    img.src = dataUrl
  })
}

function CharacterForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '')
  const [age, setAge] = useState(initial?.age || '')
  const [personality, setPersonality] = useState(initial?.personality || '')
  const [role, setRole] = useState(initial?.role || '')
  const [photo, setPhoto] = useState(initial?.photo || null)
  const [photoBase64, setPhotoBase64] = useState(initial?.photoBase64 || null)
  const [photoMime, setPhotoMime] = useState(initial?.photoMime || 'image/jpeg')
  const [description, setDescription] = useState(initial?.description || '')
  const [analysing, setAnalysing] = useState(false)
  const fileRef = useRef()

  const handlePhoto = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      // Compress before storing
      const compressed = await compressImage(reader.result, file.type)
      const base64 = compressed.split(',')[1]

      setPhoto(compressed)
      setPhotoBase64(base64)
      setPhotoMime('image/jpeg')

      // Auto-analyse the photo
      if (name || initial?.name) {
        setAnalysing(true)
        try {
          const res = await fetch('/api/describe-character', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              photoBase64: base64,
              mimeType: 'image/jpeg',
              name: name || initial?.name,
              age: age || initial?.age
            })
          })
          if (res.ok) {
            const { description: desc } = await res.json()
            setDescription(desc)
          }
        } catch (err) {
          console.error('Photo analysis failed:', err)
        }
        setAnalysing(false)
      }
    }
    reader.readAsDataURL(file)
  }

  // Also analyse when name is filled in after photo
  const handleAnalyse = async () => {
    if (!photoBase64 || analysing) return
    setAnalysing(true)
    try {
      const res = await fetch('/api/describe-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoBase64, mimeType: photoMime, name, age })
      })
      if (res.ok) {
        const { description: desc } = await res.json()
        setDescription(desc)
      }
    } catch {}
    setAnalysing(false)
  }

  const valid = name.trim().length > 0

  const handleSave = () => {
    if (!valid) return
    onSave({ name, age, personality, role, photo, photoBase64, photoMime, description })
  }

  return (
    <div style={{ background: 'var(--surface-card)', border: '0.5px solid var(--border)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Photo upload */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          onClick={() => fileRef.current.click()}
          style={{
            width: 80, height: 80, borderRadius: '50%', cursor: 'pointer',
            border: '2px dashed var(--border-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0, transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#534AB7'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
        >
          {photo
            ? <img src={photo} alt="character" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 28, color: 'var(--text-muted)' }}>📷</span>
          }
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Photo</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Upload a clear photo — we'll analyse it to describe the character for the illustrator.
          </p>
          <button onClick={() => fileRef.current.click()} style={{ fontSize: 12, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}>
            {photo ? 'Change photo' : 'Upload photo'}
          </button>
        </div>
      </div>

      <Input label="Name *" value={name} onChange={setName} placeholder="e.g. Beau" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Input label="Age" value={age} onChange={setAge} placeholder="e.g. 7" type="number" />
        <Input label="Role" value={role} onChange={setRole} placeholder="e.g. Hero, Sidekick" />
      </div>

      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>Personality</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {PERSONALITIES.map(p => (
            <button key={p} onClick={() => setPersonality(personality === p ? '' : p)} style={{
              padding: '5px 14px', borderRadius: 100, fontSize: 12, cursor: 'pointer',
              border: '0.5px solid', transition: 'all 0.15s',
              background: personality === p ? '#EEEDFE' : 'transparent',
              borderColor: personality === p ? '#534AB7' : 'var(--border-strong)',
              color: personality === p ? '#3C3489' : 'var(--text-secondary)',
              fontWeight: personality === p ? 500 : 400
            }}>{p}</button>
          ))}
        </div>
      </div>

      {/* AI-generated appearance description */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
            Appearance description
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>used to draw the character</span>
          </p>
          {photo && !analysing && (
            <button onClick={handleAnalyse} style={{ fontSize: 12, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer' }}>
              Re-analyse photo ↻
            </button>
          )}
        </div>
        {analysing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface-input)', borderRadius: 10, border: '0.5px solid var(--border)' }}>
            <Spinner size={16} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Analysing photo…</span>
          </div>
        ) : (
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={photo ? 'Upload a photo and we\'ll fill this in automatically…' : 'e.g. A boy with short brown hair, blue eyes, and a wide smile…'}
            rows={3}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10,
              border: '0.5px solid var(--border)', background: 'var(--surface-input)',
              fontFamily: 'inherit', fontSize: 13, color: 'var(--text-primary)',
              resize: 'none', lineHeight: 1.6, outline: 'none', boxSizing: 'border-box'
            }}
          />
        )}
        {description && (
          <p style={{ fontSize: 11, color: '#1D9E75', marginTop: 5 }}>
            ✓ Description ready — this will be used in every scene illustration
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <Button onClick={onCancel} variant="secondary" style={{ flex: 1 }}>Cancel</Button>
        <Button onClick={handleSave} disabled={!valid} style={{ flex: 1 }}>
          Save character
        </Button>
      </div>
    </div>
  )
}

export default function Characters() {
  const { characters, addCharacter, updateCharacter, deleteCharacter } = useStore()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)

  return (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Characters</h2>
        {!adding && (
          <Button onClick={() => setAdding(true)} style={{ padding: '8px 16px', fontSize: 13 }}>
            + Add character
          </Button>
        )}
      </div>

      {adding && (
        <CharacterForm
          onSave={(data) => { addCharacter(data); setAdding(false) }}
          onCancel={() => setAdding(false)}
        />
      )}

      {characters.length === 0 && !adding && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 28, marginBottom: 12 }}>🧒</p>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>No characters yet</p>
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>Add your family members to star in your stories.</p>
        </div>
      )}

      {characters.map(c => (
        editing === c.id
          ? <CharacterForm
              key={c.id}
              initial={c}
              onSave={(data) => { updateCharacter(c.id, data); setEditing(null) }}
              onCancel={() => setEditing(null)}
            />
          : (
            <div key={c.id} style={{
              background: 'var(--surface-card)', border: '0.5px solid var(--border)',
              borderRadius: 16, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14
            }}>
              <Avatar name={c.name} photo={c.photo} size={52} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 3 }}>{c.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {[c.age && `Age ${c.age}`, c.role, c.personality].filter(Boolean).join(' · ')}
                </p>
                {c.description && (
                  <p style={{ fontSize: 11, color: '#1D9E75', marginTop: 3 }}>✓ Appearance analysed</p>
                )}
              </div>
              <button onClick={() => setEditing(c.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>Edit</button>
              <button onClick={() => deleteCharacter(c.id)} style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer', fontSize: 13 }}>Remove</button>
            </div>
          )
      ))}
    </div>
  )
}
