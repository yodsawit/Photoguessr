import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { HttpError } from './errors'
import { isExpired } from './expiry'
import type { PoolRecord, PoolStore } from './poolStore'

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

/** `surprise`: signed in with the birthday surprise key (play-only view of another album). */
export type AuthedPool = { pool: PoolRecord; hasPhotos: boolean; surprise?: boolean }

/**
 * Birthday surprise: an extra key that opens another album's photos, play-only. Both keys come from
 * env (SURPRISE_KEY, SURPRISE_ALBUM_KEY) and are never stored.
 */
export type SurpriseConfig = { key: string; albumKey: string }

/** One key per pool: whoever has it can play, add/delete photos, see status and delete the pool. */
export class PoolService {
  constructor(
    private readonly store: PoolStore,
    private readonly pepper: string,
    private readonly now: () => number = Date.now,
    private readonly surprise?: SurpriseConfig,
  ) {
    if (pepper.length < 16) throw new Error('KEY_PEPPER must be at least 16 characters')
  }

  private iso() {
    return new Date(this.now()).toISOString()
  }

  /** Creates an empty pool and returns its key. The key is never stored and cannot be shown again. */
  async createPool(): Promise<{ poolId: string; key: string }> {
    const key = await this.freshKey()
    const at = this.iso()
    const pool: PoolRecord = { poolId: randomUUID(), keyHash: hashKey(key, this.pepper), createdAt: at, lastActivityAt: at, emptySince: at }
    await this.store.putPool(pool)
    await this.store.putKey(pool.keyHash, { poolId: pool.poolId })
    return { poolId: pool.poolId, key }
  }

  /**
   * Resolves a key to its pool and records activity. 401 for any wrong/unknown key (never says
   * why); 404 if the pool had expired — it is deleted on the spot.
   */
  async authenticate(rawKey: unknown): Promise<AuthedPool> {
    const key = normalizeKey(rawKey)
    if (!key) throw new HttpError(401, 'Invalid key')
    if (this.isSurpriseKey(key)) return { ...(await this.authenticate(this.surprise!.albumKey)), surprise: true }
    const keyHash = hashKey(key, this.pepper)
    const entry = await this.store.getKey(keyHash)
    const pool = entry && (await this.store.getPool(entry.poolId))
    if (!pool || !sameHash(pool.keyHash, keyHash)) throw new HttpError(401, 'Invalid key')

    const hasPhotos = await this.store.hasPhotos(pool.poolId)
    if (isExpired(pool, hasPhotos, this.now())) {
      await this.store.deletePool(pool)
      throw new HttpError(404, 'This album has expired')
    }
    const touched = { ...pool, lastActivityAt: this.iso() }
    await this.store.putPool(touched)
    return { pool: touched, hasPhotos }
  }

  get surpriseEnabled() {
    const s = this.surprise
    const key = s && normalizeKey(s.key)
    return !!(key && normalizeKey(s.albumKey) && key !== normalizeKey(s.albumKey))
  }

  /** The album behind the surprise key (for the admin gift/reset routes); 404 if not set up. */
  async surpriseAlbum(): Promise<AuthedPool> {
    if (!this.surpriseEnabled) throw new HttpError(404, 'Not found')
    return this.authenticate(this.surprise!.albumKey).catch((err: unknown) => {
      throw err instanceof HttpError && err.status === 401 ? new HttpError(404, 'The surprise album was not found') : err
    })
  }

  private isSurpriseKey(key: string) {
    if (!this.surpriseEnabled) return false
    return sameHash(hashKey(key, this.pepper), hashKey(normalizeKey(this.surprise!.key)!, this.pepper))
  }

  /** After storing a photo: the pool is no longer empty. */
  async markHasPhotos(pool: PoolRecord) {
    if (pool.emptySince !== null) await this.store.putPool({ ...pool, emptySince: null })
  }

  /** After deleting a photo: if that was the last one, start the 1 h empty clock now. */
  async markMaybeEmpty(pool: PoolRecord) {
    if (!(await this.store.hasPhotos(pool.poolId))) await this.store.putPool({ ...pool, emptySince: this.iso() })
  }

  private async freshKey(): Promise<string> {
    for (;;) {
      const key = generateKey()
      if (!(await this.store.getKey(hashKey(key, this.pepper)))) return key
    }
  }
}
