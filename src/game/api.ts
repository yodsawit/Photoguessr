import type { GuessRequest, GuessResponse, HighScore, RoundsResponse } from './types'

/** Keys travel only in the Authorization header — never in URLs. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function call<T>(path: string, init: RequestInit & { key?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.key) headers.set('Authorization', `Bearer ${init.key}`)
  let res: Response
  try {
    res = await fetch(path, { ...init, headers })
  } catch {
    throw new ApiError(0, "Can't reach the game server")
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export const KEY_PATTERN = /^[A-Z0-9]{6}$/
export const normalizeKey = (s: string) => s.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6)

// ---- playing (the pool key) ----
export const fetchRounds = (key: string, count: number) => call<RoundsResponse>(`/api/rounds?count=${count}`, { key })

export const postGuess = (key: string, req: GuessRequest) =>
  call<GuessResponse>('/api/guess', { key, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) })

/** Downloads a photo with the pool key and returns a local object URL (caller must revoke it). */
export async function fetchPhotoUrl(key: string, photoId: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`/api/photo/${photoId}`, { headers: { Authorization: `Bearer ${key}` }, signal })
  if (!res.ok) throw new ApiError(res.status, 'Could not load the photo')
  return URL.createObjectURL(await res.blob())
}

/** Birthday surprise gift photo (only the surprise key gets it), as a local object URL. */
export async function fetchSurpriseGiftUrl(key: string): Promise<string> {
  const res = await fetch('/api/surprise/gift', { headers: { Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new ApiError(res.status, 'Could not load the photo')
  return URL.createObjectURL(await res.blob())
}

/** Birthday page reached: the server stops handing out the gift round. */
export const markSurpriseSeen = (key: string) => call<{ seen: true }>('/api/surprise/seen', { key, method: 'POST' })

// ---- pool (same key) ----
export type PoolStatus = { photoCount: number; empty: boolean; lastActivityAt: string; expiresAt: string; highScore: HighScore | null
  /** The key can only play (birthday surprise key): no uploads or deletes. */
  playOnly?: boolean
}

export const createPool = (adminCode: string) =>
  call<{ key: string }>('/api/pools', { method: 'POST', headers: { 'X-Admin-Code': adminCode } })
export const fetchPoolStatus = (key: string) => call<PoolStatus>('/api/pool', { key })
export const deletePool = (key: string) => call<{ deleted: true }>('/api/pool', { key, method: 'DELETE' })

export type UploadResult = { photoId: string; duplicate?: boolean }

/**
 * Uploads one original photo as the raw request body. No location fields are sent: the server
 * reads GPS/date from the file itself, then stores only a cleaned 1920 px WebP.
 */
export async function uploadPhoto(key: string, file: File, signal?: AbortSignal): Promise<UploadResult> {
  let res: Response
  try {
    res = await fetch('/api/photos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/octet-stream' },
      body: file,
      signal,
    })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new ApiError(0, "Can't reach the game server")
  }
  const body = (await res.json().catch(() => null)) as (UploadResult & { error?: string }) | null
  if (!res.ok || !body) throw new ApiError(res.status, body?.error ?? `Upload failed (${res.status})`)
  return body
}
