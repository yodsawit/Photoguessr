/**
 * Server entry (Render in production, `npm run dev:server` locally). Serves the built client from
 * dist/ plus the API. Storage is R2 when R2_* env vars are set, otherwise in-memory (dev only).
 */
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type { Context } from 'hono'
import { createApp } from './app'
import { createGeocoder } from './geocode'
import { MemoryObjects, type ObjectStore } from './objects'
import { createPoolStore } from './poolStore'
import { PoolService } from './pools'
import { createR2Objects, resolveR2Endpoint } from './r2'

const isProd = process.env.NODE_ENV === 'production'
if (!isProd && existsSync('.env')) process.loadEnvFile('.env')
const env = process.env

function fail(msg: string): never {
  console.error(msg)
  process.exit(1)
}

let objects: ObjectStore
// R2_API_TOKEN is not used: the S3 API authenticates with the access key id + secret.
const r2Vars = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const
let r2Endpoint: string | null = null
try {
  r2Endpoint = resolveR2Endpoint(env.R2_S3_ENDPOINT, env.R2_ACCOUNT_ID)
} catch (err) {
  fail(err instanceof Error ? err.message : 'Invalid R2_S3_ENDPOINT')
}
if (r2Endpoint && r2Vars.every((k) => env[k])) {
  objects = createR2Objects({
    endpoint: r2Endpoint,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    bucket: env.R2_BUCKET!,
  })
  console.log('storage: R2')
} else {
  const missing = [...(r2Endpoint ? [] : ['R2_S3_ENDPOINT or R2_ACCOUNT_ID']), ...r2Vars.filter((k) => !env[k])]
  if (isProd) fail(`Missing env: ${missing.join(', ')}`)
  objects = new MemoryObjects()
  console.log('storage: in-memory (dev) — data is lost on restart')
}

let pepper = env.KEY_PEPPER ?? ''
if (pepper.length < 16) {
  if (isProd || !(objects instanceof MemoryObjects)) fail('KEY_PEPPER must be set (>= 16 chars) when using R2 or in production')
  pepper = randomBytes(32).toString('hex')
}

const store = createPoolStore(objects)
// Optional birthday surprise: an extra play-only key for one album (see docs/deploy.md).
const surprise = env.SURPRISE_KEY && env.SURPRISE_ALBUM_KEY ? { key: env.SURPRISE_KEY, albumKey: env.SURPRISE_ALBUM_KEY } : undefined
const pools = new PoolService(store, pepper, Date.now, surprise)
const geocoder = createGeocoder({ userAgent: `PhotoGuessr/1.0 (${env.NOMINATIM_CONTACT || 'private photo game'})` })

/** Render's proxy appends the real client IP as the LAST X-Forwarded-For entry; earlier ones are client-controlled. */
const clientIp = (c: Context) => {
  const xff = c.req.header('x-forwarded-for')
  if (xff) return xff.split(',').at(-1)!.trim()
  return (c.env as { incoming?: { socket?: { remoteAddress?: string } } })?.incoming?.socket?.remoteAddress ?? 'unknown'
}

let adminCode = env.ADMIN_CODE ?? ''
if (!adminCode && !isProd) {
  // Local dev convenience only: a throwaway code printed to YOUR terminal. Production requires ADMIN_CODE.
  adminCode = randomBytes(6).toString('hex')
  console.log(`dev admin code: ${adminCode}  (set ADMIN_CODE in .env to choose your own)`)
}

const app = createApp({ pools, store, geocoder, adminCode, clientIp })

if (existsSync('dist/index.html')) {
  app.use('/assets/*', serveStatic({ root: './dist' }))
  app.use('*', serveStatic({ root: './dist' }))
  // Missing build files are real 404s; other paths (/admin, ...) fall back to the app shell.
  app.get('/assets/*', (c) => c.text('Not found', 404))
  app.get('*', serveStatic({ path: './dist/index.html' }))
}

// Expired pools are also deleted on access and by the Cloudflare sweeper; this is a third safety net.
const sweep = () => store.sweepExpired().then((n) => n && console.log(`sweep: removed ${n} expired pool(s)`)).catch(() => console.log('sweep: failed'))
void sweep()
setInterval(sweep, 60 * 60 * 1000).unref()

const port = Number(env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, () => console.log(`PhotoGuessr server on :${port}`))
