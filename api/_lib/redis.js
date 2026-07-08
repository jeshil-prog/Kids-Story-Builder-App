// Thin wrapper around the Upstash Redis REST API. Uses the POST-to-base-URL
// command-array style (["SET", key, value, "EX", ttl]) for both get and set —
// this is the pattern already proven to work in this app (image-status.js's
// GET calls use it). An earlier version of redisSet used the alternative
// path-segment style (/set/key/value), copied from a worker file that turned
// out to have zero references anywhere in the app and had therefore never
// actually been exercised in production — i.e. it was never verified either.
// Standardising on one proven style removes that uncertainty.

const BASE = process.env.UPSTASH_REDIS_REST_URL
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

async function redisCommand(command) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || data?.error) {
    // Loud on purpose — a silent Redis failure here is exactly what made the
    // "everything logged 200 but nothing was actually stored" bug so hard to
    // find. Callers should let this throw rather than swallow it.
    throw new Error(`Redis command failed: ${JSON.stringify(command.slice(0, 2))} — ${data?.error || res.status}`)
  }
  return data
}

export async function redisSet(key, value, exSeconds) {
  const command = exSeconds
    ? ['SET', key, JSON.stringify(value), 'EX', exSeconds]
    : ['SET', key, JSON.stringify(value)]
  await redisCommand(command)
  return true
}

export async function redisGet(key) {
  const data = await redisCommand(['GET', key])
  if (!data.result) return null
  try { return JSON.parse(data.result) } catch { return null }
}
