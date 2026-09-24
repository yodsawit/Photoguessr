import { describe, expect, it } from 'vitest'
import { geoScore, haversineKm, multiplier, scoreRound, tileKind, TILE_COUNT } from './scoring'

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

describe('multiplier', () => {
  it('is 5.0 with nothing opened and 1.0 with everything opened', () => {
    expect(multiplier(new Set())).toBe(5)
    expect(multiplier(all)).toBe(1)
  })
  it('drops by the opened tile value', () => {
    expect(multiplier(new Set([0]))).toBe(4.9)
    expect(multiplier(new Set([1]))).toBe(4.8)
    expect(multiplier(new Set([5]))).toBe(4.5)
    expect(multiplier(new Set([0, 1, 5]))).toBe(4.2)
  })
})

describe('geo scoring', () => {
  it('haversine Bangkok -> Chiang Mai is ~580 km', () => {
    expect(haversineKm(BANGKOK, CHIANG_MAI)).toBeGreaterThan(570)
    expect(haversineKm(BANGKOK, CHIANG_MAI)).toBeLessThan(595)
    expect(haversineKm(CHIANG_MAI, CHIANG_MAI)).toBe(0)
  })
  it('follows 100 * e^(-10 d / 1000)', () => {
    expect(geoScore(0)).toBe(100)
    expect(geoScore(100)).toBeCloseTo(36.788, 2)
  })
})

describe('scoreRound', () => {
  it('multiplies and rounds', () => {
    const r = scoreRound(CHIANG_MAI, CHIANG_MAI, new Set([0]), false)
    expect(r.finalScore).toBe(490)
    const far = scoreRound(CHIANG_MAI, BANGKOK, new Set([5]), false)
    expect(far.finalScore).toBe(Math.round(geoScore(far.distanceKm!) * 4.5))
  })
  it('scores 0 without a pin or without an opened tile', () => {
    expect(scoreRound(CHIANG_MAI, null, new Set([0]), true).finalScore).toBe(0)
    expect(scoreRound(CHIANG_MAI, CHIANG_MAI, new Set(), true).finalScore).toBe(0)
  })
})
