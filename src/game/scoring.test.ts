import { describe, expect, it } from 'vitest'
import { BASE_PCT, bonusPercent, gameGrade, geoScore, gradeFor, haversineKm, FIT_A, FIT_B, ZERO_SCORE_KM, PINPOINT_METERS, PINPOINT_POINTS, ROUND_SECONDS, scoreRound, TILE_BONUS_PCT, tileKind, TILE_COUNT, TIME_PER_TILE_SECONDS } from './scoring'

const CHIANG_MAI = { lat: 18.8018, lng: 98.9672 }
const BANGKOK = { lat: 13.7563, lng: 100.5018 }
const all = new Set(Array.from({ length: TILE_COUNT }, (_, i) => i))

describe('tileKind', () => {
  it('classifies 4 corners, 8 sides, 4 middles', () => {
    const kinds = Array.from({ length: TILE_COUNT }, (_, i) => tileKind(i))
    expect(kinds.filter((k) => k === 'corner')).toHaveLength(4)
    expect(kinds.filter((k) => k === 'side')).toHaveLength(8)
    expect(kinds.filter((k) => k === 'middle')).toHaveLength(4)
    expect([0, 3, 12, 15].map(tileKind)).toEqual(['corner', 'corner', 'corner', 'corner'])
    expect([5, 6, 9, 10].map(tileKind)).toEqual(['middle', 'middle', 'middle', 'middle'])
  })
})

describe('bonusPercent (55% base, hidden cards add 2 / 3 / 5 %)', () => {
  it('uses the agreed tile values', () => {
    expect(BASE_PCT).toBe(55)
    expect(TILE_BONUS_PCT).toEqual({ corner: 2, side: 3, middle: 5 })
    expect(ROUND_SECONDS).toBe(40)
    expect(TIME_PER_TILE_SECONDS).toBe(5)
  })
  it('is 107% with nothing opened and the 55% base with everything opened', () => {
    expect(bonusPercent(new Set())).toBe(107)
    expect(bonusPercent(all)).toBe(55)
  })
  it('drops by the opened card value', () => {
    expect(bonusPercent(new Set([0]))).toBe(105)
    expect(bonusPercent(new Set([1]))).toBe(104)
    expect(bonusPercent(new Set([5]))).toBe(102)
    expect(bonusPercent(new Set([0, 1, 5]))).toBe(97)
  })
})

describe('geo scoring (fitted curve, 0 from 1500 km)', () => {
  it('haversine Bangkok -> Chiang Mai is ~580 km', () => {
    expect(haversineKm(BANGKOK, CHIANG_MAI)).toBeGreaterThan(570)
    expect(haversineKm(BANGKOK, CHIANG_MAI)).toBeLessThan(595)
    expect(haversineKm(CHIANG_MAI, CHIANG_MAI)).toBe(0)
  })
  it('follows a * e^(-b * x) + (100 - a) * (1 - x / 1500), x = min(d, 1500)', () => {
    expect(FIT_A).toBe(57.56363)
    expect(FIT_B).toBe(0.0267556)
    expect(ZERO_SCORE_KM).toBe(1500)
    expect(geoScore(0)).toBeCloseTo(100, 9)
    expect(geoScore(10)).toBeCloseTo(86.2, 1)
    expect(geoScore(100)).toBeCloseTo(43.57, 1)
    expect(geoScore(1000)).toBeCloseTo(14.15, 1)
    expect(geoScore(1500)).toBeCloseTo(0, 9)
    expect(geoScore(5000)).toBe(geoScore(1500))
  })
})

describe('scoreRound (final = round(base × bonus%))', () => {
  it('multiplies by the bonus percentage and rounds', () => {
    const exact = scoreRound(CHIANG_MAI, CHIANG_MAI, new Set([0]), false)
    expect(exact).toMatchObject({ baseScore: 100, bonusPct: 105, finalScore: 115, pinpoint: true }) // 100 x 105% + 10
    const near = scoreRound(CHIANG_MAI, { lat: 18.9, lng: 98.9672 }, new Set([5]), false) // ~11 km
    expect(near.pinpoint).toBe(false)
    expect(near.finalScore).toBe(Math.round(geoScore(near.distanceKm!) * 1.02))
    expect(near.finalScore).toBeGreaterThan(70)
  })
  it('opening every card still keeps the 55% base', () => {
    const r = scoreRound(CHIANG_MAI, { lat: 18.9, lng: 98.9672 }, all, false)
    expect(r.bonusPct).toBe(55)
    expect(r.finalScore).toBe(Math.round(geoScore(r.distanceKm!) * 0.55))
  })
  it('scores 0 only without a pin; guessing blind (no card opened) keeps the full 107%', () => {
    expect(scoreRound(CHIANG_MAI, null, new Set([0]), true).finalScore).toBe(0)
    expect(scoreRound(CHIANG_MAI, CHIANG_MAI, new Set(), false)).toMatchObject({ bonusPct: 107, finalScore: 117, pinpoint: true }) // 100 x 107% + 10
  })
})

describe('grades', () => {
  it('uses the agreed thresholds and colours (F rusty, C yellow, B blue)', () => {
    const g = (n: number) => gradeFor(n).grade
    expect([0, 49.9, 50, 59, 60, 69.9, 70, 80, 89.9, 90, 99.9, 100, 106].map(g)).toEqual(['F', 'F', 'D', 'D', 'C', 'C', 'B', 'A', 'A', 'A+', 'A+', 'S', 'S'])
    expect(gradeFor(10).tone).toBe('rust')
    expect(gradeFor(55).tone).toBe('purple')
    expect(gradeFor(65).tone).toBe('yellow')
    expect(gradeFor(75).tone).toBe('blue')
    expect(gradeFor(85).tone).toBe('green')
    expect(gradeFor(95).tone).toBe('gold')
    expect(gradeFor(100).tone).toBe('rainbow')
  })
  it('grades a whole game by the average per round', () => {
    expect(gameGrade(285, 3).grade).toBe('A+')
    expect(gameGrade(1043, 10).grade).toBe('S')
    expect(gameGrade(499, 10).grade).toBe('F')
    expect(gameGrade(0, 0).grade).toBe('F')
  })
})

describe('pinpoint (+10 after the multiply, within 100 m)', () => {
  const metersNorth = (m: number) => ({ lat: CHIANG_MAI.lat + m / 111_195, lng: CHIANG_MAI.lng })
  it('adds 10 to the final score, not to the raw points', () => {
    expect(PINPOINT_POINTS).toBe(10)
    expect(PINPOINT_METERS).toBe(100)
    const at99 = scoreRound(CHIANG_MAI, metersNorth(99), new Set([5]), false) // 102%
    expect(at99.pinpoint).toBe(true)
    expect(at99.baseScore).toBeCloseTo(geoScore(at99.distanceKm!), 6)
    expect(at99.finalScore).toBe(Math.round((geoScore(at99.distanceKm!) * 102) / 100) + 10)
    const at101 = scoreRound(CHIANG_MAI, metersNorth(101), new Set([5]), false)
    expect(at101.pinpoint).toBe(false)
    expect(at101.finalScore).toBe(Math.round((geoScore(at101.distanceKm!) * 102) / 100))
  })
  it('still counts when every card is opened (100 x 55% + 10 = 65)', () => {
    const all16 = new Set(Array.from({ length: TILE_COUNT }, (_, i) => i))
    expect(scoreRound(CHIANG_MAI, CHIANG_MAI, all16, false)).toMatchObject({ bonusPct: 55, finalScore: 65, pinpoint: true })
  })
  it('never applies without a pin', () => {
    expect(scoreRound(CHIANG_MAI, null, new Set([0]), true)).toMatchObject({ finalScore: 0, pinpoint: false })
  })
})
