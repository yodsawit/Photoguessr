/**
 * PhotoGuessr HTTP API (Hono). Privacy rules enforced here:
 * - keys only via `Authorization: Bearer`, compared as peppered hashes (pools.ts)
 * - answers leave the server only in the /api/guess response for that one photo
 * - logs contain method, route pattern, status and duration — never keys, ids, bodies or IPs
 * - error bodies are generic; nothing is written to local disk
 */
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { scoreRound, TILE_COUNT } from '../src/game/scoring'
import type { GameProgress, LatLng, PublicPhoto } from '../src/game/types'
import { HttpError } from './errors'
import { expiresAt } from './expiry'
import { GameRegistry } from './games'
import { dayOf, pickRounds } from './pick'
import type { Geocoder } from './geocode'
import { createLimiter, processUpload } from './ingest'
import { bodyLimit } from 'hono/body-limit'
import { MAX_PHOTO_BYTES } from '../src/game/imageType'
import { isPhotoId, type PoolStore } from './poolStore'
import type { AuthedPool, PoolService } from './pools'

export type AppDeps = {
  pools: PoolService
  store: PoolStore
  geocoder: Pick<Geocoder, 'lookup'>
  /** Empty string disables pool creation. */
  adminCode: string
  log?: (line: string) => void
  /** Runs work after the response (place-name lookup). Defaults to fire-and-forget. */
  background?: (p: Promise<unknown>) => void
  clientIp?: (c: Context) => string
  now?: () => number
  games?: GameRegistry
}

const MAX_ROUNDS = 20
/**
 * Birthday surprise: from the 2nd game played with the surprise key, round 3 is the gift, until the
 * birthday page has been reached. Reloads and retries can't use it up.
 */
const SURPRISE_GAME = 2
const SURPRISE_ROUND = 3

/** Counts WRONG key/admin attempts per IP; once over the limit the IP waits, even with a correct key. */
class WrongAttemptLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>()
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number,
  ) {}
  retryAfterSec(ip: string): number {
    const h = this.hits.get(ip)
    if (!h || h.resetAt <= this.now()) return 0
    return h.count >= this.max ? Math.ceil((h.resetAt - this.now()) / 1000) : 0
  }
  fail(ip: string) {
    const now = this.now()
    const h = this.hits.get(ip)
    if (!h || h.resetAt <= now) this.hits.set(ip, { count: 1, resetAt: now + this.windowMs })
    else h.count++
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k)
  }
}

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const isLatLng = (v: unknown): v is LatLng =>
  typeof v === 'object' && v !== null && Number.isFinite((v as LatLng).lat) && Number.isFinite((v as LatLng).lng) && Math.abs((v as LatLng).lat) <= 90

const CSP = [
  "default-src 'self'",
  "img-src 'self' blob: data: https://tile.openstreetmap.org",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ')

export function createApp(deps: AppDeps) {
  const { pools, store, geocoder } = deps
  const log = deps.log ?? ((l: string) => console.log(l))
  const background = deps.background ?? ((p: Promise<unknown>) => void p.catch(() => undefined))
  const now = deps.now ?? Date.now
  const clientIp = deps.clientIp ?? ((c: Context) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown')
  const limiter = new WrongAttemptLimiter(10, 60_000, now)
  const games = deps.games ?? new GameRegistry(now)
  /** At most 2 photos decode at once server-wide (HEIC decoding is memory-hungry). */
  const decodeQueue = createLimiter(2)

  const app = new Hono()

  // Logger: route *pattern* only, so ids/keys in paths never reach the log.
  app.use('*', async (c, next) => {
    const start = performance.now()
    await next()
    log(`${c.req.method} ${c.req.routePath} ${c.res.status} ${Math.round(performance.now() - start)}ms`)
  })

  app.use('*', async (c, next) => {
    await next()
    c.header('Content-Security-Policy', CSP)
    c.header('X-Content-Type-Options', 'nosniff')
    // OSM's tile policy requires a Referer; this sends only our origin cross-site (keys are never in URLs).
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header('X-Frame-Options', 'DENY')
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    c.header('Permissions-Policy', 'geolocation=(), camera=(), microphone=()')
    if (c.req.path.startsWith('/api/')) c.header('Cache-Control', 'no-store')
  })

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      if (err.status === 429) c.header('Retry-After', err.message)
      return c.json({ error: err.status === 429 ? 'Too many wrong attempts, try again later' : err.message }, err.status as 400)
    }
    log(`error ${err instanceof Error ? err.name : 'unknown'}`) // never the message: it may contain data
    return c.json({ error: 'Something went wrong' }, 500)
  })

  const guard = (c: Context) => {
    const wait = limiter.retryAfterSec(clientIp(c))
    if (wait > 0) throw new HttpError(429, String(wait))
  }

  const auth = async (c: Context): Promise<AuthedPool> => {
    guard(c)
    const header = c.req.header('Authorization') ?? ''
    const key = header.startsWith('Bearer ') ? header.slice(7) : ''
    try {
      return await pools.authenticate(key)
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) limiter.fail(clientIp(c))
      throw err
    }
  }

  /** The surprise key only plays; uploads and deletes need the album's own key. */
  const ownerAuth = async (c: Context): Promise<AuthedPool> => {
    const authed = await auth(c)
    if (authed.surprise) throw new HttpError(403, 'This key can only play')
    return authed
  }

  const adminOnly = (c: Context) => {
    guard(c)
    if (!deps.adminCode) throw new HttpError(403, 'Album creation is disabled')
    if (!sameSecret(c.req.header('X-Admin-Code') ?? '', deps.adminCode)) {
      limiter.fail(clientIp(c))
      throw new HttpError(401, 'Invalid admin code')
    }
  }

  const photoIdParam = (c: Context) => {
    const id = c.req.param('id') ?? ''
    if (!isPhotoId(id)) throw new HttpError(404, 'Not found')
    return id
  }

  /** Fills in district/province later if the lookup failed at upload time. */
  const withPlace = async (poolId: string, photoId: string) => {
    const answer = await store.getAnswer(poolId, photoId)
    if (!answer || answer.district || answer.province) return answer
    const place = await geocoder.lookup(answer.lat, answer.lng)
    if (!place) return answer
    const updated = { ...answer, ...place }
    await store.putAnswer(poolId, photoId, updated)
    return updated
  }

  app.get('/api/health', (c) => c.json({ ok: true }))

  // ---- pool (one key does everything) -----------------------------------------------------

  app.post('/api/pools', async (c) => {
    adminOnly(c)
    const { key } = await pools.createPool()
    return c.json({ key }, 201)
  })

  app.get('/api/pool', async (c) => {
    const { pool, hasPhotos, surprise } = await auth(c)
    const [ids, highScore] = await Promise.all([store.listPhotoIds(pool.poolId), store.getHighScore(pool.poolId)])
    return c.json({ photoCount: ids.length, empty: !hasPhotos, lastActivityAt: pool.lastActivityAt, expiresAt: expiresAt(pool, hasPhotos), highScore, playOnly: !!surprise })
  })

  app.delete('/api/pool', async (c) => {
    const { pool } = await ownerAuth(c)
    await store.deletePool(pool)
    return c.json({ deleted: true })
  })

  // Size is enforced while the body streams in, so oversized uploads are cut off early.
  const photoSizeLimit = bodyLimit({
    maxSize: MAX_PHOTO_BYTES,
    onError: () => {
      throw new HttpError(413, `Photo is larger than ${MAX_PHOTO_BYTES / 1024 / 1024} MB`)
    },
  })

  app.post('/api/photos', photoSizeLimit, async (c) => {
    const { pool } = await ownerAuth(c)
    let bytes: Uint8Array
    let fields: { lat: unknown; lng: unknown; takenAt: unknown }
    const type = c.req.header('Content-Type') ?? ''
    if (type.startsWith('multipart/form-data') || type.startsWith('application/x-www-form-urlencoded')) {
      const body = await c.req.parseBody()
      const file = body.photo
      if (!(file instanceof File)) {
        // iOS Shortcuts: an image put into a *Text* form field arrives as a string, not a file.
        throw new HttpError(
          400,
          typeof file === 'string'
            ? "Missing photo: the 'photo' field was sent as Text. In the Shortcut, delete the photo field and add it again as a File field."
            : "Missing photo: no 'photo' field in the form.",
        )
      }
      bytes = new Uint8Array(await file.arrayBuffer())
      fields = { lat: body.lat, lng: body.lng, takenAt: body.takenAt }
    } else {
      // Raw upload (Shortcuts "Request Body: File"): the image is the whole body; answer in headers.
      bytes = new Uint8Array(await c.req.arrayBuffer())
      if (bytes.length === 0) throw new HttpError(400, 'Missing photo: the request body is empty.')
      fields = { lat: c.req.header('X-Lat'), lng: c.req.header('X-Lng'), takenAt: c.req.header('X-Taken-At') }
    }
    const processed = await decodeQueue(() => processUpload(bytes, fields))

    const existing = await store.findBySha(pool.poolId, processed.sha256)
    if (existing && (await store.getAnswer(pool.poolId, existing))) return c.json({ duplicate: true, photoId: existing }, 200)

    const photoId = randomUUID()
    await store.putPhoto(pool.poolId, photoId, processed.image, {
      lat: processed.lat,
      lng: processed.lng,
      takenAt: processed.takenAt,
      district: '',
      province: '',
      width: processed.width,
      height: processed.height,
      sha256: processed.sha256,
      uploadedAt: new Date(now()).toISOString(),
    })
    await pools.markHasPhotos(pool)
    background(withPlace(pool.poolId, photoId)) // Nominatim is queued at 1 req/s; don't make the phone wait
    return c.json({ photoId }, 201)
  })

  app.delete('/api/photos/:id', async (c) => {
    const { pool } = await ownerAuth(c)
    if (!(await store.deletePhoto(pool.poolId, photoIdParam(c)))) throw new HttpError(404, 'Not found')
    await pools.markMaybeEmpty(pool)
    return c.json({ deleted: true })
  })

  // ---- playing -----------------------------------------------------------------------------

  app.get('/api/rounds', async (c) => {
    const { pool, surprise } = await auth(c)
    const count = Math.min(MAX_ROUNDS, Math.max(1, Number(c.req.query('count')) || 1))
    const [allIds, days] = await Promise.all([store.listPhotoIds(pool.poolId), store.listPhotoDays(pool.poolId)])
    // One-time backfill for photos stored before the day index existed.
    const missing = allIds.filter((id) => !days.has(id))
    for (let i = 0; i < missing.length; i += 16) {
      await Promise.all(
        missing.slice(i, i + 16).map(async (id) => {
          const a = await store.getAnswer(pool.poolId, id)
          if (!a) return
          await store.putPhotoDay(pool.poolId, id, a.takenAt)
          days.set(id, dayOf(a.takenAt) ?? 'none')
        }),
      )
    }
    // Different days first; undated photos ("none") count as a day of their own each.
    const ids = pickRounds(allIds, (id) => (days.get(id) === 'none' ? null : (days.get(id) ?? null)), count)
    const answers = await Promise.all(ids.map((id) => store.getAnswer(pool.poolId, id)))
    const photos: PublicPhoto[] = ids.flatMap((id, i) => {
      const a = answers[i]
      return a ? [{ id, width: a.width, height: a.height }] : []
    })
    const { gameId } = games.create(pool.poolId, photos.map((p) => p.id))
    if (surprise && photos.length > 0) {
      const state = await store.getSurprise(pool.poolId)
      if (state.gift && !state.seen && state.games >= SURPRISE_GAME - 1) {
        return c.json({ gameId, photos, surprise: { round: Math.min(SURPRISE_ROUND, photos.length), ...state.gift } })
      }
    }
    return c.json({ gameId, photos })
  })

  app.get('/api/photo/:id', async (c) => {
    const { pool } = await auth(c)
    const image = await store.getImage(pool.poolId, photoIdParam(c))
    if (!image) throw new HttpError(404, 'Not found')
    return c.body(image as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': 'image/webp' })
  })

  app.post('/api/guess', async (c) => {
    const { pool, surprise } = await auth(c)
    const req = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const id = typeof req?.id === 'string' ? req.id : ''
    if (!isPhotoId(id)) throw new HttpError(400, 'Invalid guess')
    const guess = req?.guess ?? null
    if (guess !== null && !isLatLng(guess)) throw new HttpError(400, 'Invalid guess')
    const opened = req?.opened
    if (!Array.isArray(opened) || !opened.every((i) => Number.isInteger(i) && i >= 0 && i < TILE_COUNT)) throw new HttpError(400, 'Invalid guess')

    const answer = await withPlace(pool.poolId, id)
    if (!answer) throw new HttpError(404, 'Not found')
    const { lat, lng, takenAt, district, province } = answer
    const result = scoreRound({ lat, lng }, guess, new Set(opened as number[]), req?.timedOut === true)

    // Record against the game (server-computed score only) and update the album high score.
    let game: GameProgress | undefined
    const tracked = games.get(req?.gameId, pool.poolId)
    const firstGuess = tracked?.scores.size === 0
    const progress = tracked && games.record(tracked, id, result.finalScore)
    if (progress && surprise) {
      // Surprise-key games don't count toward the high score; a game counts as played at its first guess.
      if (firstGuess) {
        const state = await store.getSurprise(pool.poolId)
        await store.putSurprise(pool.poolId, { ...state, games: state.games + 1 })
      }
    } else if (progress) {
      game = progress
      if (progress.done) {
        const best = await store.getHighScore(pool.poolId)
        const newHighScore = !best || progress.total > best.total
        const highScore = newHighScore ? { total: progress.total, rounds: progress.rounds, at: new Date(now()).toISOString() } : best
        if (newHighScore) await store.putHighScore(pool.poolId, highScore)
        game = { ...progress, highScore, newHighScore }
      }
    }
    return c.json({ ...result, answer: { lat, lng, takenAt, district, province }, ...(game && { game }) })
  })

  /** Admin: clears one album's high score. Needs the admin code AND that album's own key (header, never URL). */
  app.post('/api/highscore/reset', async (c) => {
    adminOnly(c)
    const { pool } = await ownerAuth(c)
    const previous = await store.getHighScore(pool.poolId)
    if (previous) await store.deleteHighScore(pool.poolId)
    return c.json({ reset: true, previous: previous && { total: previous.total, rounds: previous.rounds } })
  })

  // ---- birthday surprise (see PoolService surprise config) ------------------------------------

  app.get('/api/surprise/gift', async (c) => {
    const { pool, surprise } = await auth(c)
    const image = surprise ? await store.getGift(pool.poolId) : null
    if (!image) throw new HttpError(404, 'Not found')
    return c.body(image as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': 'image/webp' })
  })

  /** The birthday page was reached: later games are normal again. */
  app.post('/api/surprise/seen', async (c) => {
    const { pool, surprise } = await auth(c)
    if (!surprise) throw new HttpError(404, 'Not found')
    const state = await store.getSurprise(pool.poolId)
    await store.putSurprise(pool.poolId, { ...state, seen: true })
    return c.json({ seen: true })
  })

  app.put('/api/surprise/gift', photoSizeLimit, async (c) => {
    adminOnly(c)
    const { pool } = await pools.surpriseAlbum()
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    // Same cleaning as album photos (magic bytes, pixel limit, WebP without metadata); the location is unused.
    const processed = await decodeQueue(() => processUpload(bytes, { lat: '0', lng: '0' }))
    await store.putGift(pool.poolId, processed.image)
    const state = await store.getSurprise(pool.poolId)
    await store.putSurprise(pool.poolId, { ...state, gift: { width: processed.width, height: processed.height } })
    return c.json({ width: processed.width, height: processed.height, games: state.games }, 201)
  })

  app.post('/api/surprise/reset', async (c) => {
    adminOnly(c)
    const { pool } = await pools.surpriseAlbum()
    const state = await store.getSurprise(pool.poolId)
    await store.putSurprise(pool.poolId, { ...state, games: 0, seen: false })
    return c.json({ games: 0, seen: false, gift: state.gift !== null })
  })

  app.all('/api/*', () => {
    throw new HttpError(404, 'Not found')
  })

  return app
}
