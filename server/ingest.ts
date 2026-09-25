/**
 * Turns an uploaded photo into what gets stored: a re-encoded WebP with NO metadata, plus the
 * answer fields. Whatever the phone sent (even an original with GPS EXIF), the stored image is
 * rebuilt from pixels only. Runs fully in memory; nothing touches the local disk.
 */
import { createHash } from 'node:crypto'
import exifr from 'exifr'
import heicConvert from 'heic-convert'
import sharp, { type OutputInfo } from 'sharp'
import { sniffImage } from '../src/game/imageType'
import { HttpError } from './errors'

export const MAX_EDGE = 1920
export const WEBP_QUALITY = 80
/** Larger images are refused before decoding (decompression-bomb guard). A 48 MP photo is fine. */
export const MAX_INPUT_PIXELS = 100_000_000

export type ProcessOptions = { limitInputPixels?: number }

/**
 * Tiny concurrency limiter: at most `max` jobs run at once, the rest wait in order.
 * Used server-wide so HEIC decoding can't exhaust memory when many uploads arrive together.
 */
export function createLimiter(max: number) {
  let active = 0
  const waiting: (() => void)[] = []
  return async function run<T>(job: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve))
    active++
    try {
      return await job()
    } finally {
      active--
      waiting.shift()?.()
    }
  }
}

export type UploadFields = { lat?: unknown; lng?: unknown; takenAt?: unknown }

export type ProcessedPhoto = {
  image: Uint8Array
  width: number
  height: number
  sha256: string
  lat: number
  lng: number
  takenAt: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/

function coord(v: unknown, limit: number): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  if (!Number.isFinite(n) || Math.abs(n) > limit) throw new HttpError(400, 'Invalid location')
  return n
}

/** EXIF "2024:09:28 11:10:56" + "+07:00" -> "2024-09-28T11:10:56+07:00" (the photo's local time). */
export function toIsoWithOffset(dt: string, offset?: string): string {
  const [d, t] = dt.trim().split(' ')
  return `${d.replaceAll(':', '-')}T${t}${offset ?? ''}`
}

export async function processUpload(bytes: Uint8Array, fields: UploadFields, options: ProcessOptions = {}): Promise<ProcessedPhoto> {
  const limitInputPixels = options.limitInputPixels ?? MAX_INPUT_PIXELS
  // 1) Only real photos, by magic bytes — before any parser or decoder touches the data.
  const kind = sniffImage(bytes)
  if (!kind) throw new HttpError(415, 'Only photos (JPEG, HEIC, PNG, WebP) are allowed')

  let lat = coord(fields.lat, 90)
  let lng = coord(fields.lng, 180)
  let takenAt: string | null = null
  if (fields.takenAt !== undefined && fields.takenAt !== null && fields.takenAt !== '') {
    const s = String(fields.takenAt).trim()
    if (!ISO_DATE.test(s) || Number.isNaN(Date.parse(s))) throw new HttpError(400, 'Invalid date')
    takenAt = s
  }

  const buf = Buffer.from(bytes)
  // Missing fields (e.g. uploads from a computer) fall back to the file's own EXIF.
  if (lat === undefined || lng === undefined || takenAt === null) {
    if (lat === undefined || lng === undefined) {
      const gps = await exifr.gps(buf).catch(() => undefined)
      if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
        lat = gps.latitude
        lng = gps.longitude
      }
    }
    const tags = await exifr
      .parse(buf, { reviveValues: false, pick: ['DateTimeOriginal', 'OffsetTimeOriginal', 'CreateDate'] })
      .catch(() => undefined)
    const dt: unknown = tags?.DateTimeOriginal ?? tags?.CreateDate
    if (takenAt === null && typeof dt === 'string') takenAt = toIsoWithOffset(dt, tags?.OffsetTimeOriginal)
  }
  if (lat === undefined || lng === undefined) throw new HttpError(400, 'Photo has no location')

  // 2) Refuse gigantic images from their header alone (works for HEIC too), before decoding.
  const meta = await sharp(buf, { limitInputPixels: false }).metadata().catch(() => null)
  if (!meta?.width || !meta?.height) throw new HttpError(415, 'Only photos (JPEG, HEIC, PNG, WebP) are allowed')
  if (meta.width * meta.height > limitInputPixels) throw new HttpError(413, 'Photo is too large (over 100 megapixels)')

  let decodable: Buffer = buf
  if (kind === 'heic') {
    try {
      decodable = Buffer.from(await heicConvert({ buffer: buf, format: 'JPEG', quality: 1 }))
    } catch {
      throw new HttpError(400, 'Unsupported image')
    }
  }

  let out: { data: Buffer; info: OutputInfo }
  try {
    // .rotate() bakes EXIF orientation into pixels; sharp drops all metadata unless asked to keep it.
    out = await sharp(decodable, { limitInputPixels })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true })
  } catch {
    throw new HttpError(400, 'Unsupported image')
  }

  return {
    image: new Uint8Array(out.data),
    width: out.info.width,
    height: out.info.height,
    sha256: createHash('sha256').update(buf).digest('hex'),
    lat,
    lng,
    takenAt,
  }
}
