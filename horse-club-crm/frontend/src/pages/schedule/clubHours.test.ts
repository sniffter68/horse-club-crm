import { describe, expect, it } from 'vitest'
import { clubHoursForDate } from './clubHours'
import type { ClubSchedule } from './types'

describe('clubHoursForDate', () => {
  const schedule: ClubSchedule = { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [0], weekDays: [
    { dayOfWeek: 1, isWorkingDay: true, openTime: '11:15', closeTime: '18:45' },
    { dayOfWeek: 7, isWorkingDay: false, openTime: '09:00', closeTime: '21:00' },
  ] }
  it('uses individual hours and Moscow weekdays across UTC midnight', () => {
    expect(clubHoursForDate(schedule, '2026-11-22T22:00:00Z')).toEqual({ isWorkingDay: true, openTime: '11:15', closeTime: '18:45' })
    expect(clubHoursForDate(schedule, '2026-11-22')).toEqual({ isWorkingDay: false, openTime: '09:00', closeTime: '21:00' })
  })
  it('supports the legacy API including Sunday=0', () => {
    const legacy = { ...schedule, weekDays: undefined }
    expect(clubHoursForDate(legacy, '2026-11-23').isWorkingDay).toBe(true)
    expect(clubHoursForDate(legacy, '2026-11-22').isWorkingDay).toBe(false)
  })
})
