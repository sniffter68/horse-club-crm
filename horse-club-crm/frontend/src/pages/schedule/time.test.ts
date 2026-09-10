import { describe, expect, it } from 'vitest'
import { formatTime, toInstant, toLocalInput } from './time'
describe('club time zone', () => {
  it('converts Moscow wall time to UTC across the date boundary', () => {
    expect(toInstant('2026-09-09T01:30')).toBe('2026-09-08T22:30:00.000Z')
    expect(toLocalInput(new Date('2026-09-08T22:30:00Z'))).toBe('2026-09-09T01:30')
  })
  it('formats API instants in club time', () => {
    expect(formatTime('2026-09-08T07:00:00Z')).toContain('10:00')
  })
  it('rejects invalid dates instead of submitting an invalid instant', () => {
    expect(() => toInstant('2026-02-30T10:00')).toThrow()
    expect(() => toInstant('')).toThrow()
  })
})
