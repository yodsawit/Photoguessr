/** ObjectStore over a Workers R2 binding (the sweeper runs inside Cloudflare, next to the bucket). */
import type { ObjectStore } from '../server/objects'

/** The subset of the Workers `R2Bucket` API used here (avoids pulling in @cloudflare/workers-types). */
export interface R2BucketLike {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  delete(keys: string | string[]): Promise<void>
  list(options: { prefix?: string; delimiter?: string; cursor?: string; limit?: number }): Promise<{
    objects: { key: string }[]
    delimitedPrefixes: string[]
    truncated: boolean
    cursor?: string
  }>
}

export function r2BindingObjects(bucket: R2BucketLike): ObjectStore {
  async function listAll(prefix: string, delimiter?: string) {
    const keys: string[] = []
    const prefixes: string[] = []
    let cursor: string | undefined
    for (;;) {
      const page = await bucket.list({ prefix, delimiter, cursor })
      keys.push(...page.objects.map((o) => o.key))
      prefixes.push(...page.delimitedPrefixes)
      if (!page.truncated) break
      cursor = page.cursor
    }
    return { keys, prefixes }
  }

  return {
    async get(key) {
      const obj = await bucket.get(key)
      return obj ? new Uint8Array(await obj.arrayBuffer()) : null
    },
    async put(key, body, contentType) {
      await bucket.put(key, body, { httpMetadata: { contentType } })
    },
    async delete(keys) {
      for (let i = 0; i < keys.length; i += 1000) if (keys.slice(i, i + 1000).length) await bucket.delete(keys.slice(i, i + 1000))
    },
    any: async (prefix) => (await bucket.list({ prefix, limit: 1 })).objects.length > 0,
    list: async (prefix) => (await listAll(prefix)).keys,
    listPrefixes: async (prefix) => (await listAll(prefix, '/')).prefixes,
  }
}
