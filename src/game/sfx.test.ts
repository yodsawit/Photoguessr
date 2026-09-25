import { describe, expect, it } from 'vitest'
import { barTickRate, createThrottle, gradeSound, medalSound, SFX, SFX_NAMES } from './sfx'

describe('sound catalogue', () => {
  it('has a file and a sane volume for every effect', () => {
    for (const name of SFX_NAMES) {
      expect(SFX[name].file).toBe(`/sfx/${name}.mp3`)
      expect(SFX[name].volume).toBeGreaterThan(0)
      expect(SFX[name].volume).toBeLessThanOrEqual(1)
    }
  })

  it('picks the round grade sound by tier (F..S = 0..6)', () => {
    expect([0, 1].map(gradeSound)).toEqual(['grade-low', 'grade-low'])
    expect([2, 3].map(gradeSound)).toEqual(['grade-mid', 'grade-mid'])
    expect([4, 5].map(gradeSound)).toEqual(['grade-high', 'grade-high'])
    expect(gradeSound(6)).toBe('grade-s')
  })

  it('picks the medal jingle by tier', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(medalSound)).toEqual([
      'medal-low', 'medal-low', 'medal-mid', 'medal-mid', 'medal-high', 'medal-high', 'medal-s',
    ])
  })

  it('bar ticks rise in pitch as the bar fills, and keep rising past the max', () => {
    expect(barTickRate(0)).toBeCloseTo(0.8, 5)
    expect(barTickRate(1)).toBeCloseTo(1.6, 5)
    expect(barTickRate(0.5)).toBeGreaterThan(barTickRate(0.4))
    expect(barTickRate(1.3)).toBeGreaterThan(barTickRate(1))
    expect(barTickRate(5)).toBeLessThanOrEqual(2)
  })
})

describe('createThrottle', () => {
  it('lets one call through per interval', () => {
    let now = 0
    const ok = createThrottle(80, () => now)
    expect(ok()).toBe(true)
    now = 40
    expect(ok()).toBe(false)
    now = 80
    expect(ok()).toBe(true)
    now = 100
    expect(ok()).toBe(false)
  })
})
