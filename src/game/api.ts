import type { GuessRequest, GuessResponse, PublicPhoto } from './types'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export async function fetchRounds(count: number): Promise<PublicPhoto[]> {
  return json(await fetch(`/api/rounds?count=${count}`))
}

export async function postGuess(req: GuessRequest): Promise<GuessResponse> {
  return json(
    await fetch('/api/guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }),
  )
}
