import { describe, expect, it } from 'vitest'
import { INACTIVITY_MS } from '../server/expiry'
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
    async list({ prefix = '', delimiter, cursor }) {
      const all = [...data.keys()].filter((k) => k.startsWith(prefix)).sort()
      const items = delimiter
        ? [...new Set(all.map((k) => (k.indexOf(delimiter, prefix.length) === -1 ? k : k.slice(0, k.indexOf(delimiter, prefix.length) + 1))))]
        : all
      const start = cursor ? Number(cursor) : 0
      const page = items.slice(start, start + 2)
      const truncated = start + 2 < items.length
      return {
        objects: page.filter((k) => !k.endsWith('/')).map((key) => ({ key })),
        delimitedPrefixes: page.filter((k) => k.endsWith('/')),
        truncated,
        cursor: truncated ? String(start + 2) : undefined,
      }
    },
  }
}

describe('sweeper worker', () => {
  it('deletes only pools inactive > 3 days, through the R2 binding (paginated)', async () => {
    const bucket = fakeBucket()
    const store = createPoolStore(r2BindingObjects(bucket))
    const longAgo = Date.now() - INACTIVITY_MS - 60_000
    const oldPools = new PoolService(store, 'test-pepper-0123456789', () => longAgo)
    const fresh = new PoolService(store, 'test-pepper-0123456789')
    for (let i = 0; i < 3; i++) await oldPools.createPool()
    const keep = await fresh.createPool()
    const keepPool = await fresh.authenticate(keep.uploadKey, 'upload')

    await worker.scheduled(null, { BUCKET: bucket })

    const left = await store.listPools()
    expect(left.map((p) => p.poolId)).toEqual([keepPool.poolId])
    expect(bucket.size()).toBe(3) // keep's pool.json + its two key-index entries
  })

  it('has no public HTTP surface', async () => {
    expect((await worker.fetch()).status).toBe(404)
  })
})
