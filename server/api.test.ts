import { describe, expect, it } from 'vitest'
import { gradeGuess, HttpError, pickRounds } from './api'
import type { PoolPhoto } from '../src/game/types'

const POOL: PoolPhoto[] = [
  { id: 'cm', src: '/pool/cm.jpg', width: 3, height: 4, lat: 18.8018, lng: 98.9672, takenAt: '2024-09-28T11:10:56+07:00', district: 'Mueang Chiang Mai', province: 'Chiang Mai' },
  { id: 'bkk', src: '/pool/bkk.jpg', width: 4, height: 3, lat: 13.7563, lng: 100.5018, takenAt: null, district: 'Pathum Wan', province: 'Bangkok' },
]

describe('pickRounds', () => {
  it('never exposes answer fields', () => {
    const rounds = pickRounds(POOL, 5)
    expect(rounds).toHaveLength(2)
    for (const r of rounds) expect(Object.keys(r).sort()).toEqual(['height', 'id', 'src', 'width'])
  })
})

describe('gradeGuess', () => {
  it('scores on the server and reveals the answer', () => {
    const res = gradeGuess(POOL, { id: 'cm', guess: { lat: 18.8018, lng: 98.9672 }, opened: [0], timedOut: false })
    expect(res.finalScore).toBe(490)
    expect(res.answer).toEqual({ lat: 18.8018, lng: 98.9672, takenAt: '2024-09-28T11:10:56+07:00', district: 'Mueang Chiang Mai', province: 'Chiang Mai' })
  })

  it('scores 0 for a timeout without a pin', () => {
    expect(gradeGuess(POOL, { id: 'cm', guess: null, opened: [], timedOut: true }).finalScore).toBe(0)
  })

  it('rejects unknown photos and malformed input', () => {
    const bad = [
      { id: 'nope', guess: null, opened: [], timedOut: true },
      { id: 'cm', guess: { lat: 'x', lng: 1 }, opened: [0], timedOut: false },
      { id: 'cm', guess: null, opened: [16], timedOut: true },
      null,
    ]
    for (const body of bad) expect(() => gradeGuess(POOL, body)).toThrow(HttpError)
  })
})
