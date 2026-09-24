/**
 * Minimal object storage the pool layout is written against. Adapters: MemoryObjects (tests,
 * offline dev), S3 R2 (Render server, server/r2.ts), R2 binding (sweeper Worker).
 * Deliberately free of Node APIs so the sweeper Worker can bundle it.
 */
export interface ObjectStore {
  get(key: string): Promise<Uint8Array | null>
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  delete(keys: string[]): Promise<void>
  /** All object keys under a prefix. */
  list(prefix: string): Promise<string[]>
  /** Immediate "sub-folders" under a prefix, e.g. list pools/ -> ["pools/<id>/", ...]. */
  listPrefixes(prefix: string): Promise<string[]>
  /** True if at least one object exists under the prefix (asks the store for a single item). */
  any(prefix: string): Promise<boolean>
}

export class MemoryObjects implements ObjectStore {
  private readonly data = new Map<string, Uint8Array>()

  async get(key: string) {
    return this.data.get(key) ?? null
  }
  async put(key: string, body: Uint8Array) {
    this.data.set(key, body)
  }
  async delete(keys: string[]) {
    for (const k of keys) this.data.delete(k)
  }
  async list(prefix: string) {
    return this.keys().filter((k) => k.startsWith(prefix))
  }
  async any(prefix: string) {
    for (const k of this.data.keys()) if (k.startsWith(prefix)) return true
    return false
  }
  async listPrefixes(prefix: string) {
    const out = new Set<string>()
    for (const k of await this.list(prefix)) {
      const slash = k.indexOf('/', prefix.length)
      if (slash !== -1) out.add(k.slice(0, slash + 1))
    }
    return [...out].sort()
  }

  /** Test helpers. */
  keys() {
    return [...this.data.keys()].sort()
  }
  dump() {
    const dec = new TextDecoder()
    return [...this.data].map(([k, v]) => `${k}\n${dec.decode(v)}`).join('\n')
  }
}
