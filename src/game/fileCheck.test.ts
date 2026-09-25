import { describe, expect, it } from 'vitest'
import { checkFiles } from './fileCheck'
import { MAX_PHOTO_BYTES } from './imageType'

const file = (name: string, head: number[] | string, size?: number) => {
  const bytes = typeof head === 'string' ? new TextEncoder().encode(head) : new Uint8Array(head)
  const padded = size && size > bytes.length ? (() => { const b = new Uint8Array(size); b.set(bytes); return b })() : bytes
  return new File([padded], name)
}
const JPEG = [0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0]
const HEIC = [0, 0, 0, 0x18, ...new TextEncoder().encode('ftypheic'), 0, 0, 0, 0, ...new TextEncoder().encode('mif1heic')]

describe('checkFiles (browser pre-check; the server re-checks everything)', () => {
  it('accepts photos by content, not by name', async () => {
    const r = await checkFiles([file('a.jpg', JPEG), file('IMG_1.HEIC', HEIC), file('weird-name.bin', JPEG)])
    expect(r.tooMany).toBe(false)
    expect(r.accepted.map((f) => f.name)).toEqual(['a.jpg', 'IMG_1.HEIC', 'weird-name.bin'])
    expect(r.rejected).toEqual([])
  })

  it('rejects non-photos even with a photo name, empty files and files over 40 MB', async () => {
    const r = await checkFiles([
      file('notes.jpg', 'just some text'),
      file('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'),
      file('anim.gif', 'GIF89a......'),
      file('doc.pdf', '%PDF-1.7'),
      file('empty.jpg', []),
      file('huge.jpg', JPEG, MAX_PHOTO_BYTES + 1),
    ])
    expect(r.accepted).toEqual([])
    expect(r.rejected).toEqual([
      { name: 'notes.jpg', reason: 'not a photo' },
      { name: 'logo.svg', reason: 'not a photo' },
      { name: 'anim.gif', reason: 'not a photo' },
      { name: 'doc.pdf', reason: 'not a photo' },
      { name: 'empty.jpg', reason: 'empty file' },
      { name: 'huge.jpg', reason: 'larger than 40 MB' },
    ])
  })

  it('refuses a batch of more than 50 files', async () => {
    const many = Array.from({ length: 51 }, (_, i) => file(`p${i}.jpg`, JPEG))
    const r = await checkFiles(many)
    expect(r.tooMany).toBe(true)
    expect(r.accepted).toEqual([])
  })
})
