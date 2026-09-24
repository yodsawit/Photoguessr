/**
 * photoguessr-sweeper: Cloudflare Worker on a 15-minute cron. Deletes every expired pool (key,
 * photos, answers): empty for more than 1 h, or with photos and inactive for more than 3 days.
 * Exists because the Render server sleeps when idle, so it cannot be trusted to delete on time.
 * Uses the same pool layout code as the server.
 */
import { createPoolStore } from '../server/poolStore'
import { r2BindingObjects, type R2BucketLike } from './r2binding'

type Env = { BUCKET: R2BucketLike }

export default {
  async scheduled(_event: unknown, env: Env) {
    const removed = await createPoolStore(r2BindingObjects(env.BUCKET)).sweepExpired()
    console.log(`sweep: removed ${removed} expired pool(s)`) // counts only, never ids
  },
  // No public HTTP surface.
  async fetch() {
    return new Response('Not found', { status: 404 })
  },
}
