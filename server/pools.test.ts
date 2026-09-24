import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { EMPTY_MS, expiresAt, INACTIVITY_MS, isExpired } from './expiry'
import { MemoryObjects } from './objects'
import { createPoolStore, type StoredAnswer } from './poolStore'
import { generateKey, hashKey, normalizeKey, PoolService } from './pools'

const PEPPER = 'test-pepper-0123456789'
const T0 = Date.parse('2026-09-24T00:00:00Z')
const MIN = 60_000
const PHOTO_A = '00000000-0000-4000-8000-00000000000a'
const PHOTO_B = '00000000-0000-4000-8000-00000000000b'
const answer = (sha: string): StoredAnswer => ({ lat: 1, lng: 2, takenAt: null, district: '', province: '', width: 3, height: 4, sha256: sha, uploadedAt: 'x' })

function setup(start = T0) {
  let now = start
  const objects = new MemoryObjects()
  const store = createPoolStore(objects)
  const pools = new PoolService(store, PEPPER, () => now)
  /** Stores a photo the way the upload route does. */
  const addPhoto = async (key: string, photoId = PHOTO_A) => {
    const { pool } = await pools.authenticate(key)
    await store.putPhoto(pool.poolId, photoId, new Uint8Array([1]), answer(photoId))
    await pools.markHasPhotos(pool)
    return pool
  }
  const removePhoto = async (key: string, photoId = PHOTO_A) => {
    const { pool } = await pools.authenticate(key)
    await store.deletePhoto(pool.poolId, photoId)
    await pools.markMaybeEmpty(pool)
  }
  return { objects, store, pools, addPhoto, removePhoto, advance: (ms: number) => (now += ms) }
}

describe('keys', () => {
  it('are 6 chars of A-Z0-9', () => {
    for (let i = 0; i < 200; i++) expect(generateKey()).toMatch(/^[A-Z0-9]{6}$/)
  })
  it('normalize case-insensitively and reject bad formats', () => {
    expect(normalizeKey(' 7k2qxa ')).toBe('7K2QXA')
    for (const bad of ['', '7K2QX', '7K2QXAB', '7K2-XA', 'ÄK2QXA', null, 42]) expect(normalizeKey(bad)).toBeNull()
  })
  it('are hashed with the server pepper, not plain SHA-256', () => {
    const h = hashKey('7K2QXA', PEPPER)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toBe(createHash('sha256').update('7K2QXA').digest('hex'))
    expect(h).not.toBe(hashKey('7K2QXA', 'other-pepper'))
  })
})

describe('PoolService (one key per pool)', () => {
  it('creates a pool with one key and stores only its hash', async () => {
    const { pools, objects } = setup()
    const { key } = await pools.createPool()
    expect(key).toMatch(/^[A-Z0-9]{6}$/)
    expect(objects.dump()).not.toContain(key)
    expect(objects.keys().filter((k) => k.startsWith('keys/'))).toHaveLength(1)
  })

  it('authenticates the key case-insensitively; wrong keys get 401', async () => {
    const { pools } = setup()
    const { key } = await pools.createPool()
    expect((await pools.authenticate(key.toLowerCase())).pool.poolId).toBeTruthy()
    await expect(pools.authenticate('ZZZZZZ')).rejects.toMatchObject({ status: 401 })
    await expect(pools.authenticate('bad')).rejects.toMatchObject({ status: 401 })
  })

  it('keeps pools separate', async () => {
    const { pools } = setup()
    const a = await pools.createPool()
    const b = await pools.createPool()
    expect((await pools.authenticate(a.key)).pool.poolId).not.toBe((await pools.authenticate(b.key)).pool.poolId)
  })

  it('records activity on every request', async () => {
    const { pools, store, advance } = setup()
    const { key } = await pools.createPool()
    advance(MIN)
    const { pool } = await pools.authenticate(key)
    expect((await store.getPool(pool.poolId))!.lastActivityAt).toBe(new Date(T0 + MIN).toISOString())
  })
})

describe('empty pools expire 1 h after becoming empty', () => {
  it('is alive at 59 min and deleted at 61 min after creation', async () => {
    const { pools, objects, advance } = setup()
    const { key } = await pools.createPool()
    advance(59 * MIN)
    expect((await pools.authenticate(key)).hasPhotos).toBe(false)
    advance(2 * MIN)
    await expect(pools.authenticate(key)).rejects.toMatchObject({ status: 404 })
    expect(objects.keys()).toEqual([])
  })

  it('visiting an empty pool does not extend it', async () => {
    const { pools, advance } = setup()
    const { key } = await pools.createPool()
    for (let i = 0; i < 6; i++) {
      advance(10 * MIN)
      await pools.authenticate(key)
    }
    advance(1 * MIN) // 61 min after creation, visited every 10 min
    await expect(pools.authenticate(key)).rejects.toMatchObject({ status: 404 })
  })

  it('the first photo switches the pool to the 72 h inactivity rule', async () => {
    const { pools, addPhoto, advance } = setup()
    const { key } = await pools.createPool()
    advance(50 * MIN)
    await addPhoto(key)
    advance(INACTIVITY_MS - MIN)
    const { hasPhotos } = await pools.authenticate(key)
    expect(hasPhotos).toBe(true)
    advance(INACTIVITY_MS + MIN)
    await expect(pools.authenticate(key)).rejects.toMatchObject({ status: 404 })
  })

  it('deleting the last photo restarts the 1 h clock', async () => {
    const { pools, addPhoto, removePhoto, advance } = setup()
    const { key } = await pools.createPool()
    await addPhoto(key)
    advance(5 * 60 * MIN) // 5 h later: fine, it has a photo
    await removePhoto(key)
    advance(59 * MIN)
    expect((await pools.authenticate(key)).hasPhotos).toBe(false)
    advance(2 * MIN)
    await expect(pools.authenticate(key)).rejects.toMatchObject({ status: 404 })
  })

  it('deleting one of two photos keeps the pool non-empty', async () => {
    const { pools, addPhoto, removePhoto, advance } = setup()
    const { key } = await pools.createPool()
    await Promise.all([addPhoto(key, PHOTO_A), addPhoto(key, PHOTO_B)])
    await removePhoto(key, PHOTO_A)
    advance(2 * 60 * MIN)
    expect((await pools.authenticate(key)).hasPhotos).toBe(true)
  })
})

describe('expiry helpers + store', () => {
  const base = { createdAt: new Date(T0).toISOString(), lastActivityAt: new Date(T0).toISOString(), emptySince: new Date(T0).toISOString() }

  it('uses 72 h of inactivity with photos, 1 h since empty without', () => {
    expect(isExpired(base, true, T0 + INACTIVITY_MS)).toBe(false)
    expect(isExpired(base, true, T0 + INACTIVITY_MS + 1)).toBe(true)
    expect(isExpired(base, false, T0 + EMPTY_MS)).toBe(false)
    expect(isExpired(base, false, T0 + EMPTY_MS + 1)).toBe(true)
    expect(expiresAt(base, false)).toBe(new Date(T0 + EMPTY_MS).toISOString())
  })

  it('a missing emptySince falls back to last activity (never deletes early)', () => {
    const racy = { ...base, emptySince: null, lastActivityAt: new Date(T0 + 30 * MIN).toISOString() }
    expect(isExpired(racy, false, T0 + 80 * MIN)).toBe(false)
    expect(isExpired(racy, false, T0 + 91 * MIN)).toBe(true)
  })

  it('deletePool removes photos, answers, dedup index and key; other pools untouched', async () => {
    const { pools, store, objects, addPhoto } = setup()
    const a = await pools.createPool()
    const b = await pools.createPool()
    const pa = await addPhoto(a.key, PHOTO_A)
    const pb = await addPhoto(b.key, PHOTO_B)
    await store.deletePool(pa)
    expect(objects.keys().some((k) => k.includes(pa.poolId))).toBe(false)
    expect(await store.listPhotoIds(pb.poolId)).toEqual([PHOTO_B])
    await expect(pools.authenticate(a.key)).rejects.toMatchObject({ status: 401 })
  })

  it('sweepExpired removes an old empty pool and an inactive full pool; keeps the rest', async () => {
    const { pools, store, addPhoto, advance } = setup()
    const emptyOld = await pools.createPool()
    const fullOld = await pools.createPool()
    await addPhoto(fullOld.key)
    advance(INACTIVITY_MS - 30 * MIN)
    const emptyNew = await pools.createPool()
    const fullActive = await pools.createPool()
    await addPhoto(fullActive.key)
    advance(31 * MIN)
    expect(await store.sweepExpired(T0 + INACTIVITY_MS + MIN)).toBe(2)
    await expect(pools.authenticate(emptyOld.key)).rejects.toMatchObject({ status: 401 })
    await expect(pools.authenticate(fullOld.key)).rejects.toMatchObject({ status: 401 })
    expect((await pools.authenticate(emptyNew.key)).hasPhotos).toBe(false)
    expect((await pools.authenticate(fullActive.key)).hasPhotos).toBe(true)
  })
})
