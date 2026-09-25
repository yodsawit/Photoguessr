/**
 * The R2 layout for pools, on top of any ObjectStore. Shared by the Render server and the
 * sweeper Worker, so there is one definition of what "a pool" is and how to delete it.
 *
 *   keys/<keyHash>.json                    { poolId }                            key -> pool index
 *   pools/<poolId>/pool.json               PoolRecord
 *   pools/<poolId>/photos/<photoId>.webp   metadata-free image
 *   pools/<poolId>/photos/<photoId>.json   StoredAnswer (the hidden answer)
 *   pools/<poolId>/hashes/<sha256>         photoId                               dedup index
 *   pools/<poolId>/highscore.json          HighScore                             best finished game
 *   pools/<poolId>/days/<day|none>/<photoId>  (empty)                            photo-day index
 */
import { isExpired } from './expiry'
import { dayOf } from './pick'
import type { ObjectStore } from './objects'
import type { Answer, HighScore } from '../src/game/types'

export type PoolRecord = {
  poolId: string
  keyHash: string
  createdAt: string
  lastActivityAt: string
  /** When the pool last became empty (creation or last photo deleted); null while it has photos. */
  emptySince: string | null
}

export type KeyRecord = { poolId: string }

export type StoredAnswer = Answer & {
  width: number
  height: number
  sha256: string
  uploadedAt: string
}

const enc = new TextEncoder()
const dec = new TextDecoder()
const toJson = (v: unknown) => enc.encode(JSON.stringify(v))
const PHOTO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const POOL_ID = PHOTO_ID

export const isPhotoId = (id: string) => PHOTO_ID.test(id)

const poolDir = (poolId: string) => {
  if (!POOL_ID.test(poolId)) throw new Error('invalid pool id')
  return `pools/${poolId}/`
}
const photoKey = (poolId: string, photoId: string, ext: 'webp' | 'json') => {
  if (!isPhotoId(photoId)) throw new Error('invalid photo id')
  return `${poolDir(poolId)}photos/${photoId}.${ext}`
}

const dayKey = (poolId: string, photoId: string, takenAt: string | null) => {
  if (!isPhotoId(photoId)) throw new Error('invalid photo id')
  return `${poolDir(poolId)}days/${dayOf(takenAt) ?? 'none'}/${photoId}`
}

export function createPoolStore(objects: ObjectStore) {
  const getJson = async <T>(key: string): Promise<T | null> => {
    const b = await objects.get(key)
    return b ? (JSON.parse(dec.decode(b)) as T) : null
  }
  const putJson = (key: string, v: unknown) => objects.put(key, toJson(v), 'application/json')

  const store = {
    getKey: (keyHash: string) => getJson<KeyRecord>(`keys/${keyHash}.json`),
    putKey: (keyHash: string, rec: KeyRecord) => putJson(`keys/${keyHash}.json`, rec),

    getPool: (poolId: string) => getJson<PoolRecord>(`${poolDir(poolId)}pool.json`),
    putPool: (rec: PoolRecord) => putJson(`${poolDir(rec.poolId)}pool.json`, rec),

    async listPools(): Promise<PoolRecord[]> {
      const dirs = await objects.listPrefixes('pools/')
      const pools = await Promise.all(dirs.map((d) => getJson<PoolRecord>(`${d}pool.json`)))
      return pools.filter((p): p is PoolRecord => p !== null)
    },

    async listPhotoIds(poolId: string): Promise<string[]> {
      const keys = await objects.list(`${poolDir(poolId)}photos/`)
      return keys.filter((k) => k.endsWith('.json')).map((k) => k.slice(k.lastIndexOf('/') + 1, -'.json'.length))
    },

    /** Separate object from pool.json so frequent activity writes can't overwrite it. */
    getHighScore: (poolId: string) => getJson<HighScore>(`${poolDir(poolId)}highscore.json`),
    putHighScore: (poolId: string, hs: HighScore) => putJson(`${poolDir(poolId)}highscore.json`, hs),

    /** Asks the bucket directly (one item), so concurrent uploads can't make it stale. */
    hasPhotos: (poolId: string) => objects.any(`${poolDir(poolId)}photos/`),

    findBySha: async (poolId: string, sha256: string) => {
      const b = await objects.get(`${poolDir(poolId)}hashes/${sha256}`)
      return b ? dec.decode(b) : null
    },

    /** Image first, answer last: a photo only becomes playable once its answer exists. */
    async putPhoto(poolId: string, photoId: string, image: Uint8Array, answer: StoredAnswer) {
      await objects.put(photoKey(poolId, photoId, 'webp'), image, 'image/webp')
      await objects.put(`${poolDir(poolId)}hashes/${answer.sha256}`, enc.encode(photoId), 'text/plain')
      await store.putPhotoDay(poolId, photoId, answer.takenAt)
      await putJson(photoKey(poolId, photoId, 'json'), answer)
    },

    /** Day index marker, so a game can spread its photos across days with one listing. */
    putPhotoDay: (poolId: string, photoId: string, takenAt: string | null) =>
      objects.put(dayKey(poolId, photoId, takenAt), new Uint8Array(), 'application/octet-stream'),

    /** photoId -> day ("none" = undated) for every indexed photo. */
    async listPhotoDays(poolId: string): Promise<Map<string, string>> {
      const prefix = `${poolDir(poolId)}days/`
      const days = new Map<string, string>()
      for (const k of await objects.list(prefix)) {
        const [day, photoId] = k.slice(prefix.length).split('/')
        if (day && photoId && isPhotoId(photoId)) days.set(photoId, day)
      }
      return days
    },

    getImage: (poolId: string, photoId: string) => objects.get(photoKey(poolId, photoId, 'webp')),
    getAnswer: (poolId: string, photoId: string) => getJson<StoredAnswer>(photoKey(poolId, photoId, 'json')),
    putAnswer: (poolId: string, photoId: string, answer: StoredAnswer) => putJson(photoKey(poolId, photoId, 'json'), answer),

    async deletePhoto(poolId: string, photoId: string) {
      const answer = await store.getAnswer(poolId, photoId)
      await objects.delete([
        photoKey(poolId, photoId, 'json'),
        photoKey(poolId, photoId, 'webp'),
        ...(answer ? [`${poolDir(poolId)}hashes/${answer.sha256}`, dayKey(poolId, photoId, answer.takenAt)] : []),
      ])
      return answer !== null
    },

    /** Deletes everything belonging to a pool, including its entries in the key index. */
    async deletePool(pool: PoolRecord) {
      // Key index first so the keys stop working even if the rest is interrupted.
      await objects.delete([`keys/${pool.keyHash}.json`])
      const keys = await objects.list(poolDir(pool.poolId))
      for (let i = 0; i < keys.length; i += 1000) await objects.delete(keys.slice(i, i + 1000))
    },

    /** Deletes every expired pool (see expiry.ts). Returns how many were removed. */
    async sweepExpired(now: number = Date.now()) {
      let removed = 0
      for (const pool of await store.listPools()) {
        if (isExpired(pool, await store.hasPhotos(pool.poolId), now)) {
          await store.deletePool(pool)
          removed++
        }
      }
      return removed
    },
  }
  return store
}

export type PoolStore = ReturnType<typeof createPoolStore>
