/**
 * When a pool (key, photos, answers) is deleted:
 * - with photos: 72 h after the last play, upload or delete
 * - without photos: 1 h after it became empty (created, or last photo deleted). Visits don't extend it.
 */
export const INACTIVITY_MS = 72 * 60 * 60 * 1000
export const EMPTY_MS = 60 * 60 * 1000

export type ExpiryFields = { createdAt: string; lastActivityAt: string; emptySince: string | null }

export function expiresAtMs(pool: ExpiryFields, hasPhotos: boolean): number {
  if (hasPhotos) return Date.parse(pool.lastActivityAt) + INACTIVITY_MS
  // emptySince is always set for empty pools; if a racing write lost it, fall back to the latest
  // activity so a pool is never deleted early.
  return Date.parse(pool.emptySince ?? pool.lastActivityAt) + EMPTY_MS
}

export function isExpired(pool: ExpiryFields, hasPhotos: boolean, now: number = Date.now()): boolean {
  return now > expiresAtMs(pool, hasPhotos)
}

export function expiresAt(pool: ExpiryFields, hasPhotos: boolean): string {
  return new Date(expiresAtMs(pool, hasPhotos)).toISOString()
}
