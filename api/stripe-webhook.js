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
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
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
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
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
    console.error('Stripe webhook processing error:', err)
    // Still 200 — a bug on our end shouldn't make Stripe hammer retries.
    return res.status(200).json({ received: true, error: err.message })
  }
}
