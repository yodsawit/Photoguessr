import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { INACTIVITY_MS, isExpired } from './expiry'
import { MemoryObjects } from './objects'
import { createPoolStore } from './poolStore'
import { generateKey, hashKey, normalizeKey, PoolService } from './pools'

const PEPPER = 'test-pepper-0123456789'
const T0 = Date.parse('2026-09-24T00:00:00Z')

function setup(start = T0) {
  let now = start
  const objects = new MemoryObjects()
  const store = createPoolStore(objects)
  const pools = new PoolService(store, PEPPER, () => now)
  return { objects, store, pools, advance: (ms: number) => (now += ms) }
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

describe('PoolService', () => {
  it('creates a pool with two different keys and stores only hashes', async () => {
    const { pools, objects } = setup()
    const { uploadKey, playKey } = await pools.createPool()
    expect(uploadKey).not.toBe(playKey)
    const dump = objects.dump()
    expect(dump).not.toContain(uploadKey)
    expect(dump).not.toContain(playKey)
  })

  it('authenticates each key only for its own role, case-insensitively', async () => {
    const { pools } = setup()
    const a = await pools.createPool()
    expect((await pools.authenticate(a.uploadKey.toLowerCase(), 'upload')).poolId).toBeTruthy()
    expect((await pools.authenticate(a.playKey, 'play')).poolId).toBeTruthy()
    await expect(pools.authenticate(a.uploadKey, 'play')).rejects.toMatchObject({ status: 401 })
    await expect(pools.authenticate(a.playKey, 'upload')).rejects.toMatchObject({ status: 401 })
    await expect(pools.authenticate('ZZZZZZ', 'play')).rejects.toMatchObject({ status: 401 })
    await expect(pools.authenticate('bad', 'play')).rejects.toMatchObject({ status: 401 })
  })

  it('keeps pools separate', async () => {
    const { pools } = setup()
    const a = await pools.createPool()
    const b = await pools.createPool()
    const pa = await pools.authenticate(a.playKey, 'play')
    const pb = await pools.authenticate(b.playKey, 'play')
    expect(pa.poolId).not.toBe(pb.poolId)
  })

  it('records activity on every authenticated request', async () => {
    const { pools, store, advance } = setup()
    const { playKey } = await pools.createPool()
    advance(60_000)
    const p = await pools.authenticate(playKey, 'play')
    expect((await store.getPool(p.poolId))!.lastActivityAt).toBe(new Date(T0 + 60_000).toISOString())
    advance(1_000)
    await pools.authenticate(playKey, 'play')
    expect((await store.getPool(p.poolId))!.lastActivityAt).toBe(new Date(T0 + 61_000).toISOString())
  })

  it('deletes a pool inactive for more than 3 days on access', async () => {
    const { pools, objects, advance } = setup()
    const { playKey, uploadKey } = await pools.createPool()
    advance(INACTIVITY_MS + 1_000)
    await expect(pools.authenticate(playKey, 'play')).rejects.toMatchObject({ status: 404 })
    await expect(pools.authenticate(uploadKey, 'upload')).rejects.toMatchObject({ status: 401 })
    expect(objects.keys()).toEqual([])
  })
})

describe('expiry + pool store', () => {
  it('isExpired is strictly after 72 h of inactivity', () => {
    const last = new Date(T0).toISOString()
    expect(isExpired(last, T0 + INACTIVITY_MS)).toBe(false)
    expect(isExpired(last, T0 + INACTIVITY_MS + 1)).toBe(true)
  })

  it('deletePool removes photos, answers, dedup index and key index; other pools untouched', async () => {
    const { pools, store, objects } = setup()
    const a = await pools.createPool()
    const b = await pools.createPool()
    const pa = await pools.authenticate(a.uploadKey, 'upload')
    const pb = await pools.authenticate(b.uploadKey, 'upload')
    const answer = { lat: 1, lng: 2, takenAt: null, district: '', province: '', width: 3, height: 4, sha256: 'ab', uploadedAt: 'x' }
    await store.putPhoto(pa.poolId, '00000000-0000-4000-8000-000000000001', new Uint8Array([1]), answer)
    await store.putPhoto(pb.poolId, '00000000-0000-4000-8000-000000000002', new Uint8Array([2]), answer)
    await store.deletePool(pa)
    expect(objects.keys().some((k) => k.includes(pa.poolId))).toBe(false)
    expect(await store.listPhotoIds(pb.poolId)).toEqual(['00000000-0000-4000-8000-000000000002'])
    expect((await store.listPools()).map((p) => p.poolId)).toEqual([pb.poolId])
    await expect(pools.authenticate(a.playKey, 'play')).rejects.toMatchObject({ status: 401 })
  })

  it('sweepExpired deletes only inactive pools', async () => {
    const { pools, store, advance } = setup()
    const old = await pools.createPool()
    advance(INACTIVITY_MS - 1_000)
    const fresh = await pools.createPool()
    advance(2_000)
    const removed = await store.sweepExpired(T0 + INACTIVITY_MS + 1_000)
    expect(removed).toBe(1)
    await expect(pools.authenticate(old.playKey, 'play')).rejects.toMatchObject({ status: 401 })
    expect((await pools.authenticate(fresh.playKey, 'play')).poolId).toBeTruthy()
  })
})
