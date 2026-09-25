import { describe, expect, it } from 'vitest'
import { dayOf, pickRounds } from './pick'

/** Deterministic "random" for repeatable shuffles. */
const seeded = (seed = 42) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

describe('dayOf', () => {
  it("uses the photo's own local date", () => {
    expect(dayOf('2024-09-28T23:59:00+07:00')).toBe('2024-09-28')
    expect(dayOf('2024-09-28T00:10:00-05:00')).toBe('2024-09-28')
    expect(dayOf(null)).toBeNull()
    expect(dayOf('garbage')).toBeNull()
  })
})

describe('pickRounds', () => {
  it('prefers photos from different days', () => {
    const days = new Map<string, string | null>()
    for (let i = 0; i < 5; i++) days.set(`same${i}`, '2024-01-01')
    for (let i = 0; i < 5; i++) days.set(`d${i}`, `2024-02-0${i + 1}`)
    for (let run = 1; run <= 20; run++) {
      const picked = pickRounds([...days.keys()], (id) => days.get(id) ?? null, 5, seeded(run))
      expect(picked).toHaveLength(5)
      expect(new Set(picked.map((id) => days.get(id))).size).toBe(5)
    }
  })

  it('fills with same-day photos when there are not enough days', () => {
    const ids = ['a', 'b', 'c']
    const picked = pickRounds(ids, () => '2024-01-01', 3, seeded())
    expect([...picked].sort()).toEqual(['a', 'b', 'c'])
  })

  it('puts distinct days first, then repeats', () => {
    const days: Record<string, string> = { a1: 'A', a2: 'A', a3: 'A', b1: 'B', c1: 'C' }
    const picked = pickRounds(Object.keys(days), (id) => days[id], 5, seeded(7))
    expect(new Set(picked.slice(0, 3).map((id) => days[id])).size).toBe(3)
    expect(picked).toHaveLength(5)
  })

  it('treats undated photos as their own day each', () => {
    const picked = pickRounds(['x', 'y', 'z', 'w'], (id) => (id === 'w' ? '2024-01-01' : null), 4, seeded())
    expect(picked).toHaveLength(4)
  })

  it('never returns more than asked or duplicates', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `p${i}`)
    const picked = pickRounds(ids, (id) => `2024-01-${String((Number(id.slice(1)) % 7) + 1).padStart(2, '0')}`, 10, seeded(3))
    expect(picked).toHaveLength(10)
    expect(new Set(picked).size).toBe(10)
    expect(new Set(picked.slice(0, 7).map((id) => Number(id.slice(1)) % 7)).size).toBe(7) // 7 days first
  })
})
