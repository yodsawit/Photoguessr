/**
 * Photo type detection by magic bytes — the file's name, extension and claimed MIME type are never
 * trusted. Shared by the browser (pre-check) and the server (the real gate, before any decoder).
 */
export type ImageKind = 'jpeg' | 'png' | 'webp' | 'heic' | 'avif'

/** Largest photo accepted (browser pre-check and server body limit). */
export const MAX_PHOTO_BYTES = 40 * 1024 * 1024
/** Most photos one "Add photos" batch may contain. */
export const MAX_PHOTOS_PER_BATCH = 50

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])
const AVIF_BRANDS = new Set(['avif', 'avis'])

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to))

/** How many leading bytes sniffImage needs to see. */
export const SNIFF_BYTES = 64

export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'webp'
  // ISO-BMFF: [size]['ftyp'][major brand][minor version][compatible brands…]
  if (b.length >= 16 && ascii(b, 4, 8) === 'ftyp') {
    const boxEnd = Math.min(b.length, new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0))
    const brands = [ascii(b, 8, 12)]
    for (let i = 16; i + 4 <= boxEnd; i += 4) brands.push(ascii(b, i, i + 4))
    if (AVIF_BRANDS.has(brands[0])) return 'avif'
    if (brands.some((x) => HEIC_BRANDS.has(x)) && !brands.some((x) => AVIF_BRANDS.has(x))) return 'heic'
    if (brands.some((x) => AVIF_BRANDS.has(x))) return 'avif'
  }
  return null
}
