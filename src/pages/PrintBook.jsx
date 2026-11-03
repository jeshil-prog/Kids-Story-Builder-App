import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/AuthContext'
import { Spinner } from '../components/UI'

// A print ready version of a story: a cover, one page for each scene
// (picture on top, words underneath) and a closing page. Printing it, or
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
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>You can only print stories from your own library.</p>
        <button onClick={() => navigate('/profile?tab=library')} style={{ color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>Back to my library</button>
      </div>
    )
  }

  const tbc = !!story.toBeContinued
  const names = (story.characters || []).map(c => c.name).filter(Boolean).join(', ')
  const cover = sheets[0]?.imageUrl
  const totalPages = sheets.length + 2

  const css = `
    @page { size: ${P.size}; margin: 0; }
    .pb-sheet { width: ${P.w}; height: ${P.h}; box-sizing: border-box; padding: 14mm; background: #fff; color: #1f1a2e;
      display: flex; flex-direction: column; overflow: hidden; position: relative; font-family: ${FONT}; margin: 0 auto 16px; box-shadow: 0 2px 14px rgba(0,0,0,0.18); }
    .pb-img { width: 100%; object-fit: cover; border-radius: 5mm; display: block; }
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
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{totalPages} pages</p>
        </div>
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
        <p style={{ flexBasis: '100%', margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          In the window that opens, choose "Save as PDF" to keep a file, or pick your printer. For a book, print on both sides if your printer can.
        </p>
      </div>

      <div className="pb-root" style={{ paddingTop: 16, zoom }}>
        {/* Cover */}
        <div className="pb-sheet" style={{ alignItems: 'center', textAlign: 'center' }}>
          <p style={{ margin: '8mm 0 4mm', fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#8a8497' }}>
            {story.chapterNumber > 1 ? `Chapter ${story.chapterNumber}` : 'A bedtime story'}
          </p>
          <h1 style={{ margin: '0 0 6mm', fontSize: '34pt', lineHeight: 1.15, fontWeight: 700 }}>{story.title}</h1>
          {story.tagline && <p style={{ margin: '0 0 8mm', fontSize: '14pt', fontStyle: 'italic', color: '#4b4560' }}>{story.tagline}</p>}
          {cover && <img className="pb-img" src={cover} alt="" style={{ flex: '0 0 auto', height: '125mm', width: '160mm', maxWidth: '100%' }} />}
          <div style={{ flex: 1 }} />
          {names && <p style={{ margin: '0 0 4mm', fontSize: '13pt', color: '#4b4560' }}>Starring {names}</p>}
          <p style={{ margin: '0 0 8mm', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#a29cb3' }}>Made with StoryDream</p>
        </div>

        {/* One page for each scene */}
        {sheets.map((sc, i) => (
          <div className="pb-sheet" key={i}>
            <div style={{ flex: '0 0 62%', minHeight: 0 }}>
              {sc.imageUrl
                ? <img className="pb-img" src={sc.imageUrl} alt="" style={{ height: '100%' }} />
                : <div style={{ height: '100%', borderRadius: '5mm', background: '#f1eff7' }} />}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '4mm 4mm 12mm' }}>
              {sc.chapter && <p style={{ margin: '0 0 3mm', fontSize: '10pt', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7a7390' }}>{sc.chapter}</p>}
              <p style={{ margin: 0, fontSize: '17pt', lineHeight: 1.6 }}>{sc.narration}</p>
            </div>
            <div className="pb-num">{i + 2}</div>
          </div>
        ))}

        {/* Closing page */}
        <div className="pb-sheet" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 6mm', fontSize: '32pt', fontWeight: 700 }}>{tbc ? 'To be continued…' : 'The End'}</h2>
          <p style={{ margin: 0, fontSize: '12pt', color: '#6a6480' }}>{story.title}</p>
          <p style={{ position: 'absolute', bottom: '14mm', margin: 0, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#a29cb3' }}>Made with StoryDream</p>
          <div className="pb-num">{sheets.length + 2}</div>
        </div>
      </div>
    </div>
  )
}
