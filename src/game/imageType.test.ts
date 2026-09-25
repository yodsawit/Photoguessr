import { describe, expect, it } from 'vitest'
import { MAX_PHOTO_BYTES, sniffImage } from './imageType'

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)))

describe('sniffImage (magic bytes, never the file name)', () => {
  it('accepts the photo formats', () => {
    expect(sniffImage(bytes([0xff, 0xd8, 0xff, 0xe1], 'Exif'))).toBe('jpeg')
    expect(sniffImage(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe('png')
    expect(sniffImage(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))).toBe('webp')
    expect(sniffImage(bytes([0, 0, 0, 0x24], 'ftypheic', [0, 0, 0, 0], 'mif1MiHE'))).toBe('heic')
    expect(sniffImage(bytes([0, 0, 0, 0x1c], 'ftypmif1', [0, 0, 0, 0], 'mif1heic'))).toBe('heic')
    expect(sniffImage(bytes([0, 0, 0, 0x1c], 'ftypavif', [0, 0, 0, 0], 'avifmif1'))).toBe('avif')
  })

  it('rejects everything else', () => {
    const bad = [
      bytes('GIF89a', [1, 0, 1, 0]),
      bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      bytes('<?xml version="1.0"?><svg/>'),
      bytes('%PDF-1.7'),
      bytes('PK', [3, 4, 20, 0]),
      bytes('MZ', [0x90, 0]),
      bytes('II*', [0]), // TIFF
      bytes('BM', [0, 0, 0, 0]), // BMP
      bytes([0, 0, 0, 0x18], 'ftypmp42', [0, 0, 0, 0], 'isommp42'), // MP4 video
      bytes('hello, this is a text file renamed to .jpg'),
      new Uint8Array(),
      bytes([0xff, 0xd8]), // truncated
    ]
    for (const b of bad) expect(sniffImage(b)).toBeNull()
  })

  it('caps photos at 40 MB', () => {
    expect(MAX_PHOTO_BYTES).toBe(40 * 1024 * 1024)
  })
})
