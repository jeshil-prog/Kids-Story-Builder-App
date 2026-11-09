// Phone numbers are kept in international format, like +61412345678, so the same
// number always matches no matter how it was typed. A number that starts with 0
// is treated as Australian, because that is where StoryDream is mainly used.
// Anyone else just types a + and their country code.

export function normalisePhone(raw) {
  if (typeof raw !== 'string') return null
  let s = raw.trim()
  if (!s) return null
  const hasPlus = s.startsWith('+')
  let digits = s.replace(/\D/g, '')
  if (!digits) return null
  if (hasPlus) {
    // already has a country code
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2)
  } else if (digits.startsWith('0')) {
    digits = '61' + digits.slice(1)
  } else {
    return null // no country code and not a local number: ask for the + form
  }
  const out = '+' + digits
  return /^\+[1-9][0-9]{7,14}$/.test(out) ? out : null
}

export const PHONE_HELP = 'Include your country code, like +1 555 123 4567. Australian numbers can start with 0.'
