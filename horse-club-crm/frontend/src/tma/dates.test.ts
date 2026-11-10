import { describe, expect, it } from 'vitest'
import { Settings } from 'luxon'
import { tmaDay, tmaTime, tmaWeek } from './dates'

describe('trainer TMA Moscow dates', () => {
  it('uses Moscow today across UTC midnight and restores the clock', () => {
    const previous = Settings.now
    try { Settings.now = () => Date.parse('2026-11-10T21:05:00Z'); expect(tmaDay()).toBe('2026-11-11') }
    finally { Settings.now = previous }
  })
  it('starts the week on Monday and crosses year boundaries', () => {
    expect(tmaWeek('2027-01-01').map(day => day.toISODate())).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ])
    expect(tmaTime('2026-11-11T07:45:00Z')).toBe('10:45')
  })
})
