// The languages a story can be written and read aloud in.
// "code" is what gets saved with the story and sent to the server.
export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'zh', name: 'Mandarin', native: '中文' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
]

export const langName = (code) => LANGUAGES.find(l => l.code === code)?.name || 'English'

// Average width of one character as a fraction of the font size. Used to
// work out how much text fits on screen. Chinese characters are square.
export const CHAR_WIDTH = { zh: 1.0, hi: 0.62 }
