import type { RoundResult } from './scoring'

export type LatLng = { lat: number; lng: number }

/** One photo in the pool, produced by `scripts/build-pool.ts`. Server-only: holds the answer. */
export type PoolPhoto = PublicPhoto & Answer

/** What the browser may know about a photo before the guess. */
export type PublicPhoto = {
  id: string
  src: string
  width: number
  height: number
}

/** Revealed only in the guess response. */
export type Answer = {
  lat: number
  lng: number
  /** ISO 8601 in the photo's local time, e.g. "2024-09-28T11:10:56+07:00". */
  takenAt: string | null
  district: string
  province: string
}

export type GuessRequest = {
  id: string
  guess: LatLng | null
  /** Indices (0..15, row-major) of opened tiles. */
  opened: number[]
  timedOut: boolean
}

/** Server's answer to a guess: the score plus the revealed answer. */
export type GuessResponse = RoundResult & { answer: Answer }
