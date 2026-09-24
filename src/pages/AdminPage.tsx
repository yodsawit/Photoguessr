import { useState } from 'react'
import { createPool } from '../game/api'
import { Button, Card, CenteredPage, Title } from '../components/layout'

/** Create a pool with the admin code. Its one key is shown exactly once. */
export function AdminPage() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setKey((await createPool(code)).key)
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
        {!key ? (
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
              ⚠️ Save this key now — it's shown only once and can't be recovered.
            </p>
            <KeyCard value={key} />
            <ul className="space-y-1 text-xs text-muted">
              <li>• Put it in your iPhone Shortcut to add photos, and share it with players.</li>
              <li>• Anyone with the key can play, add and delete photos, and delete the pool.</li>
              <li>• An empty pool is deleted 1 hour after it becomes empty. With photos, it's deleted after 3 days without any play, upload or delete.</li>
            </ul>
            <a href="/" className="block">
              <Button tone="coral">Open this pool</Button>
            </a>
            <Button tone="quiet" onClick={() => setKey(null)}>
              Create another
            </Button>
          </div>
        )}
      </Card>
    </CenteredPage>
  )
}

export function KeyCard({ value }: { value: string }) {
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
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-cream p-3 text-left">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Pool key</p>
        <p className="font-mono text-3xl font-extrabold tracking-[0.3em] text-ink select-all">{value}</p>
      </div>
      <button type="button" onClick={copy} className="h-11 shrink-0 rounded-xl border border-sand bg-white px-4 text-sm font-bold text-ink active:scale-95">
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  )
}
