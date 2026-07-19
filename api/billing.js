export const config = { maxDuration: 20 }

import { stripe } from './_lib/stripeClient.js'
import { supabaseAdmin } from './_lib/supabaseAdmin.js'

const PRICE_IDS = {
  tier1: process.env.STRIPE_PRICE_TIER1,
  tier2: process.env.STRIPE_PRICE_TIER2
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action } = req.body

  try {
    if (action === 'checkout') {
      const { userId, email, tier, origin } = req.body
      const priceId = PRICE_IDS[tier]
      if (!userId || !email || !priceId || !origin) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: email,
        // The webhook has no session/user context of its own — this is how
        // it knows which Supabase user a completed checkout belongs to.
        client_reference_id: userId,
        metadata: { userId, tier },
        // Metadata on the checkout session does NOT automatically carry over
        // to the underlying Subscription object — setting it here too is
        // what lets later webhook events (renewals, cancellations, plan
        // changes) still identify the user, not just the initial checkout.
        subscription_data: { metadata: { userId, tier } },
        success_url: `${origin}/profile?checkout=success`,
        cancel_url: `${origin}/profile?checkout=cancelled`
      })

      return res.status(200).json({ url: session.url })
    }

    if (action === 'portal') {
      const { userId, origin } = req.body
      if (!userId || !origin) return res.status(400).json({ error: 'Missing required fields' })

      const { data: sub, error } = await supabaseAdmin
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .single()

      if (error || !sub?.stripe_customer_id) {
        return res.status(400).json({ error: 'No billing account found for this user yet' })
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id,
        return_url: `${origin}/profile`
      })

      return res.status(200).json({ url: portalSession.url })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    console.error('Billing route error:', err)
    return res.status(500).json({ error: err.message })
  }
}
