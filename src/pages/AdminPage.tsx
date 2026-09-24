import { useState } from 'react'
import { createPool, type PoolKeys } from '../game/api'
import { Button, Card, CenteredPage, Title } from '../components/layout'

/** Create a pool with the admin code. Keys are shown exactly once. */
export function AdminPage() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keys, setKeys] = useState<PoolKeys | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setKeys(await createPool(code))
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CenteredPage>
      <Card>
        <Title>Create a pool</Title>
        {!keys ? (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block text-left">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">Admin code</span>
              <input
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                className="mt-1 h-12 w-full rounded-2xl border border-sand bg-cream px-4 text-ink outline-none focus:border-peach focus:ring-2 focus:ring-peach/40"
              />
            </label>
            {error && <p className="rounded-xl bg-peach/25 px-3 py-2 text-sm font-semibold text-coral">{error}</p>}
            <Button type="submit" disabled={busy || !code}>
              {busy ? 'Creating…' : 'Create pool'}
            </Button>
          </form>
        ) : (
          <div className="mt-5 space-y-4 text-left">
            <p className="rounded-xl bg-butter/40 px-3 py-2 text-sm font-semibold text-ink">
              ⚠️ Save these now — they are shown only once and can't be recovered.
            </p>
            <KeyCard label="Upload key" hint="Put this in your iPhone Shortcut. Lets you add and delete photos." value={keys.uploadKey} />
            <KeyCard label="Play key" hint="Share with players. Lets them play this pool only." value={keys.playKey} />
            <p className="text-xs text-muted">
              The pool and all its photos are deleted automatically after 3 days without any play, upload or delete.
            </p>
            <Button tone="quiet" onClick={() => setKeys(null)}>
              Done
            </Button>
          </div>
        )}
      </Card>
    </CenteredPage>
  )
}

function KeyCard({ label, hint, value }: { label: string; hint: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked: the key is visible to copy by hand */
    }
  }
  return (
    <div className="rounded-2xl bg-cream p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
          <p className="font-mono text-3xl font-extrabold tracking-[0.3em] text-ink select-all">{value}</p>
        </div>
        <button type="button" onClick={copy} className="h-11 shrink-0 rounded-xl border border-sand bg-white px-4 text-sm font-bold text-ink active:scale-95">
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  )
}
