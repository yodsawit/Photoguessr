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

    const rounds = (await (await call('/api/rounds?count=5', { key })).json()) as { gameId: string; photos: Record<string, unknown>[] }
    const list = rounds.photos
    expect(rounds.gameId).toMatch(/^[0-9a-f-]{36}$/)
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
    expect(result.finalScore).toBe(117) // exact guess, 1 corner open: (100 + 10 pinpoint) x 106%
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
    expect(((await (await call('/api/rounds?count=10', { key })).json()) as { photos: unknown[] }).photos).toHaveLength(2)
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
    expect(((await (await call('/api/rounds', { key: b })).json()) as { photos: unknown[] }).photos).toEqual([])
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

describe('games and album high score', () => {
  type Rounds = { gameId: string; photos: { id: string }[] }
  type Guess = { finalScore: number; game?: { done: boolean; total: number; rounds: number; newHighScore?: boolean; highScore?: { total: number } } }
  const at = (lat: number) => ({ lat: String(lat), lng: '98.9672' })

  it('adds up server-computed scores and saves the album high score only when beaten', async () => {
    const { call, createPool, upload, status } = setup()
    const key = await createPool()
    await upload(key, at(18.8018), 10)
    await upload(key, at(19.0), 20)
    expect(await status(key)).toMatchObject({ highScore: null })

    const guessAll = async (openedTile: number, missKm: number) => {
      const r = (await (await call('/api/rounds?count=10', { key })).json()) as Rounds
      let last: Guess | null = null
      for (const p of r.photos) {
        // first guess reveals the answer; the counted guess is the one sent with the gameId
        const peek = (await (await call('/api/guess', { method: 'POST', key, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, guess: { lat: 0, lng: 0 }, opened: [0], timedOut: false }) })).json()) as { answer: { lat: number; lng: number }; game?: unknown }
        expect(peek.game).toBeUndefined() // no gameId -> not recorded
        const guess = { lat: peek.answer.lat + missKm / 111, lng: peek.answer.lng }
        last = (await (await call('/api/guess', { method: 'POST', key, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, gameId: r.gameId, guess, opened: [openedTile], timedOut: false }) })).json()) as Guess
      }
      return last!
    }

    const good = await guessAll(0, 0) // exact, 1 corner: (100 + 10 pinpoint) x 106% = 117 each
    expect(good.game).toMatchObject({ done: true, total: 234, rounds: 2, newHighScore: true, highScore: { total: 234 } })
    expect(await status(key)).toMatchObject({ highScore: { total: 234, rounds: 2 } })

    const worse = await guessAll(5, 50) // middle opened, 50 km off
    expect(worse.game?.done).toBe(true)
    expect(worse.game?.newHighScore).toBe(false)
    expect(worse.game?.total).toBeLessThan(234)
    expect(await status(key)).toMatchObject({ highScore: { total: 234 } })
  })

  it('counts each photo once per game and ignores foreign or unknown games', async () => {
    const { call, createPool, upload } = setup()
    const key = await createPool()
    const other = await createPool()
    await upload(key, at(18.8), 10)
    await upload(key, at(19.2), 20)
    const r = (await (await call('/api/rounds?count=10', { key })).json()) as Rounds
    const g = async (id: string, gameId: string, k = key) => {
      const res = await call('/api/guess', { method: 'POST', key: k, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, gameId, guess: { lat: 18.8, lng: 98.9672 }, opened: [0], timedOut: false }) })
      return (await res.json()) as Guess
    }
    const first = await g(r.photos[0].id, r.gameId)
    const again = await g(r.photos[0].id, r.gameId)
    expect(first.game).toMatchObject({ done: false })
    expect(again.game?.total).toBe(first.game?.total) // re-guess doesn't add
    expect((await g(r.photos[1].id, '00000000-0000-4000-8000-000000000000')).game).toBeUndefined()
    const otherRounds = (await (await call('/api/rounds', { key: other })).json()) as Rounds
    expect((await g(r.photos[1].id, otherRounds.gameId)).game).toBeUndefined() // game of another album
    const done = await g(r.photos[1].id, r.gameId)
    expect(done.game).toMatchObject({ done: true, rounds: 2 })
    expect((await g(r.photos[1].id, r.gameId)).game).toBeUndefined() // finished game can't be scored again
  })

  it('deleting the album removes its high score', async () => {
    const { call, createPool, upload, objects } = setup()
    const key = await createPool()
    await upload(key, at(18.8), 10)
    const r = (await (await call('/api/rounds', { key })).json()) as Rounds
    await call('/api/guess', { method: 'POST', key, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.photos[0].id, gameId: r.gameId, guess: { lat: 18.8, lng: 98.9672 }, opened: [0], timedOut: false }) })
    expect(objects.keys().some((k) => k.endsWith('highscore.json'))).toBe(true)
    await call('/api/pool', { method: 'DELETE', key })
    expect(objects.keys()).toEqual([])
  })
})

describe('photos from different days', () => {
  type Rounds = { gameId: string; photos: { id: string }[] }
  const day = (d: number) => `2024-03-${String(d).padStart(2, '0')}T10:00:00+07:00`

  it('a game spreads over different days before repeating one', async () => {
    const { call, createPool, upload, objects } = setup()
    const key = await createPool()
    // 6 photos on day 1, one each on days 2..5
    // clearly different colours: near-identical solid images would be (correctly) deduplicated
    for (let i = 0; i < 6; i++) await upload(key, { lat: String(18 + i * 0.01), lng: '98.9', takenAt: day(1) }, i * 45)
    for (let d = 2; d <= 5; d++) await upload(key, { lat: String(19 + d * 0.01), lng: '98.9', takenAt: day(d) }, 20 + (d - 2) * 45)
    expect(objects.keys().filter((k) => k.includes('/days/'))).toHaveLength(10)
    for (let run = 0; run < 8; run++) {
      const r = (await (await call('/api/rounds?count=5', { key })).json()) as Rounds
      const days = await Promise.all(
        r.photos.map(async (p) => {
          const g = (await (await call('/api/guess', { method: 'POST', key, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, guess: null, opened: [], timedOut: true }) })).json()) as { answer: { takenAt: string } }
          return g.answer.takenAt.slice(0, 10)
        }),
      )
      expect(new Set(days).size).toBe(5)
    }
  })

  it('keeps the day index in step with uploads and deletes, and backfills old photos', async () => {
    const { call, createPool, upload, objects } = setup()
    const key = await createPool()
    const { photoId } = (await (await upload(key, { lat: '18.8', lng: '98.9', takenAt: day(7) })).json()) as { photoId: string }
    expect(objects.keys().some((k) => k.endsWith(`days/2024-03-07/${photoId}`))).toBe(true)

    // simulate a photo stored before the index existed
    const marker = objects.keys().find((k) => k.endsWith(`/${photoId}`) && k.includes('/days/'))!
    await objects.delete([marker])
    await call('/api/rounds', { key })
    expect(objects.keys().some((k) => k.endsWith(`days/2024-03-07/${photoId}`))).toBe(true)

    await call(`/api/photos/${photoId}`, { method: 'DELETE', key })
    expect(objects.keys().some((k) => k.includes('/days/'))).toBe(false)
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
