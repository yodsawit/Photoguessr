import { describe, expect, it } from 'vitest'
import { bonusPercent, geoScore, haversineKm, MAP_SIZE_KM, scoreRound, TILE_BONUS_PCT, tileKind, TILE_COUNT, TIME_PER_TILE_SECONDS } from './scoring'

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

describe('bonusPercent (0% base, hidden cards add 5 / 10 / 25 %)', () => {
  it('uses the agreed tile values', () => {
    expect(TILE_BONUS_PCT).toEqual({ corner: 5, side: 10, middle: 25 })
    expect(TIME_PER_TILE_SECONDS).toBe(10)
  })
  it('is 200% with nothing opened and 0% with everything opened', () => {
    expect(bonusPercent(new Set())).toBe(200)
    expect(bonusPercent(all)).toBe(0)
  })
  it('drops by the opened card value', () => {
    expect(bonusPercent(new Set([0]))).toBe(195)
    expect(bonusPercent(new Set([1]))).toBe(190)
    expect(bonusPercent(new Set([5]))).toBe(175)
    expect(bonusPercent(new Set([0, 1, 5]))).toBe(160)
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
    expect(exact).toMatchObject({ baseScore: 100, bonusPct: 195, finalScore: 195 })
    const near = scoreRound(CHIANG_MAI, { lat: 18.9, lng: 98.9672 }, new Set([5]), false) // ~11 km
    expect(near.finalScore).toBe(Math.round(geoScore(near.distanceKm!) * 1.75))
    expect(near.finalScore).toBeGreaterThan(130)
  })
  it('opening every card leaves 0% bonus, so the round scores 0', () => {
    expect(scoreRound(CHIANG_MAI, CHIANG_MAI, all, false).finalScore).toBe(0)
  })
  it('scores 0 without a pin or without an opened card', () => {
    expect(scoreRound(CHIANG_MAI, null, new Set([0]), true).finalScore).toBe(0)
    expect(scoreRound(CHIANG_MAI, CHIANG_MAI, new Set(), true).finalScore).toBe(0)
  })
})
