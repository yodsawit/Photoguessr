/**
 * Reverse geocoding via OpenStreetMap Nominatim (English names). Lookups run strictly one at a
 * time and at most once per `minIntervalMs` (Nominatim policy: 1 req/s), so several phones
 * uploading at once just queue. Only coordinates are sent; results are cached in memory.
 */
export type Place = { district: string; province: string }

type Options = {
  userAgent: string
  minIntervalMs?: number
  fetch?: (url: URL, init: RequestInit) => Promise<Response>
}

/** Drops the generic English suffixes Nominatim appends, e.g. "Mueang Chiang Mai District". */
export function cleanName(s: string | undefined): string {
  return (s ?? '').replace(/\s+(District|Province|Subdistrict)$/i, '').trim()
}

export function createGeocoder({ userAgent, minIntervalMs = 1100, fetch: doFetch = fetch }: Options) {
  const cache = new Map<string, Place>()
  let chain: Promise<unknown> = Promise.resolve()
  let lastStart = -Infinity

  async function request(lat: number, lng: number): Promise<Place | null> {
    const wait = lastStart + minIntervalMs - performance.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastStart = performance.now()
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse')
      url.search = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2', zoom: '14', 'accept-language': 'en' }).toString()
      const res = await doFetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(10_000) })
      if (!res.ok) return null
      const { address = {} } = (await res.json()) as { address?: Record<string, string> }
      return {
        district: cleanName(address.county ?? address.city_district ?? address.district ?? address.city ?? address.town ?? address.municipality),
        province: cleanName(address.state ?? address.province ?? address.region),
      }
    } catch {
      return null
    }
  }

  return {
    /** Never throws; null means "unknown for now" (caller may retry later). */
    lookup(lat: number, lng: number): Promise<Place | null> {
      const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
      const hit = cache.get(key)
      if (hit) return Promise.resolve(hit)
      const next = chain.then(async () => {
        const again = cache.get(key)
        if (again) return again
        const place = await request(lat, lng)
        if (place) cache.set(key, place)
        return place
      })
      chain = next.catch(() => undefined)
      return next
    },
  }
}

export type Geocoder = ReturnType<typeof createGeocoder>
