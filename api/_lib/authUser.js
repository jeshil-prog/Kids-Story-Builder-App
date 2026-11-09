// Works out who is calling an API route from the "Authorization: Bearer <token>"
// header the app sends. Returns the user id, or null if the token is missing or
// not valid. Used by routes that must only be called by a signed in person.
import { supabaseAdmin } from './supabaseAdmin.js'

export async function getUserId(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user.id
}
