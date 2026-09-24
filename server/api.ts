/**
 * Game API: keeps answers (GPS, place, date) off the client until a guess is made.
 *
 *   GET  /api/rounds?count=N  -> PublicPhoto[]   (random, no answer fields)
 *   POST /api/guess           -> GuessResponse   (scored server-side, answer revealed)
 *
 * Mounted into Vite's dev and preview servers by `vite.config.ts`.
 */
import { readFileSync, existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { scoreRound, TILE_COUNT } from '../src/game/scoring.ts'
import type { GuessRequest, GuessResponse, LatLng, PoolPhoto, PublicPhoto } from '../src/game/types.ts'

export function toPublic({ id, src, width, height }: PoolPhoto): PublicPhoto {
  return { id, src, width, height }
}

export function pickRounds(pool: PoolPhoto[], count: number, random = Math.random): PublicPhoto[] {
  const a = [...pool]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, Math.max(0, count)).map(toPublic)
}

const isLatLng = (v: unknown): v is LatLng =>
  typeof v === 'object' && v !== null &&
  Number.isFinite((v as LatLng).lat) && Number.isFinite((v as LatLng).lng) &&
  Math.abs((v as LatLng).lat) <= 90

/** Validates a guess and scores it against the hidden answer. Throws on bad input. */
export function gradeGuess(pool: PoolPhoto[], body: unknown): GuessResponse {
  const req = body as Partial<GuessRequest>
  const photo = pool.find((p) => p.id === req?.id)
  if (!photo) throw new HttpError(404, 'Unknown photo')
  if (req.guess !== null && !isLatLng(req.guess)) throw new HttpError(400, 'Invalid guess')
  if (!Array.isArray(req.opened) || !req.opened.every((i) => Number.isInteger(i) && i >= 0 && i < TILE_COUNT)) {
    throw new HttpError(400, 'Invalid opened tiles')
  }
  const { lat, lng, takenAt, district, province } = photo
  const result = scoreRound({ lat, lng }, req.guess ?? null, new Set(req.opened), req.timedOut === true)
  return { ...result, answer: { lat, lng, takenAt, district, province } }
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function loadPool(file: string): PoolPhoto[] {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as PoolPhoto[]) : []
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 10_000) throw new HttpError(413, 'Body too large')
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

/** Connect-style middleware. Re-reads the pool per request so `npm run pool` needs no restart. */
export function createApi(poolFile: string) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    try {
      if (req.method === 'GET' && url.pathname === '/api/rounds') {
        const count = Number(url.searchParams.get('count') ?? 1)
        return send(res, 200, pickRounds(loadPool(poolFile), Number.isFinite(count) ? count : 1))
      }
      if (req.method === 'POST' && url.pathname === '/api/guess') {
        return send(res, 200, gradeGuess(loadPool(poolFile), await readJson(req)))
      }
    } catch (err) {
      return send(res, err instanceof HttpError ? err.status : 500, { error: err instanceof Error ? err.message : 'Error' })
    }
    next()
  }
}
