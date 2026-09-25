import type { RoundResult } from './scoring'

export type LatLng = { lat: number; lng: number }

/** What the browser may know about a photo before the guess. The image itself is fetched from
 *  `GET /api/photo/:id` with the pool key (never a public URL). */
export type PublicPhoto = {
  id: string
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
  /** The game this guess belongs to (from GET /api/rounds); counts toward the album high score. */
  gameId?: string
  guess: LatLng | null
  /** Indices (0..15, row-major) of opened tiles. */
  opened: number[]
  timedOut: boolean
}

export type HighScore = { total: number; rounds: number; at: string }

export type GameProgress = {
  done: boolean
  total: number
  rounds: number
  /** Only when done. */
  highScore?: HighScore
  newHighScore?: boolean
}

/** Server's answer to a guess: the score plus the revealed answer (and game progress if tracked). */
export type GuessResponse = RoundResult & { answer: Answer; game?: GameProgress }

export type RoundsResponse = { gameId: string; photos: PublicPhoto[] }
