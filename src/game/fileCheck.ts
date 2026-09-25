/**
 * Browser pre-check for "Add photos": refuses non-photos (by their first bytes, never the name),
 * empty files, files over 40 MB and batches over 50 — before anything is uploaded. The server
 * repeats every check, so this is for fast, friendly feedback, not security on its own.
 */
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_BATCH, SNIFF_BYTES, sniffImage } from './imageType'

export type RejectReason = 'not a photo' | 'empty file' | 'larger than 40 MB'
export type FileCheck = { accepted: File[]; rejected: { name: string; reason: RejectReason }[]; tooMany: boolean }

export async function checkFiles(files: File[]): Promise<FileCheck> {
  if (files.length > MAX_PHOTOS_PER_BATCH) return { accepted: [], rejected: [], tooMany: true }
  const accepted: File[] = []
  const rejected: FileCheck['rejected'] = []
  for (const f of files) {
    if (f.size === 0) rejected.push({ name: f.name, reason: 'empty file' })
    else if (f.size > MAX_PHOTO_BYTES) rejected.push({ name: f.name, reason: 'larger than 40 MB' })
    else if (!sniffImage(new Uint8Array(await f.slice(0, SNIFF_BYTES).arrayBuffer()))) rejected.push({ name: f.name, reason: 'not a photo' })
    else accepted.push(f)
  }
  return { accepted, rejected, tooMany: false }
}
