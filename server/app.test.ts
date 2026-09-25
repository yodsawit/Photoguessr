import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { EMPTY_MS, INACTIVITY_MS } from './expiry'
import { MemoryObjects } from './objects'
import { createPoolStore } from './poolStore'
import { PoolService } from './pools'

const ADMIN = 'admin-code-123'
const T0 = Date.parse('2026-09-24T00:00:00Z')
const MIN = 60_000

function setup() {
  let now = T0
  const objects = new MemoryObjects()
  const store = createPoolStore(objects)
  const pools = new PoolService(store, 'test-pepper-0123456789', () => now)
  const logs: string[] = []
  const background: Promise<unknown>[] = []
  const geocoder = { lookup: async () => ({ district: 'Mueang Chiang Mai', province: 'Chiang Mai' }) }
  const app = createApp({
    pools,
    store,
    geocoder,
    adminCode: ADMIN,
    log: (l) => logs.push(l),
    background: (p) => void background.push(p),
    clientIp: (c) => c.req.header('x-test-ip') ?? '1.1.1.1',
    now: () => now,
  })
  const call = (path: string, init: RequestInit & { key?: string; ip?: string } = {}) => {
    const headers = new Headers(init.headers)
    if (init.key) headers.set('Authorization', `Bearer ${init.key}`)
    if (init.ip) headers.set('x-test-ip', init.ip)
    return app.request(path, { ...init, headers })
  }
  const createPool = async () => {
    const res = await call('/api/pools', { method: 'POST', headers: { 'X-Admin-Code': ADMIN } })
    expect(res.status).toBe(201)
    return ((await res.json()) as { key: string }).key
  }
  const upload = async (key: string, fields: Record<string, string> = { lat: '18.8018', lng: '98.9672', takenAt: '2024-09-28T11:10:56+07:00' }, color = 100) => {
    const img = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: color, g: 50, b: 50 } } }).jpeg().toBuffer()
    const form = new FormData()
    form.set('photo', new Blob([new Uint8Array(img)], { type: 'image/jpeg' }), 'x.jpg')
    for (const [k, v] of Object.entries(fields)) form.set(k, v)
    return call('/api/photos', { method: 'POST', body: form, key })
  }
  const status = async (key: string) => (await call('/api/pool', { key })).json() as Promise<Record<string, unknown>>
  return { call, createPool, upload, status, logs, objects, background, advance: (ms: number) => (now += ms) }
}

describe('pool creation', () => {
  it('needs the admin code and returns exactly one 6-char key', async () => {
    const { call, createPool } = setup()
    expect((await call('/api/pools', { method: 'POST' })).status).toBe(401)
    expect((await call('/api/pools', { method: 'POST', headers: { 'X-Admin-Code': 'nope' } })).status).toBe(401)
    const res = await call('/api/pools', { method: 'POST', headers: { 'X-Admin-Code': ADMIN } })
    expect(Object.keys((await res.json()) as object)).toEqual(["key"])
    expect(await createPool()).toMatch(/^[A-Z0-9]{6}$/)
  })
})

describe('one key does everything', () => {
  it('uploads, lists without answers, serves the image, reveals the answer only on guess', async () => {
    const { call, createPool, upload, background } = setup()
    const key = await createPool()
    const up = await upload(key.toLowerCase())
    expect(up.status).toBe(201)
    const { photoId } = (await up.json()) as { photoId: string }
    await Promise.all(background)

    const list = (await (await call('/api/rounds?count=5', { key })).json()) as Record<string, unknown>[]
    expect(list).toEqual([{ id: photoId, width: 400, height: 300 }])
    expect(JSON.stringify(list)).not.toMatch(/lat|lng|18\.80|Chiang|2024/)

    const photo = await call(`/api/photo/${photoId}`, { key })
    expect(photo.headers.get('content-type')).toBe('image/webp')
    expect(photo.headers.get('cache-control')).toContain('no-store')
    expect((await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).exif).toBeUndefined()

    const guess = await call('/api/guess', {
      method: 'POST',
      key,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: photoId, guess: { lat: 18.8018, lng: 98.9672 }, opened: [0], timedOut: false }),
    })
    const result = (await guess.json()) as { finalScore: number; answer: Record<string, unknown> }
    expect(result.finalScore).toBe(195) // exact guess, 1 corner open: 100 x 195%
    expect(result.answer).toEqual({ lat: 18.8018, lng: 98.9672, takenAt: '2024-09-28T11:10:56+07:00', district: 'Mueang Chiang Mai', province: 'Chiang Mai' })
  })

  it('detects duplicates and supports concurrent uploads to one pool', async () => {
    const { call, createPool, upload } = setup()
    const key = await createPool()
    const [a, b] = await Promise.all([upload(key, undefined, 10), upload(key, undefined, 20)])
    expect([a.status, b.status]).toEqual([201, 201])
    const dup = await upload(key, undefined, 10)
    expect(dup.status).toBe(200)
    expect(await dup.json()).toMatchObject({ duplicate: true })
    expect((await (await call('/api/rounds?count=10', { key })).json()) as unknown[]).toHaveLength(2)
  })

  it('rejects missing and wrong keys', async () => {
    const { call, createPool } = setup()
    await createPool()
    expect((await call('/api/rounds')).status).toBe(401)
    expect((await call('/api/pool', { key: 'ZZZZZZ' })).status).toBe(401)
    expect((await call('/api/pool', { method: 'DELETE', key: 'ZZZZZZ' })).status).toBe(401)
  })

  it('keeps pools isolated', async () => {
    const { call, createPool, upload } = setup()
    const a = await createPool()
    const b = await createPool()
    const { photoId } = (await (await upload(a)).json()) as { photoId: string }
    expect((await call(`/api/photo/${photoId}`, { key: b })).status).toBe(404)
    expect(await (await call('/api/rounds', { key: b })).json()).toEqual([])
  })

  it('status, delete one photo, delete pool', async () => {
    const { call, createPool, upload, status, objects } = setup()
    const key = await createPool()
    expect(await status(key)).toMatchObject({ photoCount: 0, empty: true, expiresAt: new Date(T0 + EMPTY_MS).toISOString() })
    const { photoId } = (await (await upload(key)).json()) as { photoId: string }
    expect(await status(key)).toMatchObject({ photoCount: 1, empty: false, expiresAt: new Date(T0 + INACTIVITY_MS).toISOString() })
    expect((await call(`/api/photos/${photoId}`, { method: 'DELETE', key })).status).toBe(200)
    expect((await call(`/api/photos/${photoId}`, { method: 'DELETE', key })).status).toBe(404)
    expect(await status(key)).toMatchObject({ photoCount: 0, empty: true })
    expect((await call('/api/pool', { method: 'DELETE', key })).status).toBe(200)
    expect(objects.keys()).toEqual([])
    expect((await call('/api/rounds', { key })).status).toBe(401)
  })

  it('explains a photo sent as text (iOS Shortcuts Text field) vs no photo at all', async () => {
    const { call, createPool } = setup()
    const key = await createPool()
    const asText = new FormData()
    asText.set('photo', 'IMG_0001.jpg')
    asText.set('lat', '1')
    asText.set('lng', '2')
    const r1 = (await (await call('/api/photos', { method: 'POST', body: asText, key })).json()) as { error: string }
    expect(r1.error).toMatch(/sent as Text.*File field/)
    const none = new FormData()
    none.set('lat', '1')
    const r2 = (await (await call('/api/photos', { method: 'POST', body: none, key })).json()) as { error: string }
    expect(r2.error).toMatch(/no 'photo' field/)
  })

  it('accepts a raw image body with lat/lng/date in headers (Shortcuts "Request Body: File")', async () => {
    const { call, createPool, status } = setup()
    const key = await createPool()
    const img = await sharp({ create: { width: 300, height: 200, channels: 3, background: 'teal' } }).jpeg().toBuffer()
    const res = await call('/api/photos', {
      method: 'POST',
      key,
      body: new Uint8Array(img),
      headers: { 'Content-Type': 'image/jpeg', 'X-Lat': '18.8018', 'X-Lng': '98.9672', 'X-Taken-At': '2024-09-28T11:10:56+07:00' },
    })
    expect(res.status).toBe(201)
    expect(await status(key)).toMatchObject({ photoCount: 1, empty: false })
    const empty = await call('/api/photos', { method: 'POST', key, body: new Uint8Array(), headers: { 'Content-Type': 'image/jpeg' } })
    expect(((await empty.json()) as { error: string }).error).toMatch(/body is empty/)
  })

  it('rejects bad photo ids and bad guesses', async () => {
    const { call, createPool } = setup()
    const key = await createPool()
    expect((await call('/api/photo/..%2F..%2Fkeys', { key })).status).toBe(404)
    const bad = await call('/api/guess', { method: 'POST', key, body: '{"id":"x"}', headers: { 'Content-Type': 'application/json' } })
    expect(bad.status).toBe(400)
  })
})

describe('expiry over HTTP', () => {
  it('an empty pool is gone 1 h after creation even if visited', async () => {
    const { call, createPool, advance } = setup()
    const key = await createPool()
    advance(40 * MIN)
    expect((await call('/api/pool', { key })).status).toBe(200)
    advance(21 * MIN)
    expect((await call('/api/pool', { key })).status).toBe(404)
  })

  it('a pool with photos lives 3 days after last activity; activity keeps it alive', async () => {
    const { call, createPool, upload, advance } = setup()
    const a = await createPool()
    const b = await createPool()
    await upload(a, undefined, 10)
    await upload(b, undefined, 20)
    advance(INACTIVITY_MS - MIN)
    expect((await call('/api/rounds', { key: b })).status).toBe(200) // activity on b only
    advance(2 * MIN)
    expect((await call('/api/rounds', { key: a })).status).toBe(404)
    expect((await call('/api/rounds', { key: b })).status).toBe(200)
  })
})

describe('brute-force protection', () => {
  it('locks an IP after 10 wrong keys (even a correct key then waits), other IPs unaffected', async () => {
    const { call, createPool } = setup()
    const key = await createPool()
    for (let i = 0; i < 10; i++) expect((await call('/api/rounds', { key: 'AAAAAA', ip: '6.6.6.6' })).status).toBe(401)
    const locked = await call('/api/rounds', { key, ip: '6.6.6.6' })
    expect(locked.status).toBe(429)
    expect(locked.headers.get('retry-after')).toBeTruthy()
    expect((await call('/api/rounds', { key, ip: '7.7.7.7' })).status).toBe(200)
  })

  it('also counts wrong admin codes', async () => {
    const { call } = setup()
    for (let i = 0; i < 10; i++) await call('/api/pools', { method: 'POST', headers: { 'X-Admin-Code': 'x' }, ip: '5.5.5.5' })
    expect((await call('/api/pools', { method: 'POST', headers: { 'X-Admin-Code': ADMIN }, ip: '5.5.5.5' })).status).toBe(429)
  })
})

describe('privacy', () => {
  it('logs only method, route pattern, status and timing — never keys, ids, coordinates or bodies', async () => {
    const { call, createPool, upload, logs } = setup()
    const key = await createPool()
    const { photoId } = (await (await upload(key)).json()) as { photoId: string }
    await call(`/api/photo/${photoId}`, { key })
    await call('/api/rounds', { key: 'WRONG1' })
    const all = logs.join('\n')
    for (const secret of [key, photoId, '18.80', '98.96', 'WRONG1', ADMIN, '1.1.1.1']) expect(all).not.toContain(secret)
    expect(all).toContain('GET /api/photo/:id 200')
  })

  it('sends security headers and generic errors', async () => {
    const { call } = setup()
    const res = await call('/api/rounds', { key: 'ZZZZZZ' })
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(await res.json()).toEqual({ error: 'Invalid key' })
  })
})
