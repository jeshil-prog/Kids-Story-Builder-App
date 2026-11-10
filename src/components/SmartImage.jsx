import React, { useEffect, useRef, useState } from 'react'

// Pictures never appear in pieces. A picture is loaded and decoded completely
// in the background, and only then shown, with a short fade. Until then a calm
// placeholder holds its place so nothing jumps around.

const results = new Map()   // src -> 'ok' | 'error' once settled
const pending = new Map()   // src -> Promise while loading

export const isPreloaded = (src) => !!src && results.has(src)

export function preloadImage(src) {
  if (!src) return Promise.resolve('error')
  if (results.has(src)) return Promise.resolve(results.get(src))
  if (pending.has(src)) return pending.get(src)
  const p = new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    const finish = (r) => { results.set(src, r); pending.delete(src); resolve(r) }
    img.onload = () => {
      // decode() makes the browser prepare every pixel now, so the first time the
      // picture is drawn it appears whole instead of painting in line by line.
      if (img.decode) img.decode().then(() => finish('ok'), () => finish('ok'))
      else finish('ok')
    }
    img.onerror = () => finish('error')
    img.src = src
  })
  pending.set(src, p)
  return p
}

// Gives back 'ready', 'loading' or 'error' for one picture.
export function useImageState(src, enabled = true) {
  const [state, setState] = useState(() => (src && results.has(src) ? results.get(src) === 'ok' ? 'ready' : 'error' : 'loading'))
  useEffect(() => {
    if (!src) { setState('error'); return }
    if (results.has(src)) { setState(results.get(src) === 'ok' ? 'ready' : 'error'); return }
    setState('loading')
    if (!enabled) return
    let live = true
    preloadImage(src).then((r) => { if (live) setState(r === 'ok' ? 'ready' : 'error') })
    return () => { live = false }
  }, [src, enabled])
  return state
}

// A picture that waits until it is whole before it shows.
//   style        sizing and shape, applied to the picture and to its placeholder
//   placeholder  background of the placeholder while loading
//   fallback     what to draw if the picture cannot be loaded
//   lazy         only start loading when the picture is close to the screen
export default function SmartImage({ src, alt = '', style = {}, placeholder = 'rgba(120,110,170,0.14)', fallback = null, lazy = false, ...rest }) {
  const holder = useRef(null)
  const [near, setNear] = useState(!lazy || isPreloaded(src))

  useEffect(() => {
    if (near || !lazy) return
    const el = holder.current
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect() }
    }, { rootMargin: '500px' })
    io.observe(el)
    return () => io.disconnect()
  }, [near, lazy])

  const state = useImageState(src, near)

  if (state === 'ready') {
    return <img src={src} alt={alt} decoding="async" style={{ animation: 'sdFade 0.35s ease', ...style }} {...rest} />
  }
  if (state === 'error') return fallback
  return <div ref={holder} aria-hidden="true" style={{ ...style, background: placeholder, objectFit: undefined }} />
}
