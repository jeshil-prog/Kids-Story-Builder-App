import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/AuthContext'
import { Spinner } from '../components/UI'
import { supabase } from '../lib/supabaseClient'
import { renderStoryPages, savePages } from '../lib/exportPages'

// A print ready version of a story: an optional front cover, one page for each
// scene (a full width picture on top, words underneath) and a closing page. Printing it, or
// choosing "Save as PDF" in the print window, gives a book that can be
// printed at home or at a print shop. It is built from the page itself, so it
// works in every story language without any extra files.

const PAPER = {
  a4: { label: 'A4', w: '210mm', h: '297mm', size: 'A4' },
  letter: { label: 'US Letter', w: '215.9mm', h: '279.4mm', size: '8.5in 11in' },
}
const FONT = "Georgia, 'Noto Serif', 'Noto Serif Devanagari', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', serif"

export default function PrintBook() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getStory } = useStore()
  const { user } = useAuth()
  const [story, setStory] = useState(undefined) // undefined = loading, null = not found
  const [paper, setPaper] = useState(() => {
    try { return localStorage.getItem('sd_paper') === 'letter' ? 'letter' : 'a4' } catch { return 'a4' }
  })
  const [imagesReady, setImagesReady] = useState(false)
  // The front cover is the same picture as the story's tile on the home page.
  const [withCover, setWithCover] = useState(() => {
    try { return localStorage.getItem('sd_cover') !== 'off' } catch { return true }
  })
  // Pages drawn as pictures, for saving to Photos. Made once the story's pictures are ready.
  const [photoPages, setPhotoPages] = useState(null) // null = not ready, array = ready, 'error'
  const [photoProgress, setPhotoProgress] = useState(null)
  const [photoMessage, setPhotoMessage] = useState(null)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let cancelled = false
    getStory(id).then(s => { if (!cancelled) setStory(s || null) })
    return () => { cancelled = true }
  }, [id])

  // Wait for every picture, so nothing prints as an empty box.
  useEffect(() => {
    if (!story) return
    const urls = (story.scenes || []).map(s => s.imageUrl).filter(Boolean)
    if (urls.length === 0) { setImagesReady(true); return }
    let left = urls.length
    let cancelled = false
    const done = () => { left -= 1; if (left <= 0 && !cancelled) setImagesReady(true) }
    urls.forEach(u => { const img = new Image(); img.onload = done; img.onerror = done; img.src = u })
    return () => { cancelled = true }
  }, [story])

  // Shrink the on screen preview to fit phones. Printing always uses full size.
  useEffect(() => {
    const fit = () => {
      const sheetPx = paper === 'a4' ? 794 : 816
      setZoom(Math.min(1, (window.innerWidth - 24) / sheetPx))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [paper])

  const chooseCover = (on) => {
    setWithCover(on)
    try { localStorage.setItem('sd_cover', on ? 'on' : 'off') } catch {}
  }

  // Draw the pages for "Save to Photos" in the background, so the button works in
  // a single tap (phones only allow sharing straight after a tap).
  useEffect(() => {
    if (!story || !imagesReady) return
    let cancelled = false
    setPhotoPages(null)
    setPhotoMessage(null)
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const files = await renderStoryPages(story, {
          withCover, token: session?.access_token,
          onProgress: (done, total) => { if (!cancelled) setPhotoProgress({ done, total }) }
        })
        if (!cancelled) { setPhotoPages(files); setPhotoProgress(null) }
      } catch (err) {
        console.error('Could not prepare the pages:', err)
        if (!cancelled) { setPhotoPages('error'); setPhotoProgress(null) }
      }
    })()
    return () => { cancelled = true }
  }, [story, imagesReady, withCover])

  const saveToPhotos = async () => {
    if (!Array.isArray(photoPages)) return
    const result = await savePages(photoPages)
    setPhotoMessage(result === 'downloaded' ? `Saved ${photoPages.length} pictures to your downloads.` : result === 'shared' ? 'Choose Save Image to put the pages in Photos.' : null)
  }

  const choosePaper = (p) => {
    setPaper(p)
    try { localStorage.setItem('sd_paper', p) } catch {}
  }

  const sheets = useMemo(() => story?.scenes || [], [story])
  const P = PAPER[paper]

  if (story === undefined) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}><Spinner /></div>
  if (!story || (story.ownerId && story.ownerId !== user?.id)) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40, textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>We could not find that story</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>You can only export stories from your own library.</p>
        <button onClick={() => navigate('/profile?tab=library')} style={{ color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>Back to my library</button>
      </div>
    )
  }

  const tbc = !!story.toBeContinued
  const names = (story.characters || []).map(c => c.name).filter(Boolean).join(', ')
  const cover = sheets[0]?.imageUrl
  const totalPages = sheets.length + 1 + (withCover ? 1 : 0)
  const firstSceneNumber = withCover ? 2 : 1

  const css = `
    @page { size: ${P.size}; margin: 0; }
    .pb-sheet { width: ${P.w}; height: ${P.h}; box-sizing: border-box; padding: 0; background: #fff; color: #1f1a2e;
      display: flex; flex-direction: column; overflow: hidden; position: relative; font-family: ${FONT}; margin: 0 auto 16px; box-shadow: 0 2px 14px rgba(0,0,0,0.18); }
    .pb-img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; display: block; flex: 0 0 auto; }
    .pb-num { position: absolute; bottom: 8mm; left: 0; right: 0; text-align: center; font-size: 10pt; color: #8a8497; }
    @media print {
      body * { visibility: hidden !important; }
      .pb-root, .pb-root * { visibility: visible !important; }
      .pb-root { position: absolute !important; left: 0; top: 0; width: 100%; zoom: 1 !important; padding: 0 !important; }
      .pb-noprint { display: none !important; }
      .pb-sheet { margin: 0 !important; box-shadow: none !important; break-after: page; page-break-after: always; }
      .pb-sheet:last-child { break-after: auto; page-break-after: auto; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `

  return (
    <div style={{ flex: 1, background: '#e9e7f0', minHeight: '100dvh', padding: '0 0 24px' }}>
      <style>{css}</style>

      <div className="pb-noprint" style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--surface-card, #fff)', borderBottom: '0.5px solid var(--border)', padding: '10px 14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#534AB7', fontSize: 14, cursor: 'pointer', padding: 0 }}>← Back</button>
        <div style={{ flex: 1, minWidth: 120 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{story.title}</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Export as a book · {totalPages} pages</p>
        </div>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={withCover} onChange={(e) => chooseCover(e.target.checked)} />
          Front cover
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          Paper
          <select value={paper} onChange={(e) => choosePaper(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, border: '0.5px solid var(--border)', fontSize: 13, background: 'var(--surface-input)', color: 'var(--text-primary)' }}>
            {Object.entries(PAPER).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <button
          onClick={() => window.print()} disabled={!imagesReady}
          style={{ padding: '9px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#534AB7', color: 'white', border: 'none', cursor: imagesReady ? 'pointer' : 'wait', opacity: imagesReady ? 1 : 0.6 }}
        >
          {imagesReady ? '🖨 Print or save as PDF' : 'Getting pictures ready…'}
        </button>
        <button
          onClick={saveToPhotos} disabled={!Array.isArray(photoPages)}
          style={{ padding: '9px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#1D9E75', color: 'white', border: 'none', cursor: Array.isArray(photoPages) ? 'pointer' : 'default', opacity: Array.isArray(photoPages) ? 1 : 0.6 }}
        >
          {Array.isArray(photoPages) ? '📱 Save to Photos' : photoPages === 'error' ? 'Photos not available' : photoProgress ? `Preparing page ${Math.min(photoProgress.done + 1, photoProgress.total)} of ${photoProgress.total}…` : 'Getting pictures ready…'}
        </button>
        {photoMessage && <p style={{ flexBasis: '100%', margin: 0, fontSize: 12, color: '#1D9E75' }}>{photoMessage}</p>}
        <p style={{ flexBasis: '100%', margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Print or save as PDF: in the window that opens, choose "Save as PDF" to keep a file, or pick your printer. Save to Photos: on a phone, choose Save Image in the menu that opens. On a computer the pages download as pictures.
        </p>
      </div>

      <div className="pb-root" style={{ paddingTop: 16, zoom }}>
        {/* Front cover: the same picture and title as the story's tile */}
        {withCover && (
          <div className="pb-sheet" style={{ background: '#26215C', color: '#fff' }}>
            {cover && <img src={cover} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '60mm 16mm 16mm', background: 'linear-gradient(to top, rgba(8,6,20,0.92) 0%, rgba(8,6,20,0.7) 45%, rgba(8,6,20,0) 100%)' }}>
              {story.chapterNumber > 1 && <p style={{ margin: '0 0 3mm', fontSize: '11pt', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.8)' }}>Chapter {story.chapterNumber}</p>}
              <h1 style={{ margin: '0 0 5mm', fontSize: '38pt', lineHeight: 1.12, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>{story.title}</h1>
              {story.tagline && <p style={{ margin: '0 0 6mm', fontSize: '14pt', fontStyle: 'italic', color: 'rgba(255,255,255,0.85)' }}>{story.tagline}</p>}
              {names && <p style={{ margin: '0 0 3mm', fontSize: '12pt', color: 'rgba(255,255,255,0.85)' }}>Starring {names}</p>}
              <p style={{ margin: 0, fontSize: '9pt', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>Made with StoryDream</p>
            </div>
          </div>
        )}

        {/* One page for each scene: the picture runs edge to edge, words underneath */}
        {sheets.map((sc, i) => {
          const len = (sc.narration || '').length
          const size = len > 330 ? '13pt' : len > 240 ? '14.5pt' : '16pt'
          return (
            <div className="pb-sheet" key={i}>
              {sc.imageUrl
                ? <img className="pb-img" src={sc.imageUrl} alt="" />
                : <div className="pb-img" style={{ background: '#f1eff7' }} />}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '5mm 14mm 12mm', overflow: 'hidden' }}>
                {sc.chapter && <p style={{ margin: '0 0 2.5mm', fontSize: '9.5pt', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7a7390' }}>{sc.chapter}</p>}
                <p style={{ margin: 0, fontSize: size, lineHeight: 1.55 }}>{sc.narration}</p>
              </div>
              <div className="pb-num">{i + firstSceneNumber}</div>
            </div>
          )
        })}

        {/* Closing page */}
        <div className="pb-sheet" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 6mm', fontSize: '32pt', fontWeight: 700 }}>{tbc ? 'To be continued…' : 'The End'}</h2>
          <p style={{ margin: 0, fontSize: '12pt', color: '#6a6480' }}>{story.title}</p>
          <p style={{ position: 'absolute', bottom: '14mm', margin: 0, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#a29cb3' }}>Made with StoryDream</p>
          <div className="pb-num">{totalPages}</div>
        </div>
      </div>
    </div>
  )
}
