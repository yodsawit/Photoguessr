import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { INACTIVITY_MS } from './expiry'
import { MemoryObjects } from './objects'
import { createPoolStore } from './poolStore'
import { PoolService } from './pools'

const ADMIN = 'admin-code-123'
const T0 = Date.parse('2026-09-24T00:00:00Z')

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
    return (await res.json()) as { uploadKey: string; playKey: string }
  }
  const upload = async (key: string, fields: Record<string, string> = { lat: '18.8018', lng: '98.9672', takenAt: '2024-09-28T11:10:56+07:00' }, color = 100) => {
    const img = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: color, g: 50, b: 50 } } }).jpeg().toBuffer()
    const form = new FormData()
    form.set('photo', new Blob([new Uint8Array(img)], { type: 'image/jpeg' }), 'x.jpg')
    for (const [k, v] of Object.entries(fields)) form.set(k, v)
    return call('/api/photos', { method: 'POST', body: form, key })
  }
  return { app, call, createPool, upload, logs, objects, background, advance: (ms: number) => (now += ms) }
}

describe('pool creation', () => {
  it('needs the admin code and returns two 6-char keys', async () => {
    const { call, createPool } = setup()
    expect((await call('/api/pools', { method: 'POST' })).status).toBe(401)
    expect((await call('/api/pools', { method: 'POST', headers: { 'X-Admin-Code': 'nope' } })).status).toBe(401)
    const keys = await createPool()
    expect(keys.uploadKey).toMatch(/^[A-Z0-9]{6}$/)
    expect(keys.playKey).toMatch(/^[A-Z0-9]{6}$/)
    expect(Object.keys(keys).sort()).toEqual(['playKey', 'uploadKey'])
  })
})

describe('upload + play', () => {
  it('uploads, lists without answers, serves the image, reveals the answer only on guess', async () => {
    const { call, createPool, upload, background } = setup()
    const { uploadKey, playKey } = await createPool()
    const up = await upload(uploadKey.toLowerCase())
    expect(up.status).toBe(201)
    const { photoId } = (await up.json()) as { photoId: string }
    await Promise.all(background)

    const rounds = await call('/api/rounds?count=5', { key: playKey })
    expect(rounds.status).toBe(200)
    const list = (await rounds.json()) as Record<string, unknown>[]
    expect(list).toEqual([{ id: photoId, width: 400, height: 300 }])
    expect(JSON.stringify(list)).not.toMatch(/lat|lng|18\.80|Chiang|2024/)

    const photo = await call(`/api/photo/${photoId}`, { key: playKey })
    expect(photo.headers.get('content-type')).toBe('image/webp')
    expect(photo.headers.get('cache-control')).toContain('no-store')
    expect((await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).exif).toBeUndefined()

    const guess = await call('/api/guess', {
      method: 'POST',
      key: playKey,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: photoId, guess: { lat: 18.8018, lng: 98.9672 }, opened: [0], timedOut: false }),
    })
    const result = (await guess.json()) as { finalScore: number; answer: Record<string, unknown> }
    expect(result.finalScore).toBe(490)
    expect(result.answer).toEqual({ lat: 18.8018, lng: 98.9672, takenAt: '2024-09-28T11:10:56+07:00', district: 'Mueang Chiang Mai', province: 'Chiang Mai' })
  })

  it('detects duplicates and supports concurrent uploads to one pool', async () => {
    const { call, createPool, upload } = setup()
    const { uploadKey, playKey } = await createPool()
    const [a, b] = await Promise.all([upload(uploadKey, undefined, 10), upload(uploadKey, undefined, 20)])
    expect([a.status, b.status]).toEqual([201, 201])
    const dup = await upload(uploadKey, undefined, 10)
    expect(dup.status).toBe(200)
    expect(await dup.json()).toMatchObject({ duplicate: true })
    const list = (await (await call('/api/rounds?count=10', { key: playKey })).json()) as unknown[]
    expect(list).toHaveLength(2)
  })

  it('enforces roles: play key cannot upload/delete, upload key cannot play', async () => {
    const { call, createPool, upload } = setup()
    const { uploadKey, playKey } = await createPool()
    expect((await upload(playKey)).status).toBe(401)
    expect((await call('/api/pool', { method: 'DELETE', key: playKey })).status).toBe(401)
    expect((await call('/api/rounds', { key: uploadKey })).status).toBe(401)
    expect((await call('/api/rounds')).status).toBe(401)
  })

  it('keeps pools isolated', async () => {
    const { call, createPool, upload } = setup()
    const a = await createPool()
    const b = await createPool()
    const { photoId } = (await (await upload(a.uploadKey)).json()) as { photoId: string }
    expect((await call(`/api/photo/${photoId}`, { key: b.playKey })).status).toBe(404)
    expect(await (await call('/api/rounds', { key: b.playKey })).json()).toEqual([])
  })

  it('manages a pool: status, delete one photo, delete pool', async () => {
    const { call, createPool, upload, objects } = setup()
    const { uploadKey, playKey } = await createPool()
    const { photoId } = (await (await upload(uploadKey)).json()) as { photoId: string }
    const status = (await (await call('/api/pool', { key: uploadKey })).json()) as Record<string, unknown>
    expect(status).toMatchObject({ photoCount: 1, expiresAt: new Date(T0 + INACTIVITY_MS).toISOString() })
    expect((await call(`/api/photos/${photoId}`, { method: 'DELETE', key: uploadKey })).status).toBe(200)
    expect((await call(`/api/photos/${photoId}`, { method: 'DELETE', key: uploadKey })).status).toBe(404)
    expect((await call('/api/pool', { method: 'DELETE', key: uploadKey })).status).toBe(200)
    expect(objects.keys()).toEqual([])
    expect((await call('/api/rounds', { key: playKey })).status).toBe(401)
  })

  it('expires a pool after 3 days without activity, but activity keeps it alive', async () => {
    const { call, createPool, advance } = setup()
    const a = await createPool()
    const b = await createPool()
    advance(INACTIVITY_MS - 60_000)
    expect((await call('/api/rounds', { key: b.playKey })).status).toBe(200) // activity on b
    advance(120_000)
    expect((await call('/api/rounds', { key: a.playKey })).status).toBe(404)
    expect((await call('/api/rounds', { key: b.playKey })).status).toBe(200)
  })

  it('rejects bad photo ids and bad guesses', async () => {
    const { call, createPool } = setup()
    const { playKey } = await createPool()
    expect((await call('/api/photo/..%2F..%2Fkeys', { key: playKey })).status).toBe(404)
    const bad = await call('/api/guess', { method: 'POST', key: playKey, body: '{"id":"x"}', headers: { 'Content-Type': 'application/json' } })
    expect(bad.status).toBe(400)
  })
})

describe('brute-force protection', () => {
  it('locks an IP after 10 wrong keys (even a correct key then waits), other IPs unaffected', async () => {
    const { call, createPool } = setup()
    const { playKey } = await createPool()
    for (let i = 0; i < 10; i++) expect((await call('/api/rounds', { key: 'AAAAAA', ip: '6.6.6.6' })).status).toBe(401)
    const locked = await call('/api/rounds', { key: playKey, ip: '6.6.6.6' })
    expect(locked.status).toBe(429)
    expect(locked.headers.get('retry-after')).toBeTruthy()
    expect((await call('/api/rounds', { key: playKey, ip: '7.7.7.7' })).status).toBe(200)
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
    const { uploadKey, playKey } = await createPool()
    const { photoId } = (await (await upload(uploadKey)).json()) as { photoId: string }
    await call(`/api/photo/${photoId}`, { key: playKey })
    await call('/api/rounds', { key: 'WRONG1' })
    const all = logs.join('\n')
    for (const secret of [uploadKey, playKey, photoId, '18.80', '98.96', 'WRONG1', ADMIN, '1.1.1.1']) expect(all).not.toContain(secret)
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
