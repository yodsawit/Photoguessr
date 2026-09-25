import { describe, expect, it } from 'vitest'
import { bonusPercent, gameGrade, geoScore, gradeFor, haversineKm, MAP_SIZE_KM, PINPOINT_METERS, PINPOINT_POINTS, scoreRound, TILE_BONUS_PCT, tileKind, TILE_COUNT, TIME_PER_TILE_SECONDS } from './scoring'

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

describe('bonusPercent (0% base, hidden cards add 2 / 5 / 15 %)', () => {
  it('uses the agreed tile values', () => {
    expect(TILE_BONUS_PCT).toEqual({ corner: 2, side: 5, middle: 15 })
    expect(TIME_PER_TILE_SECONDS).toBe(10)
  })
  it('is 108% with nothing opened and 0% with everything opened', () => {
    expect(bonusPercent(new Set())).toBe(108)
    expect(bonusPercent(all)).toBe(0)
  })
  it('drops by the opened card value', () => {
    expect(bonusPercent(new Set([0]))).toBe(106)
    expect(bonusPercent(new Set([1]))).toBe(103)
    expect(bonusPercent(new Set([5]))).toBe(93)
    expect(bonusPercent(new Set([0, 1, 5]))).toBe(86)
  })
})

describe('geo scoring (D = 500 km, capped with min(d/D, 1))', () => {
  it('haversine Bangkok -> Chiang Mai is ~580 km', () => {
    expect(haversineKm(BANGKOK, CHIANG_MAI)).toBeGreaterThan(570)
    expect(haversineKm(BANGKOK, CHIANG_MAI)).toBeLessThan(595)
    expect(haversineKm(CHIANG_MAI, CHIANG_MAI)).toBe(0)
  })
  it('follows 100 * e^(-10 * min(d / 500, 1))', () => {
    expect(MAP_SIZE_KM).toBe(500)
    expect(geoScore(0)).toBe(100)
    expect(geoScore(50)).toBeCloseTo(36.788, 2)
    expect(geoScore(500)).toBeCloseTo(0.00454, 4)
    expect(geoScore(2000)).toBe(geoScore(500))
  })
})

describe('scoreRound (final = round(base × bonus%))', () => {
  it('multiplies by the bonus percentage and rounds', () => {
    const exact = scoreRound(CHIANG_MAI, CHIANG_MAI, new Set([0]), false)
    expect(exact).toMatchObject({ baseScore: 100, bonusPct: 106, finalScore: 116, pinpoint: true }) // 100 x 106% + 10
    const near = scoreRound(CHIANG_MAI, { lat: 18.9, lng: 98.9672 }, new Set([5]), false) // ~11 km
    expect(near.pinpoint).toBe(false)
    expect(near.finalScore).toBe(Math.round(geoScore(near.distanceKm!) * 0.93))
    expect(near.finalScore).toBeGreaterThan(70)
  })
  it('opening every card leaves 0% bonus, so the round scores 0', () => {
    expect(scoreRound(CHIANG_MAI, BANGKOK, all, false).finalScore).toBe(0)
  })
  it('scores 0 only without a pin; guessing blind (no card opened) keeps the full 108%', () => {
    expect(scoreRound(CHIANG_MAI, null, new Set([0]), true).finalScore).toBe(0)
    expect(scoreRound(CHIANG_MAI, CHIANG_MAI, new Set(), false)).toMatchObject({ bonusPct: 108, finalScore: 118, pinpoint: true }) // 100 x 108% + 10
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
    const at99 = scoreRound(CHIANG_MAI, metersNorth(99), new Set([5]), false) // 93%
    expect(at99.pinpoint).toBe(true)
    expect(at99.baseScore).toBeCloseTo(geoScore(at99.distanceKm!), 6)
    expect(at99.finalScore).toBe(Math.round((geoScore(at99.distanceKm!) * 93) / 100) + 10)
    const at101 = scoreRound(CHIANG_MAI, metersNorth(101), new Set([5]), false)
    expect(at101.pinpoint).toBe(false)
    expect(at101.finalScore).toBe(Math.round((geoScore(at101.distanceKm!) * 93) / 100))
  })
  it('still counts when every card is opened (0% + 10 = 10)', () => {
    const all16 = new Set(Array.from({ length: TILE_COUNT }, (_, i) => i))
    expect(scoreRound(CHIANG_MAI, CHIANG_MAI, all16, false)).toMatchObject({ bonusPct: 0, finalScore: 10, pinpoint: true })
  })
  it('never applies without a pin', () => {
    expect(scoreRound(CHIANG_MAI, null, new Set([0]), true)).toMatchObject({ finalScore: 0, pinpoint: false })
  })
})
