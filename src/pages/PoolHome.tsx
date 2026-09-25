import { useCallback, useEffect, useState } from 'react'
import { ApiError, deletePool, fetchPoolStatus, type PoolStatus } from '../game/api'
import { Button, Card, CenteredPage, Title } from '../components/layout'
import { KeyCard } from './AdminPage'
import { AddPhotos } from './AddPhotos'
import { gameGrade } from '../game/scoring'
import type { HighScore } from '../game/types'
import { gradeTextColor, GradeMedal } from '../components/GradeMedal'
import { SHORTCUT_URL } from '../game/shortcut'

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const formatDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

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
            <div className="grid grid-cols-3 gap-2 text-sm sm:gap-3">
              <StatTile label="Photos" sub={status.photoCount === 1 ? 'photo' : 'photos'}>
                <span className="text-2xl font-extrabold tabular-nums text-ink">{status.photoCount.toLocaleString('en-US')}</span>
              </StatTile>
              <HighScoreTile highScore={status.highScore} />
              <StatTile label="Auto-delete" sub={`at ${formatTime(status.expiresAt)}`}>
                <span className="text-base leading-tight font-extrabold text-ink sm:text-lg">{formatDay(status.expiresAt)}</span>
              </StatTile>
            </div>

            {status.empty ? (
              <p className="rounded-xl bg-butter/40 px-3 py-2 text-sm font-semibold text-ink">
                No photos yet — this album is deleted at {formatWhen(status.expiresAt)} unless you add one. Tap <b>📷 Add photos</b> below, or use the
                “Add to PhotoGuessr” iPhone Shortcut with this key.
              </p>
            ) : (
              <p className="text-xs text-muted">Any play, upload or delete moves auto-delete to 3 days from then.</p>
            )}

            {error && <p className="rounded-xl bg-peach/25 px-3 py-2 text-sm font-semibold text-coral">{error}</p>}

            <Button tone="coral" onClick={onPlay} disabled={status.empty}>
              {status.empty ? 'Add a photo to play' : 'Play'}
            </Button>
            <div className={status.playOnly ? '' : 'grid grid-cols-2 gap-3'}>
              {!status.playOnly && <AddPhotos poolKey={poolKey} onFinished={refresh} onAlbumGone={(reason) => onLeave(reason)} />}
              <Button tone="quiet" onClick={refresh}>
                Refresh
              </Button>
            </div>

            <details className="rounded-2xl border border-sand bg-white/70 px-3 py-2 text-sm">
              <summary className="cursor-pointer py-2 font-bold text-ink">Album key &amp; settings</summary>
              <div className="mt-2 space-y-3 pb-2">
                <KeyCard value={poolKey} />
                <ShortcutButton poolKey={poolKey} />
                {status.playOnly ? (
                  <p className="text-xs text-muted">This key can play this album.</p>
                ) : (
                  <>
                    <p className="text-xs text-muted">Anyone with this key can play, add and delete photos, and delete the album.</p>
                    <Button tone="coral" onClick={remove} disabled={busy}>
                      {confirming ? 'Tap again to delete everything' : 'Delete album now'}
                    </Button>
                  </>
                )}
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

/** One stat: small label on top, value centred in the middle, small sub-line — same in every tile. */
function StatTile({ label, sub, children }: { label: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[104px] flex-col items-center rounded-2xl bg-cream px-2 py-2.5 text-center">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted sm:text-[11px]">{label}</p>
      <div className="flex flex-1 items-center justify-center gap-1">{children}</div>
      <p className="h-4 text-[11px] font-semibold text-muted">{sub}</p>
    </div>
  )
}

/** Album high score (best finished game), shown in its grade colour. */
function HighScoreTile({ highScore }: { highScore: HighScore | null }) {
  if (!highScore) {
    return (
      <StatTile label="High score" sub="play a game">
        <span className="text-2xl font-extrabold text-sand">—</span>
      </StatTile>
    )
  }
  const info = gameGrade(highScore.total, highScore.rounds)
  return (
    <StatTile label="High score" sub={`grade ${info.grade}`}>
      <span className="text-2xl font-extrabold tabular-nums" style={{ color: gradeTextColor(info.tone) }}>
        {highScore.total.toLocaleString('en-US')}
      </span>
      <GradeMedal info={info} size="xs" />
    </StatTile>
  )
}

/**
 * Adds the iPhone Shortcut for this album: copies the key, then opens the shortcut's iCloud page.
 * When it's added, iOS asks for the album key; paste it. The key never goes into the link.
 */
function ShortcutButton({ poolKey }: { poolKey: string }) {
  const [copied, setCopied] = useState(false)
  if (!SHORTCUT_URL) return null
  return (
    <div className="space-y-1.5">
      <a
        href={SHORTCUT_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          // Same tap as the link, so iOS allows both; if the clipboard is blocked the key is shown above.
          navigator.clipboard?.writeText(poolKey).then(() => setCopied(true), () => undefined)
        }}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-sand bg-white font-bold text-ink shadow-sm transition active:scale-[0.98]"
      >
        ⚡ Add iPhone Shortcut
      </a>
      <p className="text-xs text-muted">
        {copied ? 'Key copied ✓ — ' : ''}When iPhone asks for the album key while adding the shortcut, paste it ({poolKey}). Then
        share photos to <b>Add to PhotoGuessr</b>.
      </p>
    </div>
  )
}
