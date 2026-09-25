import { useCallback, useEffect, useRef, useState } from 'react'
import { ROUND_SECONDS, TIME_PER_TILE_SECONDS } from './scoring'
import type { GuessRequest, GuessResponse, LatLng, PublicPhoto } from './types'

export type Phase = 'ready' | 'playing' | 'submitting' | 'result'

/** Scores a guess. The answer only exists server-side, so this is the network call in the app. */
export type GradeGuess = (req: GuessRequest) => Promise<GuessResponse>

const ROUND_MS = ROUND_SECONDS * 1000
const TIME_PER_TILE_MS = TIME_PER_TILE_SECONDS * 1000

/**
 * One round: ready -> playing (30 s countdown, +10 s per opened card) -> submitting -> result.
 * Time is derived from a performance.now() deadline so throttled/background tabs don't drift.
 * When the clock hits 0 the current state is submitted as-is; the server scores 0 if no pin
 * was dropped.
 */
export function useRound(photo: PublicPhoto, grade: GradeGuess) {
  const [phase, setPhase] = useState<Phase>('ready')
  const [opened, setOpened] = useState<ReadonlySet<number>>(() => new Set())
  const [pin, setPin] = useState<LatLng | null>(null)
  const [remainingMs, setRemainingMs] = useState(ROUND_MS)
  const [result, setResult] = useState<GuessResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Mirrors for the timer callback, which must read the latest values without re-subscribing.
  const stateRef = useRef({ phase, opened, pin })
  stateRef.current = { phase, opened, pin }
  const deadlineRef = useRef(0)
  const requestRef = useRef<GuessRequest | null>(null)

  const send = useCallback(
    async (req: GuessRequest) => {
      setError(null)
      try {
        setResult(await grade(req))
        setPhase('result')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not score the guess')
      }
    },
    [grade],
  )

  const submit = useCallback(
    (timedOut: boolean) => {
      const { phase: p, opened: o, pin: g } = stateRef.current
      if (p !== 'playing') return
      if (!timedOut && !g) return
      stateRef.current.phase = 'submitting' // block re-entry before React re-renders
      setPhase('submitting')
      requestRef.current = { id: photo.id, guess: g, opened: [...o].sort((a, b) => a - b), timedOut }
      void send(requestRef.current)
    },
    [photo.id, send],
  )

  /**
   * Syncs the clock with the real deadline and auto-submits once it has passed. Every player
   * action calls this first: background tabs throttle intervals (to ~1/min in Chrome), so the
   * interval alone can't be trusted to have fired on time. Returns true if the round is over.
   */
  const tick = useCallback(() => {
    if (stateRef.current.phase !== 'playing') return true
    const left = Math.max(0, deadlineRef.current - performance.now())
    setRemainingMs(left)
    if (left > 0) return false
    submit(true)
    return true
  }, [submit])

  const start = useCallback(() => {
    setOpened(new Set())
    setPin(null)
    setResult(null)
    setRemainingMs(ROUND_MS)
    deadlineRef.current = performance.now() + ROUND_MS
    stateRef.current.phase = 'playing'
    setPhase('playing')
  }, [])

  const openTile = useCallback(
    (index: number) => {
      if (tick()) return
      const current = stateRef.current.opened
      if (current.has(index)) return
      const next = new Set(current).add(index)
      stateRef.current.opened = next // guard fast double-taps before React re-renders
      deadlineRef.current += TIME_PER_TILE_MS
      setRemainingMs(Math.max(0, deadlineRef.current - performance.now()))
      setOpened(next)
    },
    [tick],
  )

  const placePin = useCallback(
    (ll: LatLng) => {
      if (!tick()) setPin(ll)
    },
    [tick],
  )

  useEffect(() => {
    if (phase !== 'playing') return
    const id = window.setInterval(tick, 100)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [phase, tick])

  return {
    phase,
    opened,
    pin,
    remainingMs,
    /** Clock length for this round so far: 30 s + 10 s per opened card (for the timer ring). */
    totalMs: ROUND_MS + opened.size * TIME_PER_TILE_MS,
    result,
    error,
    /** Re-sends the same guess after a network/server error. */
    retry: () => {
      if (requestRef.current) void send(requestRef.current)
    },
    canGuess: phase === 'playing' && pin !== null,
    start,
    openTile,
    placePin,
    submit: () => {
      if (!tick()) submit(false)
    },
  }
}
