import { useRef, useState } from 'react'
import { ApiError, uploadPhoto } from '../game/api'
import { checkFiles } from '../game/fileCheck'
import { MAX_PHOTOS_PER_BATCH } from '../game/imageType'
import { Button } from '../components/layout'

type Failure = { name: string; reason: string }
type Run = { total: number; done: number; added: number; duplicates: number; failures: Failure[]; running: boolean; note: string | null }

/** What a server error means for one photo. */
function reasonFor(err: unknown): string {
  if (!(err instanceof ApiError)) return 'upload failed'
  if (err.status === 415) return 'not a photo'
  if (err.status === 413) return /megapixels/i.test(err.message) ? 'image too large' : 'larger than 40 MB'
  if (err.status === 400 && /location/i.test(err.message)) return 'no location in photo'
  if (err.status === 0) return "can't reach the server"
  return 'upload failed'
}

/**
 * "Add photos": pick originals from the phone gallery or PC files. Each file is pre-checked in the
 * browser (type by content, size, batch count), then uploaded one at a time as-is; the server
 * reads GPS/date from it, re-checks everything and stores only a cleaned 1920 px WebP.
 */
export function AddPhotos({ poolKey, onFinished, onAlbumGone }: { poolKey: string; onFinished: () => void; onAlbumGone: (reason: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const [run, setRun] = useState<Run | null>(null)

  const start = async (list: FileList | null) => {
    const files = [...(list ?? [])]
    if (input.current) input.current.value = '' // allow picking the same files again
    if (files.length === 0) return
    const check = await checkFiles(files)
    if (check.tooMany) {
      setRun({ total: 0, done: 0, added: 0, duplicates: 0, failures: [], running: false, note: `Pick up to ${MAX_PHOTOS_PER_BATCH} photos at a time.` })
      return
    }
    const ctrl = new AbortController()
    abort.current = ctrl
    const state: Run = { total: files.length, done: check.rejected.length, added: 0, duplicates: 0, failures: [...check.rejected], running: true, note: null }
    setRun({ ...state })

    for (const file of check.accepted) {
      if (ctrl.signal.aborted) break
      try {
        const r = await uploadPhoto(poolKey, file, ctrl.signal)
        if (r.duplicate) state.duplicates++
        else state.added++
      } catch (err) {
        if (ctrl.signal.aborted) break
        if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
          onAlbumGone('That album key is not valid, or the album has expired.')
          return
        }
        if (err instanceof ApiError && err.status === 429) {
          state.note = 'Too many wrong keys from this network. Wait a minute and try again.'
          break
        }
        state.failures.push({ name: file.name, reason: reasonFor(err) })
      }
      state.done++
      setRun({ ...state, failures: [...state.failures] })
    }
    state.running = false
    if (ctrl.signal.aborted) state.note = 'Stopped.'
    setRun({ ...state, failures: [...state.failures] })
    onFinished()
  }

  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 0
  const noLocation = run?.failures.some((f) => f.reason === 'no location in photo')

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        // Originals only; the content is checked again in the browser and on the server.
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        className="hidden"
        onChange={(e) => void start(e.target.files)}
      />
      <Button tone="quiet" onClick={() => input.current?.click()} disabled={run?.running}>
        📷 Add photos
      </Button>

      {run && (
        <div className="order-last col-span-2 rounded-2xl border border-sand bg-white/80 p-3 text-left text-sm" role="status" aria-live="polite">
          {run.total > 0 && (
            <>
              <div className="flex items-center justify-between font-bold text-ink">
                <span>{run.running ? `Adding ${run.total} photo${run.total === 1 ? '' : 's'}…` : 'Done'}</span>
                <span className="tabular-nums text-muted">
                  {run.done} / {run.total}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-sand">
                <div className="h-full rounded-full bg-sage-deep transition-[width] duration-300" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 font-semibold text-ink">
                ✓ {run.added} added
                {run.duplicates > 0 && <span className="text-muted"> · ↺ {run.duplicates} already in album</span>}
                {run.failures.length > 0 && <span className="text-coral"> · ✗ {run.failures.length} skipped</span>}
              </p>
            </>
          )}
          {run.failures.length > 0 && (
            <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted">
              {run.failures.map((f, i) => (
                <li key={i} className="truncate">
                  ✗ <span className="font-semibold text-ink">{f.name}</span> — {f.reason}
                </li>
              ))}
            </ul>
          )}
          {noLocation && (
            <p className="mt-2 rounded-xl bg-butter/40 px-3 py-2 text-xs text-ink">
              📍 Some photos arrived without their location. On iPhone, tap <b>Options</b> at the top of the photo picker and turn
              on <b>Location</b> (or use the “Add to PhotoGuessr” Shortcut). Location must also be on for the Camera.
            </p>
          )}
          {run.note && <p className="mt-2 text-xs font-semibold text-coral">{run.note}</p>}
          {run.running && (
            <Button tone="quiet" className="mt-3 h-11" onClick={() => abort.current?.abort()}>
              Stop
            </Button>
          )}
        </div>
      )}
    </>
  )
}
