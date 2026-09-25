import exifr from 'exifr'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { createGeocoder } from './geocode'
import { createLimiter, processUpload } from './ingest'

/** A 3000x4000 JPEG carrying GPS + date EXIF, like a raw phone photo. */
async function jpegWithGps() {
  return new Uint8Array(
    await sharp({ create: { width: 3000, height: 4000, channels: 3, background: { r: 200, g: 150, b: 100 } } })
      .jpeg()
      .withExif({
        IFD0: { Make: 'Apple', Model: 'iPhone' },
        IFD2: { DateTimeOriginal: '2024:09:28 11:10:56', OffsetTimeOriginal: '+07:00' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '18/1 48/1 653/100', GPSLongitudeRef: 'E', GPSLongitude: '98/1 58/1 206/100' },
      })
      .toBuffer(),
  )
}

describe('processUpload', () => {
  it('re-encodes to metadata-free WebP with longest side <= 1920', async () => {
    const input = await jpegWithGps()
    expect((await exifr.gps(Buffer.from(input)))?.latitude).toBeCloseTo(18.8018, 3) // precondition

    const out = await processUpload(input, { lat: '18.8018', lng: '98.9672', takenAt: '2024-09-28T11:10:56+07:00' })
    const meta = await sharp(out.image).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.exif).toBeUndefined()
    expect(meta.icc).toBeUndefined()
    expect(meta.xmp).toBeUndefined()
    expect(Math.max(out.width, out.height)).toBe(1920)
    expect([out.width, out.height]).toEqual([1440, 1920])
    expect(out).toMatchObject({ lat: 18.8018, lng: 98.9672, takenAt: '2024-09-28T11:10:56+07:00' })
  })

  it('falls back to EXIF GPS/date when fields are missing (computer uploads)', async () => {
    const out = await processUpload(await jpegWithGps(), {})
    expect(out.lat).toBeCloseTo(18.8018, 3)
    expect(out.lng).toBeCloseTo(98.9672, 3)
    expect(out.takenAt).toBe('2024-09-28T11:10:56+07:00')
  })

  it('gives identical uploads the same hash for dedup', async () => {
    const input = await jpegWithGps()
    const a = await processUpload(input, { lat: 1, lng: 2 })
    const b = await processUpload(input, { lat: 1, lng: 2 })
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(a.sha256).toBe(b.sha256)
  })

  it('rejects bad coordinates, dates and non-images', async () => {
    const input = await jpegWithGps()
    const bad = [
      { lat: '91', lng: '0' },
      { lat: '0', lng: '181' },
      { lat: 'abc', lng: '1' },
      { lat: '1', lng: '1', takenAt: 'yesterday' },
    ]
    for (const f of bad) await expect(processUpload(input, f)).rejects.toMatchObject({ status: 400 })
    await expect(processUpload(new TextEncoder().encode('not an image'), { lat: 1, lng: 2 })).rejects.toMatchObject({ status: 415 })
    const noGps = new Uint8Array(await sharp({ create: { width: 10, height: 10, channels: 3, background: 'white' } }).jpeg().toBuffer())
    await expect(processUpload(noGps, {})).rejects.toMatchObject({ status: 400 })
  })
})

describe('geocoder', () => {
  const reply = (address: Record<string, string>) => new Response(JSON.stringify({ address }), { status: 200 })

  it('extracts district/province (English, suffixes trimmed) and caches', async () => {
    let calls = 0
    const geo = createGeocoder({
      userAgent: 'test',
      minIntervalMs: 0,
      fetch: async (url) => {
        calls++
        expect(String(url)).toContain('accept-language=en')
        return reply({ county: 'Mueang Chiang Mai District', state: 'Chiang Mai Province' })
      },
    })
    expect(await geo.lookup(18.8018, 98.9672)).toEqual({ district: 'Mueang Chiang Mai', province: 'Chiang Mai' })
    expect(await geo.lookup(18.80181, 98.96722)).toEqual({ district: 'Mueang Chiang Mai', province: 'Chiang Mai' })
    expect(calls).toBe(1)
  })

  it('returns null on failure instead of throwing', async () => {
    const geo = createGeocoder({ userAgent: 't', minIntervalMs: 0, fetch: async () => new Response('', { status: 503 }) })
    expect(await geo.lookup(1, 2)).toBeNull()
  })

  it('runs lookups one at a time, spaced by minIntervalMs', async () => {
    const starts: number[] = []
    const geo = createGeocoder({
      userAgent: 't',
      minIntervalMs: 40,
      fetch: async () => {
        starts.push(performance.now())
        return reply({ state: 'X' })
      },
    })
    await Promise.all([geo.lookup(1, 1), geo.lookup(2, 2), geo.lookup(3, 3)])
    expect(starts).toHaveLength(3)
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(35)
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(35)
  })
})

describe('upload filtering', () => {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0])
  const pdf = new TextEncoder().encode('%PDF-1.7 hello')

  it('refuses anything that is not a photo by its bytes (415), before decoding', async () => {
    for (const bad of [svg, gif, pdf, new TextEncoder().encode('just text')]) {
      await expect(processUpload(bad, { lat: 1, lng: 2 })).rejects.toMatchObject({ status: 415 })
    }
  })

  it('refuses images above the pixel limit (decompression bombs)', async () => {
    const big = new Uint8Array(await sharp({ create: { width: 2000, height: 2000, channels: 3, background: 'white' } }).png().toBuffer())
    await expect(processUpload(big, { lat: 1, lng: 2 }, { limitInputPixels: 1_000_000 })).rejects.toMatchObject({ status: 413 })
    const ok = await processUpload(big, { lat: 1, lng: 2 }, { limitInputPixels: 5_000_000 })
    expect(Math.max(ok.width, ok.height)).toBe(1920)
  })

  it('accepts a real original iPhone HEIC with GPS and strips everything', async () => {
    const { readFile } = await import('node:fs/promises')
    const heic = await readFile('photos/IMG_0901.HEIC').catch(() => null)
    if (!heic) return // original not present in CI checkouts (photos/ is gitignored)
    const out = await processUpload(new Uint8Array(heic), {})
    expect(out.lat).toBeCloseTo(18.8018, 3)
    expect(out.takenAt).toBe('2024-09-28T11:10:56+07:00')
    expect((await sharp(out.image).metadata()).exif).toBeUndefined()
  }, 60_000)

  it('runs at most 2 photo jobs at once', async () => {
    const limit = createLimiter(2)
    let running = 0
    let peak = 0
    const job = () =>
      limit(async () => {
        running++
        peak = Math.max(peak, running)
        await new Promise((r) => setTimeout(r, 15))
        running--
      })
    await Promise.all(Array.from({ length: 7 }, job))
    expect(peak).toBe(2)
  })
})
