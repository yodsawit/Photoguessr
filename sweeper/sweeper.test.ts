import { describe, expect, it } from 'vitest'
import { EMPTY_MS, INACTIVITY_MS } from '../server/expiry'
import { createPoolStore } from '../server/poolStore'
import { PoolService } from '../server/pools'
import { r2BindingObjects, type R2BucketLike } from './r2binding'
import worker from './worker'

/** In-memory fake of the Workers R2 binding, with small pages to exercise pagination. */
function fakeBucket(): R2BucketLike & { size: () => number } {
  const data = new Map<string, Uint8Array>()
  return {
    size: () => data.size,
    async get(key) {
      const v = data.get(key)
      return v ? { arrayBuffer: async () => v.slice().buffer } : null
    },
    async put(key, value) {
      data.set(key, value)
    },
    async delete(keys) {
      for (const k of [keys].flat()) data.delete(k)
    },
    async list({ prefix = '', delimiter, cursor, limit = 2 }) {
      const all = [...data.keys()].filter((k) => k.startsWith(prefix)).sort()
      const items = delimiter
        ? [...new Set(all.map((k) => (k.indexOf(delimiter, prefix.length) === -1 ? k : k.slice(0, k.indexOf(delimiter, prefix.length) + 1))))]
        : all
      const start = cursor ? Number(cursor) : 0
      const page = items.slice(start, start + limit)
      const truncated = start + limit < items.length
      return {
        objects: page.filter((k) => !k.endsWith('/')).map((key) => ({ key })),
        delimitedPrefixes: page.filter((k) => k.endsWith('/')),
        truncated,
        cursor: truncated ? String(start + limit) : undefined,
      }
    },
  }
}

describe('sweeper worker', () => {
  it('deletes old empty pools and inactive full pools through the R2 binding (paginated); keeps the rest', async () => {
    const bucket = fakeBucket()
    const store = createPoolStore(r2BindingObjects(bucket))
    const photo = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
    const answer = (sha: string) => ({ lat: 1, lng: 2, takenAt: null, district: '', province: '', width: 1, height: 1, sha256: sha, uploadedAt: 'x' })
    const addPhoto = async (svc: PoolService, key: string, n: number) => {
      const { pool } = await svc.authenticate(key)
      await store.putPhoto(pool.poolId, photo(n), new Uint8Array([n]), answer(`s${n}`))
      await svc.markHasPhotos(pool)
      return pool
    }

    const longAgo = Date.now() - INACTIVITY_MS - 60_000
    const old = new PoolService(store, 'test-pepper-0123456789', () => longAgo)
    const recent = new PoolService(store, 'test-pepper-0123456789', () => Date.now() - EMPTY_MS - 60_000)
    const fresh = new PoolService(store, 'test-pepper-0123456789')

    const oldFull = await old.createPool()
    await addPhoto(old, oldFull.key, 1)
    await recent.createPool() // empty for > 1 h
    const keepEmpty = await fresh.createPool() // empty for ~0 min
    const keepFull = await fresh.createPool()
    const keepFullPool = await addPhoto(fresh, keepFull.key, 2)

    await worker.scheduled(null, { BUCKET: bucket })

    const left = (await store.listPools()).map((p) => p.poolId).sort()
    expect(left).toEqual([keepEmpty.poolId, keepFullPool.poolId].sort())
    expect(await store.hasPhotos(keepFullPool.poolId)).toBe(true)
  })

  it('has no public HTTP surface', async () => {
    expect((await worker.fetch()).status).toBe(404)
  })
})
