import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { HttpError } from './errors'
import { isExpired } from './expiry'
import type { PoolRecord, PoolStore, Role } from './poolStore'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const KEY_LENGTH = 6
const KEY_FORMAT = /^[A-Z0-9]{6}$/

export function generateKey(): string {
  let key = ''
  for (let i = 0; i < KEY_LENGTH; i++) key += ALPHABET[randomInt(ALPHABET.length)]
  return key
}

/** Trims + uppercases; returns null for anything that is not exactly 6 of A-Z0-9. */
export function normalizeKey(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const key = input.trim().toUpperCase()
  return KEY_FORMAT.test(key) ? key : null
}

/**
 * Keys are short (~2.2e9 combinations), so a plain hash would be brute-forced offline in seconds
 * if the bucket leaked. HMAC with a server-only pepper makes a leaked hash useless on its own.
 */
export function hashKey(key: string, pepper: string): string {
  return createHmac('sha256', pepper).update(key).digest('hex')
}

const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export class PoolService {
  constructor(
    private readonly store: PoolStore,
    private readonly pepper: string,
    private readonly now: () => number = Date.now,
  ) {
    if (pepper.length < 16) throw new Error('KEY_PEPPER must be at least 16 characters')
  }

  /** Creates a pool and returns its keys. The keys are never stored and cannot be shown again. */
  async createPool(): Promise<{ poolId: string; uploadKey: string; playKey: string }> {
    const uploadKey = await this.freshKey()
    let playKey = await this.freshKey()
    while (playKey === uploadKey) playKey = await this.freshKey()

    const at = new Date(this.now()).toISOString()
    const pool: PoolRecord = {
      poolId: randomUUID(),
      uploadKeyHash: hashKey(uploadKey, this.pepper),
      playKeyHash: hashKey(playKey, this.pepper),
      createdAt: at,
      lastActivityAt: at,
    }
    await this.store.putPool(pool)
    await this.store.putKey(pool.uploadKeyHash, { poolId: pool.poolId, role: 'upload' })
    await this.store.putKey(pool.playKeyHash, { poolId: pool.poolId, role: 'play' })
    return { poolId: pool.poolId, uploadKey, playKey }
  }

  /**
   * Resolves a key to its pool for the given role and records activity.
   * 401 for any wrong/unknown/other-role key (never says which); 404 if the pool just expired.
   */
  async authenticate(rawKey: unknown, role: Role): Promise<PoolRecord> {
    const key = normalizeKey(rawKey)
    if (!key) throw new HttpError(401, 'Invalid key')
    const keyHash = hashKey(key, this.pepper)
    const entry = await this.store.getKey(keyHash)
    if (!entry || entry.role !== role) throw new HttpError(401, 'Invalid key')

    const pool = await this.store.getPool(entry.poolId)
    const expected = role === 'upload' ? pool?.uploadKeyHash : pool?.playKeyHash
    if (!pool || !expected || !sameHash(expected, keyHash)) throw new HttpError(401, 'Invalid key')

    const now = this.now()
    if (isExpired(pool.lastActivityAt, now)) {
      await this.store.deletePool(pool)
      throw new HttpError(404, 'This pool has expired')
    }
    const touched = { ...pool, lastActivityAt: new Date(now).toISOString() }
    await this.store.putPool(touched)
    return touched
  }

  private async freshKey(): Promise<string> {
    for (;;) {
      const key = generateKey()
      if (!(await this.store.getKey(hashKey(key, this.pepper)))) return key
    }
  }
}
