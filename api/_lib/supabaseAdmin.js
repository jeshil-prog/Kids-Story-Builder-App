import { createClient } from '@supabase/supabase-js'

// Service-role key bypasses Row Level Security entirely — this is required
// here specifically because the Stripe webhook has no logged-in user
// session to act as (it's a server-to-server call from Stripe, not a
// request from the app), so it can't rely on the normal RLS-scoped client.
// This must NEVER be imported into anything that runs in the browser.
export const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
