/** A pool (keys, photos, answers) is deleted after this long with no play, upload or delete. */
export const INACTIVITY_MS = 72 * 60 * 60 * 1000

export function isExpired(lastActivityAt: string, now: number = Date.now()): boolean {
  return now - Date.parse(lastActivityAt) > INACTIVITY_MS
}

export function expiresAt(lastActivityAt: string): string {
  return new Date(Date.parse(lastActivityAt) + INACTIVITY_MS).toISOString()
}
