import { useState } from 'react'
import { ApiError, deletePool, fetchPoolStatus, KEY_PATTERN, type PoolStatus } from '../game/api'
import { KeyInput } from '../components/KeyInput'
import { Button, Card, CenteredPage, Title } from '../components/layout'

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Owner view: upload key -> photo count, auto-delete time, delete now. The key is not remembered. */
export function ManagePage() {
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<PoolStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleted, setDeleted] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'That upload key is not valid (or the pool expired).' : err instanceof Error ? err.message : 'Something went wrong')
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  const check = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => setStatus(await fetchPoolStatus(key)))
  }

  const remove = () => {
    if (!confirming) return setConfirming(true)
    void run(async () => {
      await deletePool(key)
      setDeleted(true)
      setStatus(null)
      setKey('')
    })
  }

  return (
    <CenteredPage>
      <Card>
        <Title>Manage my pool</Title>
        {deleted ? (
          <p className="mt-5 rounded-xl bg-sage/25 px-3 py-3 font-semibold text-sage-deep">🗑️ Pool deleted. Its keys no longer work.</p>
        ) : !status ? (
          <form onSubmit={check} className="mt-5 space-y-4">
            <KeyInput label="Upload key" value={key} onChange={setKey} autoFocus />
            {error && <p className="rounded-xl bg-peach/25 px-3 py-2 text-sm font-semibold text-coral">{error}</p>}
            <Button type="submit" disabled={busy || !KEY_PATTERN.test(key)}>
              {busy ? 'Checking…' : 'Open pool'}
            </Button>
          </form>
        ) : (
          <div className="mt-5 space-y-3 text-left">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-cream px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Photos</p>
                <p className="text-2xl font-extrabold text-ink">{status.photoCount}</p>
              </div>
              <div className="rounded-2xl bg-cream px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Auto-delete</p>
                <p className="font-bold text-ink">{formatWhen(status.expiresAt)}</p>
              </div>
            </div>
            <p className="text-xs text-muted">Any play, upload or delete pushes auto-delete back to 3 days from then.</p>
            {error && <p className="rounded-xl bg-peach/25 px-3 py-2 text-sm font-semibold text-coral">{error}</p>}
            <Button tone="coral" onClick={remove} disabled={busy}>
              {confirming ? 'Tap again to delete everything' : 'Delete pool now'}
            </Button>
            <Button tone="quiet" onClick={() => (setStatus(null), setConfirming(false))}>
              Close
            </Button>
          </div>
        )}
      </Card>
    </CenteredPage>
  )
}
