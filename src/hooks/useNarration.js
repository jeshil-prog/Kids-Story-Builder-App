import { useRef, useState, useCallback } from 'react'

export function useNarration() {
  const utterRef = useRef(null)
  const [speaking, setSpeaking] = useState(false)

  const speak = useCallback((text, onEnd) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 0.88
    u.pitch = 1.05
    u.volume = 1
    // Prefer a warm English voice if available
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v =>
      v.name.includes('Samantha') || v.name.includes('Karen') ||
      v.name.includes('Daniel') || v.name.includes('Moira')
    )
    if (preferred) u.voice = preferred
    u.onstart = () => setSpeaking(true)
    u.onend = () => { setSpeaking(false); onEnd?.() }
    u.onerror = () => setSpeaking(false)
    utterRef.current = u
    window.speechSynthesis.speak(u)
  }, [])

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }, [])

  return { speak, stop, speaking }
}
