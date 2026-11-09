import React from 'react'

export const GENRE_EMOJI = { Ocean: '🌊', Bedtime: '🌙', Cosy: '🌙', Fantasy: '🧙', Space: '🚀', Jungle: '🦁', Comedy: '😄', Adventure: '⚗️', Magic: '✨' }
const PALETTE = ['#0F3460', '#1a0533', '#023020', '#2d0a20', '#001a2d', '#26215C']

// The picture that stands for a story: the first page's illustration with the
// title across the bottom, like the front of a book. The same look is used on
// the home page, in the library, and as the front cover of an exported book.
export default function StoryCover({ story, index = 0, ratio = '1 / 1', pill = null, titleSize = 14 }) {
  const picture = story.scenes?.[0]?.imageUrl
  const chapter = story.chapterNumber > 1 ? `Chapter ${story.chapterNumber}` : null
  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: ratio, overflow: 'hidden',
      background: picture ? '#1a1830' : PALETTE[index % PALETTE.length]
    }}>
      {picture
        ? <img src={picture} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, paddingBottom: 28 }}>{GENRE_EMOJI[story.genre] || '📖'}</div>}
      {titleSize > 0 && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '28px 10px 9px', background: 'linear-gradient(to top, rgba(8,6,20,0.88) 0%, rgba(8,6,20,0.55) 55%, rgba(8,6,20,0) 100%)' }}>
        {chapter && <p style={{ margin: '0 0 2px', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)' }}>{chapter}</p>}
        <p style={{ margin: 0, fontSize: titleSize, fontWeight: 700, lineHeight: 1.25, color: '#fff', fontFamily: 'Georgia, serif', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{story.title}</p>
      </div>}
      {pill}
    </div>
  )
}
