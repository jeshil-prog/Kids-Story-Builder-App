export const config = { api: { bodyParser: false }, maxDuration: 20 }

import { stripe } from './_lib/stripeClient.js'
import { supabaseAdmin } from './_lib/supabaseAdmin.js'

const PRICE_TO_TIER = {
  [process.env.STRIPE_PRICE_TIER1]: 'tier1',
  [process.env.STRIPE_PRICE_TIER2]: 'tier2'
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// Stripe removed current_period_end from the top-level Subscription object
// in the "Basil" API version (2025-03-31) — it now lives on each
// subscription item instead. Reading the old location silently returns
// undefined, which previously crashed the date conversion below with an
// invalid-date error — BEFORE the database write ever ran. That crash was
// caught by the outer try/catch and swallowed as a "handled" 200 response,
// which is exactly why a real, successful payment never showed up as an
// updated tier: the webhook died on this line, silently, every time.
function getPeriodEnd(subscription) {
  const fromItem = subscription.items?.data?.[0]?.current_period_end
  const legacy = subscription.current_period_end // pre-Basil accounts only
  const raw = fromItem ?? legacy
  if (!raw) return null
  return new Date(raw * 1000).toISOString()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET is not set — check Vercel env vars and redeploy.')
    return res.status(500).json({ error: 'Webhook secret not configured on server' })
  }

  const rawBody = await readRawBody(req)

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message)
    return res.status(400).json({ error: 'Invalid signature' })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.mode !== 'subscription') break

        const userId = session.client_reference_id || session.metadata?.userId
        const tier = session.metadata?.tier
        if (!userId || !tier) {
          console.error('checkout.session.completed missing userId/tier in metadata', session.id)
          break
        }

        const subscription = await stripe.subscriptions.retrieve(session.subscription)

        await supabaseAdmin.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: session.customer,
          stripe_subscription_id: subscription.id,
          tier,
          status: subscription.status,
          current_period_end: getPeriodEnd(subscription),
          updated_at: new Date().toISOString()
        })
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const userId = subscription.metadata?.userId
        if (!userId) {
          console.error('customer.subscription.updated missing userId in metadata', subscription.id)
          break
        }

        const priceId = subscription.items.data[0]?.price?.id
        const tier = PRICE_TO_TIER[priceId] || 'free'

        await supabaseAdmin.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: subscription.customer,
          stripe_subscription_id: subscription.id,
          tier,
          status: subscription.status,
          current_period_end: getPeriodEnd(subscription),
          updated_at: new Date().toISOString()
        })
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const userId = subscription.metadata?.userId
        if (!userId) {
          console.error('customer.subscription.deleted missing userId in metadata', subscription.id)
          break
        }

        await supabaseAdmin.from('subscriptions').upsert({
          user_id: userId,
          tier: 'free',
          status: 'canceled',
          updated_at: new Date().toISOString()
        })
        break
      }

      default:
        // Not an event we act on — ack it anyway so Stripe doesn't retry.
        break
    }

    return res.status(200).json({ received: true })
  } catch (err) {
    // Changed from always-200 to a real 500 here. Always returning 200 (even
    // on an unexpected internal error) meant Stripe considered the event
    // "successfully delivered" and would never retry it automatically — which
    // is exactly how the current_period_end crash above went unnoticed and
    // unrecovered. Our writes are idempotent upserts, so it's safe to let
    // Stripe's automatic retry (over the following couple of days) try again
    // rather than silently losing the event forever.
    console.error('Stripe webhook processing error:', err)
    return res.status(500).json({ error: err.message })
  }
}
