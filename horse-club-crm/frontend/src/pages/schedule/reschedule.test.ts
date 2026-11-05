import { describe, expect, it } from 'vitest'
import { moveConflict } from './reschedule'
import type { ScheduleEntry } from './triad'

const entry: ScheduleEntry = { id: 'a', source: 'booking', startTime: '2026-11-06T06:00Z', endTime: '2026-11-06T07:00Z', trainerId: 't', trainerName: 'Тренер', horses: [{ id: 'h', name: 'Лошадь', restMinutes: 45 }], riders: ['Клиент'], discipline: 'Выездка', status: 'scheduled', active: true, completed: false }
const move = { startTime: '2026-11-06T08:00Z', endTime: '2026-11-06T09:00Z', trainerId: 't' }
describe('resource moves', () => {
  it('excludes itself and cancelled entries', () => {
    expect(moveConflict(entry, move, [entry, { ...entry, id: 'b', active: false, ...move }], [])).toBeUndefined()
  })
  it('rejects horse overlaps and insufficient rest', () => {
    expect(moveConflict(entry, move, [{ ...entry, id: 'b', ...move }], [])).toContain('занята')
    expect(moveConflict(entry, move, [{ ...entry, id: 'b', startTime: '2026-11-06T07:00Z', endTime: '2026-11-06T07:30Z' }], [])).toContain('отдых')
  })
  it('counts peak simultaneous riders and permits adjacent intervals', () => {
    const others = Array.from({ length: 4 }, (_, i) => ({ ...entry, ...move, id: `b${i}`, horses: [] }))
    expect(moveConflict(entry, move, others, [])).toContain('(4)')
    expect(moveConflict(entry, move, others.slice(1), [])).toBeUndefined()
    expect(moveConflict(entry, move, others.map(e => ({ ...e, startTime: move.endTime, endTime: '2026-11-06T10:00Z' })), [])).toBeUndefined()
  })
})
