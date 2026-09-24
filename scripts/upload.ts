/**
 * Upload photos from this computer into a pool, exactly like the iPhone Shortcut does:
 * read GPS + date locally, shrink to 1920 px JPEG q80 with NO metadata, then POST.
 *
 *   npm run upload -- --key ABC123   (your pool key) [--url https://photoguessr.onrender.com] photos/*.HEIC
 *
 * Default URL is the local dev server (http://localhost:5173). Originals never leave this machine.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import exifr from 'exifr'
import heicConvert from 'heic-convert'
import sharp from 'sharp'
import { toIsoWithOffset } from '../server/ingest.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { key: { type: 'string' }, url: { type: 'string', default: 'http://localhost:5173' } },
})
const key = values.key?.trim().toUpperCase()
if (!key || !/^[A-Z0-9]{6}$/.test(key) || positionals.length === 0) {
  console.error('usage: npm run upload -- --key <POOL_KEY> [--url <server>] <photo files...>')
  process.exit(1)
}

async function prepare(file: string) {
  const raw = await readFile(file)
  const gps = await exifr.gps(raw).catch(() => undefined)
  if (!gps || !Number.isFinite(gps.latitude)) throw new Error('no GPS in EXIF')
  const tags = await exifr.parse(raw, { reviveValues: false, pick: ['DateTimeOriginal', 'OffsetTimeOriginal', 'CreateDate'] }).catch(() => undefined)
  const dt: unknown = tags?.DateTimeOriginal ?? tags?.CreateDate
  const ext = path.extname(file).toLowerCase()
  const decodable = ext === '.heic' || ext === '.heif' ? Buffer.from(await heicConvert({ buffer: raw, format: 'JPEG', quality: 1 })) : raw
  const jpeg = await sharp(decodable).rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
  return {
    jpeg,
    lat: String(gps.latitude),
    lng: String(gps.longitude),
    takenAt: typeof dt === 'string' ? toIsoWithOffset(dt, tags?.OffsetTimeOriginal) : '',
  }
}

let ok = 0
for (const file of positionals) {
  const name = path.basename(file)
  try {
    const p = await prepare(file)
    const form = new FormData()
    form.set('photo', new Blob([new Uint8Array(p.jpeg)], { type: 'image/jpeg' }), 'photo.jpg')
    form.set('lat', p.lat)
    form.set('lng', p.lng)
    if (p.takenAt) form.set('takenAt', p.takenAt)
    const res = await fetch(new URL('/api/photos', values.url), { method: 'POST', body: form, headers: { Authorization: `Bearer ${key}` } })
    const body = (await res.json().catch(() => ({}))) as { error?: string; duplicate?: boolean }
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    console.log(`${body.duplicate ? 'dup ' : 'ok  '} ${name} (${Math.round(p.jpeg.length / 1024)} KB sent)`)
    ok++
  } catch (err) {
    console.warn(`skip ${name}: ${err instanceof Error ? err.message : err}`)
  }
}
console.log(`${ok}/${positionals.length} uploaded`)
process.exitCode = ok === positionals.length ? 0 : 1
