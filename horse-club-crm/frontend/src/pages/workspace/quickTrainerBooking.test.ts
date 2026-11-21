import { describe, expect, it } from 'vitest'
import { defaultQuickService, quickHorseReason, quickOverlaps, quickSlots, type QuickContext, type QuickHorse } from './quickTrainerBooking'

const context: QuickContext = { permissions: { lessonCreateOwn: true, lessonCreateAny: false }, services: [], trainers: [], horses: [], arenas: [], entries: [], openTime: '09:00', closeTime: '20:00', daysOfWeekOff: [1] }
const horse: QuickHorse = { id: 'horse', name: 'Гром', status: 'active', healthStatus: 'HEALTHY', isUnavailable: false, usedMinutes: 60, maxDailyMinutes: 120 }
const entry = { startTime: '2026-11-22T10:00:00+03:00', endTime: '2026-11-22T11:00:00+03:00', trainerId: 'trainer', arenaId: null, horseIds: ['horse'] }

describe('quick trainer booking defaults and availability', () => {
  it('prioritizes individual lessons, then memberships, then shortest 45–60 minute service', () => {
    const services = [
      { id: 'a', name: 'Прогулка', durationMinutes: 60, allowMembership: false },
      { id: 'b', name: 'Корда', durationMinutes: 45, allowMembership: false },
      { id: 'c', name: 'Абонемент', durationMinutes: 60, allowMembership: true },
      { id: 'd', name: 'Индивидуальная тренировка', durationMinutes: 45, allowMembership: false },
    ]
    expect(defaultQuickService(services)?.id).toBe('d')
    expect(defaultQuickService(services.slice(0, 3))?.id).toBe('c')
    expect(defaultQuickService(services.slice(0, 2))?.id).toBe('b')
    expect(defaultQuickService([])).toBeUndefined()
  })
  it('uses Moscow working hours, half hours, closing time and days off', () => {
    const slots = quickSlots(context, '2026-11-22', 60)
    expect(slots[0]).toBe('09:00'); expect(slots[1]).toBe('09:30'); expect(slots.at(-1)).toBe('19:00')
    expect(quickSlots(context, '2026-11-23', 60)).toEqual([])
    expect(quickSlots({ ...context, daysOfWeekOff: [0] }, '2026-11-22', 60)).toEqual([])
  })
  it('uses half-open intervals and disallows unhealthy, busy and overloaded horses', () => {
    expect(quickOverlaps(entry, '2026-11-22T11:00:00+03:00', 60)).toBe(false)
    expect(quickHorseReason(horse, [entry], '2026-11-22T10:30:00+03:00', 60)).toBe('Занята')
    expect(quickHorseReason(horse, [entry], '2026-11-22T11:00:00+03:00', 60)).toBeUndefined()
    expect(quickHorseReason(horse, [], entry.startTime, 90)).toBe('Лимит нагрузки')
    expect(quickHorseReason({ ...horse, healthStatus: 'TREATMENT' }, [], entry.startTime, 45)).toBe('На лечении')
    expect(quickHorseReason({ ...horse, healthStatus: 'QUARANTINE' }, [], entry.startTime, 45)).toBe('Карантин')
  })
})
