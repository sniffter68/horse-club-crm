import { describe, expect, it } from 'vitest'
import { generateWeek, intervalHours, weekHours } from './weekTemplates'
import type { ClubSchedule } from '../schedule/types'

const schedule: ClubSchedule = { openTime: '09:00', closeTime: '18:00', daysOfWeekOff: [] }
describe('weekly shift plans in Moscow', () => {
  it.each([['5/2', 5, 45], ['6/1', 6, 54], ['OFF', 0, 0], ['VACATION', 0, 0]] as const)('%s working days and hours', (template, count, hours) => {
    const days = generateWeek('2026-11-25', template, schedule)
    expect(days[0].date).toBe('2026-11-23')
    expect(days[6].date).toBe('2026-11-29')
    expect(days.filter(day => day.kind === 'WORK')).toHaveLength(count)
    expect(weekHours(days)).toBe(hours)
    if (template === 'VACATION') expect(days.every(day => day.kind === 'VACATION')).toBe(true)
  })
  it('2/2 repeats across both sides of the chosen first working day', () => {
    expect(generateWeek('2026-11-25', '2/2', schedule, '2026-11-25').map(day => day.kind)).toEqual(['OFF', 'OFF', 'WORK', 'WORK', 'OFF', 'OFF', 'WORK'])
    expect(weekHours(generateWeek('2026-11-25', '2/2', schedule, '2026-11-23'))).toBe(36)
  })
  it('honours club closures and per-day hours across a year boundary', () => {
    const days = generateWeek('2027-01-01', '6/1', { ...schedule, daysOfWeekOff: [2], weekDays: [{ dayOfWeek: 1, isWorkingDay: true, openTime: '10:30', closeTime: '19:00' }] })
    expect(days[0].date).toBe('2026-12-28')
    expect(days[0].startTime).toBe('10:30')
    expect(days[1].kind).toBe('OFF')
    expect(weekHours(days)).toBe(44.5)
    expect(intervalHours('10:30', '19:00')).toBe(8.5)
    expect(intervalHours('19:00', '10:30')).toBe(0)
  })
})
