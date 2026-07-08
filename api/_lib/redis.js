// Thin wrapper around the Upstash Redis REST API. Kept dependency-free
// (raw fetch) to match the style already used in api/worker/generate-image.js
// and api/image-status.js, just centralised so new endpoints don't duplicate it.

const BASE = process.env.UPSTASH_REDIS_REST_URL
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

export async function redisSet(key, value, exSeconds) {
  const encoded = encodeURIComponent(JSON.stringify(value))
  const url = exSeconds
    ? `${BASE}/set/${encodeURIComponent(key)}/${encoded}?EX=${exSeconds}`
    : `${BASE}/set/${encodeURIComponent(key)}/${encoded}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
  return res.ok
}

export async function redisGet(key) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', key])
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data.result) return null
  try { return JSON.parse(data.result) } catch { return null }
}
