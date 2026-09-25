import { useCallback, useEffect, useState } from 'react'
import { ApiError, deletePool, fetchPoolStatus, type PoolStatus } from '../game/api'
import { Button, Card, CenteredPage, Title } from '../components/layout'
import { KeyCard } from './AdminPage'

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

type Props = {
  poolKey: string
  onPlay: () => void
  /** Leave this album (optionally with a message for the key screen). */
  onLeave: (reason?: string | null) => void
}

/** Everything about one album behind one key: status, play, delete. */
export function PoolHome({ poolKey, onPlay, onLeave }: Props) {
  const [status, setStatus] = useState<PoolStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const handle = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 404)) onLeave('That album key is not valid, or the album has expired.')
      else if (err instanceof ApiError && err.status === 429) setError('Too many wrong keys from this network. Wait a minute and try again.')
      else setError(err instanceof Error ? err.message : 'Something went wrong')
    },
    [onLeave],
  )

  const refresh = useCallback(() => {
    setError(null)
    fetchPoolStatus(poolKey).then(setStatus, handle)
  }, [poolKey, handle])

  useEffect(refresh, [refresh])

  const remove = async () => {
    if (!confirming) return setConfirming(true)
    setBusy(true)
    try {
      await deletePool(poolKey)
      onLeave('Album deleted. Its key no longer works.')
    } catch (err) {
      handle(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <CenteredPage>
      <Card>
        <Title>Your album</Title>
        {!status ? (
          <p className="mt-5 font-bold text-muted">{error ?? 'Loading…'}</p>
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

            {status.empty ? (
              <p className="rounded-xl bg-butter/40 px-3 py-2 text-sm font-semibold text-ink">
                No photos yet — this album is deleted at {formatWhen(status.expiresAt)} unless you add one. Add photos from your iPhone with the
                “Add to PhotoGuessr” Shortcut using this key.
              </p>
            ) : (
              <p className="text-xs text-muted">Any play, upload or delete moves auto-delete to 3 days from then.</p>
            )}

            {error && <p className="rounded-xl bg-peach/25 px-3 py-2 text-sm font-semibold text-coral">{error}</p>}

            <Button tone="coral" onClick={onPlay} disabled={status.empty}>
              {status.empty ? 'Add a photo to play' : 'Play'}
            </Button>
            <Button tone="quiet" onClick={refresh}>
              Refresh
            </Button>

            <details className="rounded-2xl border border-sand bg-white/70 px-3 py-2 text-sm">
              <summary className="cursor-pointer py-2 font-bold text-ink">Album key &amp; settings</summary>
              <div className="mt-2 space-y-3 pb-2">
                <KeyCard value={poolKey} />
                <p className="text-xs text-muted">Anyone with this key can play, add and delete photos, and delete the album.</p>
                <Button tone="coral" onClick={remove} disabled={busy}>
                  {confirming ? 'Tap again to delete everything' : 'Delete album now'}
                </Button>
                <Button tone="quiet" onClick={() => onLeave()}>
                  Use another key
                </Button>
              </div>
            </details>
          </div>
        )}
      </Card>
    </CenteredPage>
  )
}
