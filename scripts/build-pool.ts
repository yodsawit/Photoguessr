/**
 * Builds the static photo pool from raw photos in `photos/`.
 *
 * For each photo: read GPS + capture date from EXIF, convert HEIC to JPEG, resize, strip ALL
 * metadata (served images must never leak GPS), reverse-geocode district/province via
 * Nominatim, then write `public/pool/<id>.jpg` and `server/data/pool.json`.
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import exifr from 'exifr'
import sharp from 'sharp'
import heicConvert from 'heic-convert'
import type { PoolPhoto } from '../src/game/types.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC_DIR = path.join(ROOT, 'photos')
const OUT_DIR = path.join(ROOT, 'public', 'pool')
const POOL_JSON = path.join(ROOT, 'server', 'data', 'pool.json')
const CACHE_JSON = path.join(ROOT, 'scripts', '.geocache.json')
const MAX_EDGE = 2000
const SUPPORTED = new Set(['.heic', '.heif', '.jpg', '.jpeg', '.png'])
const USER_AGENT = 'PhotoGuessr/0.1 (personal photo game; build-time reverse geocoding)'

type Place = { district: string; province: string }
type GeoCache = Record<string, Place>

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function slugify(name: string): string {
  return name.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** EXIF "2024:09:28 11:10:56" + "+07:00" -> "2024-09-28T11:10:56+07:00" (keeps the photo's local time). */
function toIsoWithOffset(dt: string, offset?: string): string {
  const [d, t] = dt.trim().split(' ')
  return `${d.replaceAll(':', '-')}T${t}${offset ?? ''}`
}

/** Drops the generic English suffixes Nominatim appends, e.g. "Mueang Chiang Mai District". */
function cleanName(s: string | undefined): string {
  return (s ?? '').replace(/\s+(District|Province|Subdistrict)$/i, '').trim()
}

async function reverseGeocode(lat: number, lng: number, cache: GeoCache): Promise<Place> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`
  if (cache[key]) return cache[key]
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.search = new URLSearchParams({
    lat: String(lat), lon: String(lng), format: 'jsonv2', zoom: '14', 'accept-language': 'en',
  }).toString()
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`Nominatim ${res.status} for ${key}`)
  const { address = {} } = (await res.json()) as { address?: Record<string, string> }
  const place: Place = {
    district: cleanName(address.county ?? address.city_district ?? address.district ?? address.city ?? address.town ?? address.municipality),
    province: cleanName(address.state ?? address.province ?? address.region),
  }
  cache[key] = place
  await sleep(1100) // Nominatim usage policy: max 1 request/second
  return place
}

async function toJpeg(file: string, ext: string): Promise<Buffer> {
  const raw = await readFile(file)
  const decodable = ext === '.heic' || ext === '.heif'
    ? Buffer.from(await heicConvert({ buffer: raw, format: 'JPEG', quality: 1 }))
    : raw
  // sharp drops all metadata unless .withMetadata() is called; .rotate() bakes in EXIF orientation first.
  return sharp(decodable)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer()
}

async function main() {
  if (!existsSync(SRC_DIR)) throw new Error(`Missing ${SRC_DIR}`)
  await mkdir(OUT_DIR, { recursive: true })
  await mkdir(path.dirname(POOL_JSON), { recursive: true })
  const cache: GeoCache = existsSync(CACHE_JSON) ? JSON.parse(await readFile(CACHE_JSON, 'utf8')) : {}

  const files = (await readdir(SRC_DIR)).filter((f) => SUPPORTED.has(path.extname(f).toLowerCase())).sort()
  const pool: PoolPhoto[] = []

  for (const name of files) {
    const file = path.join(SRC_DIR, name)
    const ext = path.extname(name).toLowerCase()
    const id = slugify(name)

    const gps = await exifr.gps(file).catch(() => undefined)
    if (!gps || !Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude)) {
      console.warn(`skip ${name}: no GPS in EXIF`)
      continue
    }
    const tags = await exifr.parse(file, {
      reviveValues: false,
      pick: ['DateTimeOriginal', 'OffsetTimeOriginal', 'CreateDate'],
    })
    const dt: string | undefined = tags?.DateTimeOriginal ?? tags?.CreateDate
    if (!dt) console.warn(`${name}: no capture date in EXIF`)

    const jpeg = await toJpeg(file, ext)
    const { width = 0, height = 0 } = await sharp(jpeg).metadata()
    await writeFile(path.join(OUT_DIR, `${id}.jpg`), jpeg)

    const place = await reverseGeocode(gps.latitude, gps.longitude, cache)
    pool.push({
      id,
      src: `/pool/${id}.jpg`,
      lat: gps.latitude,
      lng: gps.longitude,
      takenAt: dt ? toIsoWithOffset(dt, tags?.OffsetTimeOriginal) : null,
      district: place.district,
      province: place.province,
      width,
      height,
    })
    console.log(`ok   ${name} -> ${id}.jpg (${width}x${height}) ${place.district}, ${place.province}`)
  }

  await writeFile(POOL_JSON, JSON.stringify(pool, null, 2) + '\n')
  await writeFile(CACHE_JSON, JSON.stringify(cache, null, 2) + '\n')
  console.log(`wrote ${pool.length} photo(s) to server/data/pool.json`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
