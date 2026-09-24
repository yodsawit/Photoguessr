import { describe, expect, it } from 'vitest'
import { formatDistance, formatTakenAt } from './format'

describe('format', () => {
  it('keeps the photo-local time', () => {
    expect(formatTakenAt('2024-09-28T11:10:56+07:00')).toBe('28 September 2024 · 11:10')
    expect(formatTakenAt(null)).toBe('Unknown date')
  })
  it('formats distances', () => {
    expect(formatDistance(0.25)).toBe('250 m')
    expect(formatDistance(3.456)).toBe('3.5 km')
    expect(formatDistance(1234.4)).toBe('1,234 km')
  })
})
