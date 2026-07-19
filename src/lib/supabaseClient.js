import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY — auth and data will not work until these are set.')
}

// Session persistence (so a reload doesn't log you out) uses localStorage by
// default, same as every other "stay logged in" website — this is expected
// standard behaviour, not something we're introducing. Private browsing
// will still wipe it on close, same as any site's login.
export const supabase = createClient(url, publishableKey)
