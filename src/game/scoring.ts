import type { LatLng } from './types'

export const GRID = 4
export const TILE_COUNT = GRID * GRID
export const BASE_SCORE = 100
/** GeoGuessr map-size constant D, in km. Distances beyond D score (almost) nothing. */
export const MAP_SIZE_KM = 1000
/** Starting clock per round; every opened card adds TIME_PER_TILE_SECONDS. */
export const ROUND_SECONDS = 40
export const TIME_PER_TILE_SECONDS = 5
/** A guess this close earns extra points, added to the final score (after the % multiplier). */
export const PINPOINT_METERS = 100
export const PINPOINT_POINTS = 10

export type TileKind = 'corner' | 'side' | 'middle'
/** Every round starts from this % of the distance points, whatever is opened. */
export const BASE_PCT = 55
/** Extra % kept by each card while it stays hidden (on top of BASE_PCT; all hidden = 107%). */
export const TILE_BONUS_PCT: Record<TileKind, number> = { corner: 2, side: 3, middle: 5 }

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

/** BASE_PCT + the % of every card still hidden: 55..107. */
export function bonusPercent(opened: ReadonlySet<number>): number {
  let pct = BASE_PCT
  for (let i = 0; i < TILE_COUNT; i++) if (!opened.has(i)) pct += TILE_BONUS_PCT[tileKind(i)]
  return pct
}

export type RoundResult = {
  guess: LatLng | null
  distanceKm: number | null
  baseScore: number
  /** Points % kept (55..107). */
  bonusPct: number
  finalScore: number
  /** Guess was within PINPOINT_METERS: finalScore includes +PINPOINT_POINTS. */
  pinpoint: boolean
  openedCount: number
  timedOut: boolean
}

/**
 * final = round(distance points × points%) [+10 pinpoint within 100 m]. Only needs a pin; guessing
 * without opening any card is allowed and keeps the full 107%.
 */
export function scoreRound(answer: LatLng, guess: LatLng | null, opened: ReadonlySet<number>, timedOut: boolean): RoundResult {
  const bonusPct = bonusPercent(opened)
  if (!guess) {
    return { guess, distanceKm: null, baseScore: 0, bonusPct, finalScore: 0, pinpoint: false, openedCount: opened.size, timedOut }
  }
  const distanceKm = haversineKm(answer, guess)
  const pinpoint = distanceKm * 1000 <= PINPOINT_METERS
  const baseScore = geoScore(distanceKm)
  const finalScore = Math.round((baseScore * bonusPct) / 100) + (pinpoint ? PINPOINT_POINTS : 0)
  return { guess, distanceKm, baseScore, bonusPct, finalScore, pinpoint, openedCount: opened.size, timedOut }
}

export type Grade = 'F' | 'D' | 'C' | 'B' | 'A' | 'A+' | 'S'
export type GradeTone = 'rust' | 'purple' | 'yellow' | 'blue' | 'green' | 'gold' | 'rainbow'
export type GradeInfo = { grade: Grade; min: number; tone: GradeTone; tier: number }

/** Round grades by points (a whole game uses the average per round). Highest first. */
export const GRADES: readonly GradeInfo[] = [
  { grade: 'S', min: 100, tone: 'rainbow', tier: 6 },
  { grade: 'A+', min: 90, tone: 'gold', tier: 5 },
  { grade: 'A', min: 80, tone: 'green', tier: 4 },
  { grade: 'B', min: 70, tone: 'blue', tier: 3 },
  { grade: 'C', min: 60, tone: 'yellow', tier: 2 },
  { grade: 'D', min: 50, tone: 'purple', tier: 1 },
  { grade: 'F', min: -Infinity, tone: 'rust', tier: 0 },
]

export function gradeFor(pointsPerRound: number): GradeInfo {
  return GRADES.find((g) => pointsPerRound >= g.min) ?? GRADES[GRADES.length - 1]
}

export function gameGrade(total: number, rounds: number): GradeInfo {
  return gradeFor(rounds > 0 ? total / rounds : 0)
}
