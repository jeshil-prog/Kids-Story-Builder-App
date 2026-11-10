import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import { Avatar, Button, Input, Spinner } from '../components/UI'
import SmartImage from '../components/SmartImage'

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

// We never keep photos of people. A photo is used for one moment: it is turned
// into a cartoon (Pixar style) portrait, and described for the illustrator. Only
// the cartoon and the description are saved. The photo lives in this form's
// memory until it is closed, and is then gone.
function CharacterForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '')
  const [age, setAge] = useState(initial?.age || '')
  const [personality, setPersonality] = useState(initial?.personality || '')
  const [role, setRole] = useState(initial?.role || '')
  // The cartoon portrait that gets saved. An old stored photo is not reused: it is
  // only shown until it has been replaced.
  const [portraitUrl, setPortraitUrl] = useState(initial?.photoUrl && initial.photoUrl.includes('/avatars/') ? initial.photoUrl : null)
  const [legacyPhotoUrl] = useState(initial?.photoUrl && !initial.photoUrl.includes('/avatars/') ? initial.photoUrl : null)
  // The photo itself, in memory only, so the portrait can be made again.
  const [photoBase64, setPhotoBase64] = useState(null)
  const [makingPortrait, setMakingPortrait] = useState(false)
  const [portraitError, setPortraitError] = useState(null)
  const [description, setDescription] = useState(initial?.description || '')
  const [analysing, setAnalysing] = useState(false)
  const fileRef = useRef()
  // handleSave waits for the portrait if it is still being made.
  const portraitPromiseRef = useRef(null)

  const authHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` }
  }

  const makePortrait = (base64) => {
    setMakingPortrait(true)
    setPortraitError(null)
    const run = (async () => {
      try {
        const res = await fetch('/api/generate-avatar', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ photoBase64: base64, mimeType: 'image/jpeg' })
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.url) throw new Error(data.error || 'Could not make the portrait.')
        setPortraitUrl(data.url)
      } catch (err) {
        setPortraitError(err.message || 'Could not make the portrait.')
      } finally {
        setMakingPortrait(false)
      }
    })()
    portraitPromiseRef.current = run
    return run
  }

  const analysePhoto = async (base64, nameToUse, ageToUse) => {
    setAnalysing(true)
    try {
      const res = await fetch('/api/describe-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoBase64: base64, mimeType: 'image/jpeg', name: nameToUse, age: ageToUse })
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

  const handlePhoto = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const compressed = await compressImage(reader.result, file.type)
      const base64 = compressed.split(',')[1]
      setPhotoBase64(base64)
      setPortraitUrl(null)
      // The cartoon and the description are made side by side.
      makePortrait(base64)
      analysePhoto(base64, name || initial?.name || 'the character', age || initial?.age)
    }
    reader.readAsDataURL(file)
  }

  const handleAnalyse = () => {
    if (!photoBase64 || analysing) return
    analysePhoto(photoBase64, name, age)
  }

  // Describe the photo once a name is typed, if it was added before the name.
  const handleNameChange = (val) => {
    setName(val)
    if (val.trim().length > 1 && photoBase64 && !description && !analysing) {
      setTimeout(() => {
        if (val.trim().length > 1) handleAnalyse()
      }, 800)
    }
  }

  const valid = name.trim().length > 0

  const handleSave = async () => {
    if (!valid) return
    if (portraitPromiseRef.current) await portraitPromiseRef.current
    // Only the cartoon portrait is saved. Never a photo.
    onSave({ name, age, personality, role, photoUrl: portraitUrl, description })
  }

  const showing = portraitUrl || legacyPhotoUrl

  return (
    <div style={{ background: 'var(--surface-card)', border: '0.5px solid var(--border)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Portrait */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          onClick={() => !makingPortrait && fileRef.current.click()}
          style={{
            width: 80, height: 80, borderRadius: '50%', cursor: 'pointer',
            border: '2px dashed var(--border-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0, transition: 'border-color 0.15s', position: 'relative'
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#534AB7'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
        >
          {makingPortrait
            ? <Spinner size={22} />
            : showing
              ? <SmartImage src={showing} alt="Cartoon portrait" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : <span style={{ fontSize: 28, color: 'var(--text-muted)' }}>📷</span>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Cartoon portrait</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Upload a clear photo and we turn it into a Pixar style portrait. We describe the photo for the illustrator, then the photo is thrown away. Only the cartoon is kept.
          </p>
          <button onClick={() => fileRef.current.click()} disabled={makingPortrait} style={{ fontSize: 12, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}>
            {makingPortrait ? 'Making the portrait…' : portraitUrl ? 'Use a different photo' : 'Upload photo'}
          </button>
          {portraitError && (
            <p style={{ fontSize: 12, color: '#E24B4A', margin: '6px 0 0', lineHeight: 1.5 }}>
              {portraitError}{' '}
              {photoBase64 && <button onClick={() => makePortrait(photoBase64)} style={{ fontSize: 12, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Try again</button>}
            </p>
          )}
          {legacyPhotoUrl && !portraitUrl && !makingPortrait && (
            <p style={{ fontSize: 12, color: '#B26A00', margin: '6px 0 0', lineHeight: 1.5 }}>
              This character still has a stored photo. Upload a photo to replace it with a cartoon portrait.
            </p>
          )}
        </div>
      </div>

      <Input label="Name *" value={name} onChange={handleNameChange} placeholder="e.g. Beau" />

      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 12 }}>
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

      {/* Appearance description, written from the photo */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
            Appearance description
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>used to draw the character</span>
          </p>
          {photoBase64 && !analysing && (
            <button onClick={handleAnalyse} style={{ fontSize: 12, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer' }}>
              Describe the photo again ↻
            </button>
          )}
        </div>
        {analysing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface-input)', borderRadius: 10, border: '0.5px solid var(--border)' }}>
            <Spinner size={16} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Looking at the photo…</span>
          </div>
        ) : (
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={photoBase64 ? 'We will fill this in from the photo…' : 'e.g. A boy with short brown hair, blue eyes, and a wide smile…'}
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
            ✓ Description ready. It will be used in every scene illustration.
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <Button onClick={onCancel} variant="secondary" style={{ flex: 1 }}>Cancel</Button>
        <Button onClick={handleSave} disabled={!valid || makingPortrait} style={{ flex: 1 }}>
          {makingPortrait ? 'Making portrait…' : 'Save character'}
        </Button>
      </div>
    </div>
  )
}

const TIER_CHARACTER_LIMITS = { free: 2, tier1: 6, tier2: Infinity }

export default function Characters() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { characters, addCharacter, updateCharacter, deleteCharacter } = useStore()
  const [searchParams] = useSearchParams()
  // Coming from the Create page's "New character" button opens the form straight away.
  const [adding, setAdding] = useState(() => searchParams.get('new') === '1')
  const [editing, setEditing] = useState(null)
  const [tier, setTier] = useState('free')
  const [tierLoaded, setTierLoaded] = useState(false)

  useEffect(() => {
    supabase.from('subscriptions').select('tier, status').eq('user_id', user.id).single()
      .then(({ data }) => { setTier(data?.status === 'active' ? (data.tier || 'free') : 'free'); setTierLoaded(true) })
  }, [user.id])

  const ownCharacters = characters.filter(c => c.ownerId === user.id)

  // Characters made before cartoon portraits still have a stored photo. We no
  // longer keep photos of people, so they are offered a one tap conversion.
  const legacy = ownCharacters.filter(c => c.photoUrl && !c.photoUrl.includes('/avatars/'))
  const [converting, setConverting] = useState(null) // { done, total } while running
  const [convertErrors, setConvertErrors] = useState([])
  const convertAll = async () => {
    const list = [...legacy]
    setConvertErrors([])
    setConverting({ done: 0, total: list.length })
    const failed = []
    for (let i = 0; i < list.length; i++) {
      const c = list[i]
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/generate-avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ sourceUrl: c.photoUrl })
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.url) throw new Error(data.error || 'failed')
        // The server has already swapped the photo for the cartoon and deleted
        // the photo. This brings the screen up to date.
        await updateCharacter(c.id, { photoUrl: data.url })
      } catch (err) {
        failed.push(c.name)
      }
      setConverting({ done: i + 1, total: list.length })
    }
    setConvertErrors(failed)
    setConverting(null)
  }

  const limit = TIER_CHARACTER_LIMITS[tier] ?? TIER_CHARACTER_LIMITS.free
  const atLimit = ownCharacters.length >= limit

  // If the form was opened from a link but this plan is already full, close it
  // (the limit notice in the header takes over).
  useEffect(() => {
    if (tierLoaded && atLimit && adding) setAdding(false)
  }, [tierLoaded, atLimit, adding])

  return (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/create')} style={{ background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>← Create</button>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>Characters</h2>
        </div>
        {!adding && (
          atLimit ? (
            <Link to="/profile?tab=plan" style={{ fontSize: 12, color: '#534AB7', fontWeight: 600, textDecoration: 'none' }}>
              🔒 {ownCharacters.length}/{limit} used. Upgrade for more
            </Link>
          ) : (
            <Button onClick={() => setAdding(true)} style={{ padding: '8px 16px', fontSize: 13 }}>
              + Add character
            </Button>
          )
        )}
      </div>

      {legacy.length > 0 && !adding && (
        <div style={{ background: '#FFF6E5', border: '1px solid #F2C879', borderRadius: 14, padding: '14px 16px' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#5A3A00', margin: '0 0 4px' }}>We no longer keep photos of people</p>
          <p style={{ fontSize: 13, color: '#7A5400', margin: '0 0 10px', lineHeight: 1.5 }}>
            {legacy.length === 1 ? '1 character still has' : `${legacy.length} characters still have`} a stored photo. Turn {legacy.length === 1 ? 'it' : 'them'} into cartoon portraits and the photos will be deleted for good.
          </p>
          <button onClick={convertAll} disabled={!!converting} style={{ background: '#534AB7', color: 'white', border: 'none', borderRadius: 100, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: converting ? 'wait' : 'pointer', opacity: converting ? 0.7 : 1 }}>
            {converting ? `Converting ${Math.min(converting.done + 1, converting.total)} of ${converting.total}…` : 'Turn photos into portraits'}
          </button>
          {convertErrors.length > 0 && (
            <p style={{ fontSize: 12, color: '#A32D2D', margin: '8px 0 0' }}>Could not convert: {convertErrors.join(', ')}. You can try again, or open the character and upload a different photo.</p>
          )}
        </div>
      )}

      {adding && (
        <CharacterForm
          onSave={async (data) => { await addCharacter(data); setAdding(false); navigate('/create?autoselect=new') }}
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
              onSave={async (data) => { await updateCharacter(c.id, data); setEditing(null) }}
              onCancel={() => setEditing(null)}
            />
          : (
            <div key={c.id} style={{
              background: 'var(--surface-card)', border: '0.5px solid var(--border)',
              borderRadius: 16, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14
            }}>
              <Avatar name={c.name} photo={c.photoUrl || c.photo} size={52} />
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
