// Builds the pages of a story as pictures (a cover, one page for each scene, and
// an ending), so they can be saved to a phone's Photos. It draws each page on a
// canvas, using the same layout as the printed book: the picture across the full
// width of the page, with the words underneath.

const W = 1080
const H = 1620
const FONT = 'Georgia, "Noto Serif", "Noto Serif Devanagari", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", serif'

// Pictures come through our own address (/api/download-image), because the
// browser will not let a page read pixels from another web address.
async function loadPicture(url, token) {
  const res = await fetch(`/api/download-image?url=${encodeURIComponent(url)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('Could not load a picture')
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not read a picture'))
      img.src = objectUrl
    })
  } finally {
    // The image has decoded by now, so the temporary address can go.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }
}

// Breaks text into lines that fit a width. Chinese has no spaces, so it breaks
// between characters. Everything else breaks between words.
function wrapLines(ctx, text, maxWidth, byCharacter) {
  const lines = []
  const units = byCharacter ? Array.from(text) : text.split(/\s+/)
  const joiner = byCharacter ? '' : ' '
  let line = ''
  for (const unit of units) {
    const trial = line ? line + joiner + unit : unit
    if (ctx.measureText(trial).width <= maxWidth || !line) line = trial
    else { lines.push(line); line = unit }
  }
  if (line) lines.push(line)
  return lines
}

// Writes text into a box, using the largest size that fits.
function drawFittedText(ctx, text, x, y, w, h, { byCharacter, color = '#1f1a2e', max = 46, min = 24 }) {
  let size = max
  let lines = []
  for (; size >= min; size -= 2) {
    ctx.font = `${size}px ${FONT}`
    lines = wrapLines(ctx, text, w, byCharacter)
    if (lines.length * size * 1.5 <= h) break
  }
  ctx.fillStyle = color
  ctx.textBaseline = 'top'
  const lineHeight = size * 1.5
  const blockHeight = lines.length * lineHeight
  let cy = y + Math.max(0, (h - blockHeight) / 2)
  for (const line of lines) { ctx.fillText(line, x, cy); cy += lineHeight }
}

// Draws a picture to fill a box without stretching it (it is trimmed to fit).
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
const newCanvas = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c }

function coverPage(story, img) {
  const canvas = newCanvas()
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#26215C'
  ctx.fillRect(0, 0, W, H)
  if (img) drawCover(ctx, img, 0, 0, W, H)
  const grad = ctx.createLinearGradient(0, H * 0.5, 0, H)
  grad.addColorStop(0, 'rgba(8,6,20,0)')
  grad.addColorStop(1, 'rgba(8,6,20,0.9)')
  ctx.fillStyle = grad
  ctx.fillRect(0, H * 0.5, W, H * 0.5)

  const byCharacter = story.language === 'zh'
  let y = H - 90
  const names = (story.characters || []).map(c => c.name).filter(Boolean).join(', ')
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `30px ${FONT}`
  ctx.fillText('Made with StoryDream', 70, y)
  y -= 56
  if (names) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = `34px ${FONT}`
    ctx.fillText(`Starring ${names}`, 70, y)
    y -= 70
  }
  ctx.font = `bold 84px ${FONT}`
  const titleLines = wrapLines(ctx, story.title || '', W - 140, byCharacter).slice(0, 4)
  ctx.fillStyle = '#ffffff'
  for (let i = titleLines.length - 1; i >= 0; i--) { ctx.fillText(titleLines[i], 70, y); y -= 100 }
  if (story.chapterNumber > 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.font = `32px ${FONT}`
    ctx.fillText(`CHAPTER ${story.chapterNumber}`, 70, y)
  }
  return canvas
}

function scenePage(story, scene, img, pageNumber) {
  const canvas = newCanvas()
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  // The picture runs edge to edge across the top, as a full square.
  if (img) drawCover(ctx, img, 0, 0, W, W)
  const byCharacter = story.language === 'zh'
  const top = W + 40
  let textTop = top
  if (scene.chapter) {
    ctx.fillStyle = '#7a7390'
    ctx.textBaseline = 'top'
    ctx.font = `bold 26px ${FONT}`
    ctx.fillText(String(scene.chapter).toUpperCase(), 70, top)
    textTop = top + 46
  }
  drawFittedText(ctx, scene.narration || '', 70, textTop, W - 140, H - textTop - 90, { byCharacter })
  ctx.fillStyle = '#8a8497'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `26px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText(String(pageNumber), W / 2, H - 40)
  ctx.textAlign = 'left'
  return canvas
}

function endPage(story, pageNumber) {
  const canvas = newCanvas()
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#1f1a2e'
  ctx.font = `bold 96px ${FONT}`
  ctx.fillText(story.toBeContinued ? 'To be continued…' : 'The End', W / 2, H / 2 - 20)
  ctx.fillStyle = '#6a6480'
  ctx.font = `38px ${FONT}`
  ctx.fillText(story.title || '', W / 2, H / 2 + 60)
  ctx.fillStyle = '#a29cb3'
  ctx.font = `26px ${FONT}`
  ctx.fillText('MADE WITH STORYDREAM', W / 2, H - 90)
  ctx.fillText(String(pageNumber), W / 2, H - 40)
  return canvas
}

// Returns an array of JPEG files, one for each page. onProgress(done, total).
export async function renderStoryPages(story, { withCover = true, token, onProgress } = {}) {
  const scenes = story.scenes || []
  const total = scenes.length + 1 + (withCover ? 1 : 0)
  let done = 0
  const step = () => { done += 1; onProgress?.(done, total) }
  const safe = (slug) => (slug || 'story').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'story'
  const base = safe(story.title)
  const files = []
  const add = async (canvas) => {
    const blob = await toBlob(canvas)
    files.push(new File([blob], `${base}-${String(files.length + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }))
  }

  if (withCover) {
    const img = scenes[0]?.imageUrl ? await loadPicture(scenes[0].imageUrl, token).catch(() => null) : null
    await add(coverPage(story, img)); step()
  }
  for (let i = 0; i < scenes.length; i++) {
    const img = scenes[i].imageUrl ? await loadPicture(scenes[i].imageUrl, token).catch(() => null) : null
    await add(scenePage(story, scenes[i], img, files.length + 1)); step()
  }
  await add(endPage(story, files.length + 1)); step()
  return files
}

// Opens the phone's share sheet with the pages (where "Save Image" puts them in
// Photos). Where sharing files is not possible, such as on a computer, the pages
// are downloaded one by one instead. Returns 'shared', 'downloaded' or 'cancelled'.
export async function savePages(files) {
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
      // fall through to downloading
    }
  }
  for (const file of files) {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    await new Promise(r => setTimeout(r, 250))
  }
  return 'downloaded'
}
