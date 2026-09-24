/** ObjectStore over Cloudflare R2's S3-compatible API (used by the Render server). */
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3'
import type { ObjectStore } from './objects'

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string }

export function createR2Objects({ accountId, accessKeyId, secretAccessKey, bucket }: R2Config): ObjectStore {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })

  async function listAll(prefix: string, delimiter?: string) {
    const keys: string[] = []
    const prefixes: string[] = []
    let token: string | undefined
    do {
      const page: ListObjectsV2CommandOutput = await s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: delimiter, ContinuationToken: token }),
      )
      for (const o of page.Contents ?? []) if (o.Key) keys.push(o.Key)
      for (const p of page.CommonPrefixes ?? []) if (p.Prefix) prefixes.push(p.Prefix)
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    return { keys, prefixes }
  }

  return {
    async get(key) {
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        return res.Body ? await res.Body.transformToByteArray() : null
      } catch (err) {
        if (err instanceof NoSuchKey || (err as { name?: string }).name === 'NoSuchKey') return null
        throw err
      }
    },
    async put(key, body, contentType) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }))
    },
    async delete(keys) {
      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000)
        if (batch.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }))
      }
    },
    list: async (prefix) => (await listAll(prefix)).keys,
    listPrefixes: async (prefix) => (await listAll(prefix, '/')).prefixes,
  }
}
