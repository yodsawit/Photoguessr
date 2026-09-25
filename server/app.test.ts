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

/** `surprise.albumKey` is filled in once the test has created that album. */
function setup(surprise?: { key: string; albumKey: string }) {
  let now = T0
  const objects = new MemoryObjects()
  const store = createPoolStore(objects)
  const pools = new PoolService(store, 'test-pepper-0123456789', () => now, surprise)
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
    expect(result.finalScore).toBe(115) // exact guess, 1 corner open: 100 x 105% + 10 pinpoint
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

    const good = await guessAll(0, 0) // exact, 1 corner: 100 x 105% + 10 pinpoint = 115 each
    expect(good.game).toMatchObject({ done: true, total: 230, rounds: 2, newHighScore: true, highScore: { total: 230 } })
    expect(await status(key)).toMatchObject({ highScore: { total: 230, rounds: 2 } })

    const worse = await guessAll(5, 50) // middle opened, 50 km off
    expect(worse.game?.done).toBe(true)
    expect(worse.game?.newHighScore).toBe(false)
    expect(worse.game?.total).toBeLessThan(230)
    expect(await status(key)).toMatchObject({ highScore: { total: 230 } })
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

describe('birthday surprise key', () => {
  type Rounds = { gameId: string; photos: { id: string }[]; surprise?: { round: number; width: number; height: number } }
  const admin = { 'X-Admin-Code': ADMIN }
  const gift = () => sharp({ create: { width: 500, height: 400, channels: 3, background: { r: 250, g: 200, b: 220 } } }).jpeg().toBuffer()

  async function surpriseSetup(photos = 4) {
    const cfg = { key: '270926', albumKey: '' }
    const t = setup(cfg)
    cfg.albumKey = await t.createPool()
    for (let i = 0; i < photos; i++) await t.upload(cfg.albumKey, { lat: String(18 + i), lng: '98.9', takenAt: `2024-09-0${i + 1}T10:00:00+07:00` }, 10 + i * 30)
    const putGift = async () => t.call('/api/surprise/gift', { method: 'PUT', headers: admin, body: new Uint8Array(await gift()) })
    const rounds = async (key = cfg.key) => (await (await t.call('/api/rounds?count=10', { key })).json()) as Rounds
    const guess = (r: Rounds, i = 0, key = cfg.key) =>
      t.call('/api/guess', { method: 'POST', key, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.photos[i].id, gameId: r.gameId, guess: { lat: 18, lng: 98.9 }, opened: [], timedOut: false }) })
    /** A game counts as played at its first guess. */
    const play = async (key = cfg.key) => {
      const r = await rounds(key)
      await guess(r, 0, key)
      await guess(r, 1, key)
      return r
    }
    const seen = (key = cfg.key) => t.call('/api/surprise/seen', { method: 'POST', key })
    return { ...t, cfg, putGift, rounds, guess, play, seen }
  }

  it('opens the photos of the linked album (key is case-insensitive)', async () => {
    const { cfg, rounds, status } = await surpriseSetup()
    expect((await rounds(cfg.key)).photos).toHaveLength(4)
    expect(await status(cfg.key)).toMatchObject({ photoCount: 4, playOnly: true })
    expect(await status(cfg.albumKey)).toMatchObject({ playOnly: false })
  })

  it('is play-only: no uploads or deletes', async () => {
    const { cfg, call, upload, rounds } = await surpriseSetup()
    const { photos } = await rounds(cfg.albumKey)
    expect((await upload(cfg.key)).status).toBe(403)
    expect((await call(`/api/photos/${photos[0].id}`, { method: 'DELETE', key: cfg.key })).status).toBe(403)
    expect((await call('/api/pool', { method: 'DELETE', key: cfg.key })).status).toBe(403)
    expect((await rounds(cfg.albumKey)).photos).toHaveLength(4)
  })

  it('after one played game, every game has the gift in round 3 until the birthday page was seen', async () => {
    const { cfg, putGift, rounds, play, seen } = await surpriseSetup()
    expect((await putGift()).status).toBe(201)
    expect((await rounds()).surprise).toBeUndefined() // loaded but never guessed: not played
    expect((await play()).surprise).toBeUndefined() // game 1
    await play(cfg.albumKey) // the album key never counts
    expect((await rounds(cfg.albumKey)).surprise).toBeUndefined()
    expect((await rounds()).surprise).toEqual({ round: 3, width: 500, height: 400 })
    expect((await play()).surprise).toEqual({ round: 3, width: 500, height: 400 }) // reload / new game: still there
    expect((await seen()).status).toBe(200)
    expect((await rounds()).surprise).toBeUndefined()
    expect((await seen(cfg.albumKey)).status).toBe(404) // only the surprise key
  })

  it('without an uploaded gift there is no surprise round', async () => {
    const { play, rounds } = await surpriseSetup()
    await play()
    expect((await rounds()).surprise).toBeUndefined()
  })

  it('a small album gets the surprise in its last round', async () => {
    const { putGift, rounds, play } = await surpriseSetup(2)
    await putGift()
    await play()
    expect((await rounds()).surprise?.round).toBe(2)
  })

  it('gift upload needs the admin code and is re-encoded; only the surprise key can fetch it', async () => {
    const { cfg, call, putGift, objects } = await surpriseSetup()
    expect((await call('/api/surprise/gift', { method: 'PUT', body: new Uint8Array(await gift()) })).status).toBe(401)
    expect((await call('/api/surprise/gift', { method: 'PUT', headers: admin, body: new Uint8Array([1, 2, 3, 4]) })).status).toBe(415)
    expect((await call('/api/surprise/gift', { key: cfg.key })).status).toBe(404) // not uploaded yet
    await putGift()
    expect(objects.keys().some((k) => /^pools\/[0-9a-f-]+\/surprise\/gift\.webp$/.test(k))).toBe(true)
    const res = await call('/api/surprise/gift', { key: cfg.key })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/webp')
    expect((await call('/api/surprise/gift', { key: cfg.albumKey })).status).toBe(404)
  })

  it('the admin can reset the count and the seen flag', async () => {
    const { call, putGift, rounds, play, seen } = await surpriseSetup()
    await putGift()
    await play()
    await seen()
    expect((await call('/api/surprise/reset', { method: 'POST' })).status).toBe(401)
    expect((await call('/api/surprise/reset', { method: 'POST', headers: admin })).status).toBe(200)
    expect((await play()).surprise).toBeUndefined()
    expect((await rounds()).surprise?.round).toBe(3)
  })

  it('surprise games never touch the album high score', async () => {
    const { cfg, rounds, guess, status } = await surpriseSetup(1)
    const res = await guess(await rounds())
    expect(res.status).toBe(200)
    expect(((await res.json()) as { game?: unknown }).game).toBeUndefined()
    expect(await status(cfg.albumKey)).toMatchObject({ highScore: null })
  })

  it('without the config the surprise routes are 404 and the key is just a wrong key', async () => {
    const { call } = setup()
    expect((await call('/api/surprise/gift', { method: 'PUT', headers: admin, body: new Uint8Array(await gift()) })).status).toBe(404)
    expect((await call('/api/rounds', { key: '270926' })).status).toBe(401)
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

describe('browser uploads of original photos', () => {
  const gpsJpeg = async (color = 90) =>
    new Uint8Array(
      await sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: color, g: 120, b: 60 } } })
        .jpeg()
        .withExif({
          IFD2: { DateTimeOriginal: '2024:09:28 11:10:56', OffsetTimeOriginal: '+07:00' },
          IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '18/1 48/1 653/100', GPSLongitudeRef: 'E', GPSLongitude: '98/1 58/1 206/100' },
        })
        .toBuffer(),
    )
  const raw = (call: ReturnType<typeof setup>['call'], key: string, body: Uint8Array, type = 'application/octet-stream') =>
    call('/api/photos', { method: 'POST', key, body, headers: { 'Content-Type': type } })

  it('reads GPS and date from the original when no headers are sent', async () => {
    const { call, createPool } = setup()
    const key = await createPool()
    const res = await raw(call, key, await gpsJpeg())
    expect(res.status).toBe(201)
    const { photoId } = (await res.json()) as { photoId: string }
    const g = (await (await call('/api/guess', { method: 'POST', key, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: photoId, guess: null, opened: [], timedOut: true }) })).json()) as { answer: { lat: number; takenAt: string } }
    expect(g.answer.lat).toBeCloseTo(18.8018, 3)
    expect(g.answer.takenAt).toBe('2024-09-28T11:10:56+07:00')
    const photo = await call(`/api/photo/${photoId}`, { key })
    expect((await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).exif).toBeUndefined()
  })

  it('refuses non-photos (415), photos without location (400), and flags duplicates', async () => {
    const { call, createPool } = setup()
    const key = await createPool()
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0])
    for (const [body, type] of [[svg, 'image/svg+xml'], [svg, 'image/jpeg'], [gif, 'image/gif']] as const) {
      const r = await raw(call, key, body, type)
      expect(r.status).toBe(415)
      expect(((await r.json()) as { error: string }).error).toMatch(/Only photos/)
    }
    const noGps = new Uint8Array(await sharp({ create: { width: 50, height: 50, channels: 3, background: 'white' } }).jpeg().toBuffer())
    expect((await raw(call, key, noGps)).status).toBe(400)
    const photo = await gpsJpeg(33)
    expect((await raw(call, key, photo)).status).toBe(201)
    const dup = await raw(call, key, photo)
    expect(await dup.json()).toMatchObject({ duplicate: true })
  })

  it('refuses bodies over 40 MB with 413, and needs the album key first', async () => {
    const { call, createPool } = setup()
    const key = await createPool()
    const huge = new Uint8Array(40 * 1024 * 1024 + 1)
    huge.set([0xff, 0xd8, 0xff])
    const r = await raw(call, key, huge, 'image/jpeg')
    expect(r.status).toBe(413)
    expect(((await r.json()) as { error: string }).error).toMatch(/larger than 40 MB/)
    expect((await raw(call, 'ZZZZZZ', await gpsJpeg())).status).toBe(401)
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
