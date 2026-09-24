import type { LatLng } from './types'

export const GRID = 4
export const TILE_COUNT = GRID * GRID
export const BASE_MULTIPLIER = 1.0
export const BASE_SCORE = 100
/** GeoGuessr map-size constant D, in km. */
export const MAP_SIZE_KM = 1000
export const ROUND_SECONDS = 30

export type TileKind = 'corner' | 'side' | 'middle'
export const TILE_VALUE: Record<TileKind, number> = { corner: 0.1, side: 0.2, middle: 0.5 }

const EARTH_RADIUS_KM = 6371.0088

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** GeoGuessr formula: BASE * e^(-10 d / D). Unrounded. */
export function geoScore(distanceKm: number): number {
  return BASE_SCORE * Math.exp((-10 * distanceKm) / MAP_SIZE_KM)
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

/** 1.0 + value of every tile still hidden. Rounded to 1 decimal to kill float noise. */
export function multiplier(opened: ReadonlySet<number>): number {
  let m = BASE_MULTIPLIER
  for (let i = 0; i < TILE_COUNT; i++) if (!opened.has(i)) m += TILE_VALUE[tileKind(i)]
  return Math.round(m * 10) / 10
}

export type RoundResult = {
  guess: LatLng | null
  distanceKm: number | null
  baseScore: number
  multiplier: number
  finalScore: number
  openedCount: number
  timedOut: boolean
}

/** A guess only counts with a pin and at least one opened tile; otherwise it scores 0. */
export function scoreRound(answer: LatLng, guess: LatLng | null, opened: ReadonlySet<number>, timedOut: boolean): RoundResult {
  const mult = multiplier(opened)
  if (!guess || opened.size === 0) {
    return { guess, distanceKm: guess ? haversineKm(answer, guess) : null, baseScore: 0, multiplier: mult, finalScore: 0, openedCount: opened.size, timedOut }
  }
  const distanceKm = haversineKm(answer, guess)
  const baseScore = geoScore(distanceKm)
  return { guess, distanceKm, baseScore, multiplier: mult, finalScore: Math.round(baseScore * mult), openedCount: opened.size, timedOut }
}
