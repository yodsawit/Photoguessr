import type { LatLng } from './types'

export const GRID = 4
export const TILE_COUNT = GRID * GRID
export const BASE_SCORE = 100
/** GeoGuessr map-size constant D, in km. Distances beyond D score (almost) nothing. */
export const MAP_SIZE_KM = 500
/** Starting clock per round; every opened card adds TIME_PER_TILE_SECONDS. */
export const ROUND_SECONDS = 30
export const TIME_PER_TILE_SECONDS = 10

export type TileKind = 'corner' | 'side' | 'middle'
/** Bonus % kept by each card while it stays hidden (base bonus is 0%; all hidden = 200%). */
export const TILE_BONUS_PCT: Record<TileKind, number> = { corner: 5, side: 10, middle: 25 }

const EARTH_RADIUS_KM = 6371.0088

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** BASE * e^(-10 * min(d / D, 1)). Unrounded. */
export function geoScore(distanceKm: number): number {
  return BASE_SCORE * Math.exp(-10 * Math.min(distanceKm / MAP_SIZE_KM, 1))
}

/** Tile index is row-major, 0..15. */
export function tileKind(index: number): TileKind {
  const r = Math.floor(index / GRID)
  const c = index % GRID
  const rowEdge = r === 0 || r === GRID - 1
  const colEdge = c === 0 || c === GRID - 1
  if (rowEdge && colEdge) return 'corner'
  if (rowEdge || colEdge) return 'side'
  return 'middle'
}

/** Sum of the bonus % of every card still hidden: 0..200. */
export function bonusPercent(opened: ReadonlySet<number>): number {
  let pct = 0
  for (let i = 0; i < TILE_COUNT; i++) if (!opened.has(i)) pct += TILE_BONUS_PCT[tileKind(i)]
  return pct
}

export type RoundResult = {
  guess: LatLng | null
  distanceKm: number | null
  baseScore: number
  /** Bonus kept, in percent (0..200). */
  bonusPct: number
  finalScore: number
  openedCount: number
  timedOut: boolean
}

/** final = round(base × bonus%). Counts only with a pin and at least one opened card; otherwise 0. */
export function scoreRound(answer: LatLng, guess: LatLng | null, opened: ReadonlySet<number>, timedOut: boolean): RoundResult {
  const bonusPct = bonusPercent(opened)
  if (!guess || opened.size === 0) {
    return { guess, distanceKm: guess ? haversineKm(answer, guess) : null, baseScore: 0, bonusPct, finalScore: 0, openedCount: opened.size, timedOut }
  }
  const distanceKm = haversineKm(answer, guess)
  const baseScore = geoScore(distanceKm)
  return { guess, distanceKm, baseScore, bonusPct, finalScore: Math.round((baseScore * bonusPct) / 100), openedCount: opened.size, timedOut }
}
