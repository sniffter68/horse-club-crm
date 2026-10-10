import { describe, expect, it } from 'vitest'
import { leadConversionPayload, type LeadFormValues } from './leadConversion'

const client: LeadFormValues = { firstName: 'Анна', phone: '+79991234567', isRider: true, isPayer: false, lastName: ' Орлова ', preferences: '  ' }
const lesson = { startTime: '2026-10-14T13:00', durationMinutes: 45, serviceId: 'service', trainerId: 'trainer', horseId: 'horse', arenaId: '' }
describe('lead conversion payload', () => {
  it('strips hidden lesson values after the scheduling checkbox is turned off', () => {
    const result = leadConversionPayload({ ...client, assignLesson: false, lesson })
    expect(result).not.toHaveProperty('lesson')
    expect(result).not.toHaveProperty('assignLesson')
    expect(result.lastName).toBe('Орлова')
    expect(result.preferences).toBeUndefined()
  })
  it('converts club local time to an instant and sends the resources in one request', () => {
    expect(leadConversionPayload({ ...client, assignLesson: true, lesson }).lesson).toEqual({
      ...lesson, startTime: '2026-10-14T10:00:00.000Z', arenaId: undefined,
    })
  })
  it('does not silently create just a client when lesson data is missing or malformed', () => {
    expect(() => leadConversionPayload({ ...client, assignLesson: true })).toThrow('Заполните параметры занятия')
    expect(() => leadConversionPayload({ ...client, assignLesson: true, lesson: { ...lesson, startTime: 'invalid' } })).toThrow()
  })
})
