import { describe, expect, it } from 'vitest'
import { AxiosError } from 'axios'
import { toHttpError } from '../../httpClient'
import { bookingFailure, dayBounds, membershipBalance, peakOccupancy, type ScheduleEntry } from './triad'

describe('triad schedule data', () => {
  it('preserves Rules Engine codes and details through repeated error normalization', () => {
    const failure = toHttpError(new AxiosError('Conflict', '409', undefined, undefined, {
      status: 409, statusText: 'Conflict', headers: {}, config: { headers: undefined! }, data: { code: 'HORSE_REST_VIOLATION', message: 'Отдых 45 мин', details: { requiredRestMinutes: 45 } },
    }))
    const normalized = toHttpError(failure)
    expect(normalized.code).toBe('HORSE_REST_VIOLATION')
    expect(normalized.details?.requiredRestMinutes).toBe(45)
    expect(bookingFailure(normalized).field).toBe('horseId')
  })
  it.each([['RIDER_WEIGHT_EXCEEDED', 'horseId'], ['HORSE_OVERLOADED', 'horseId'], ['TRAINER_BUSY', 'trainerId'], ['ARENA_FULL', 'arenaId']])('maps %s to %s', (code, field) => {
    expect(bookingFailure(Object.assign(new Error('Conflict'), { statusCode: 409, code })).field).toBe(field)
  })
  it('uses legacy counters for billed fixed memberships and decimal units for deposits', () => {
    expect(membershipBalance({ id: 'old', totalLessons: 8, remainedLessons: 5, initialUnits: '8', remainingUnits: '7', validUntil: '2099-01-01', type: 'fixed_lessons' }).remaining).toBe(5)
    const deposit = membershipBalance({ id: 'deposit', type: 'deposit', totalLessons: 0, remainedLessons: 0, validUntil: '2020-01-01', validTo: '2099-01-01', remainingUnits: '1234.56', initialUnits: '2000' })
    expect(deposit.remaining).toBe(1234.56); expect(deposit.active).toBe(true); expect(deposit.label).toContain('₽')
  })
  it('counts peak simultaneous riders rather than every intersecting booking', () => {
    const row = { active: true, riders: ['A'], startTime: '2026-10-09T07:00Z', endTime: '2026-10-09T07:30Z' } as ScheduleEntry
    const next = { ...row, startTime: '2026-10-09T07:30Z', endTime: '2026-10-09T08:00Z' }
    expect(peakOccupancy([row, next], +new Date(row.startTime), +new Date(next.endTime))).toBe(1)
    expect(peakOccupancy([row, next, { ...row, riders: ['B', 'C'] }], +new Date(row.startTime), +new Date(next.endTime))).toBe(3)
  })
  it('uses local club midnight rather than browser midnight', () => {
    expect(dayBounds('2026-10-09')).toEqual({ from: '2026-10-08T21:00:00.000Z', to: '2026-10-09T21:00:00.000Z' })
  })
})
