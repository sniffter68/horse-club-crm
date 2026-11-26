import { describe, expect, it } from 'vitest'
import { trainerRateLabel } from './trainerRate'
import type { Staff } from './types'

const staff: Staff = { id: 'staff', userId: 'user', fullName: 'Тренер', roleTitle: 'Тренер',
  shiftRate: null, lessonRate: null, groupLessonRate: null, lessonPercentage: null, isActive: true,
  user: { role: 'TRAINER', vkId: null, trainer: { commissionPercent: 99 } } }
function withRate(rate: NonNullable<NonNullable<Staff['user']>['trainer']>): Staff {
  return { ...staff, user: { ...staff.user, vkId: null, trainer: rate } }
}
describe('trainer rate shown in staff and rates tables', () => {
  it('shows the club rate rather than an old individual percentage', () => {
    expect(trainerRateLabel(withRate({ commissionPercent: 99, payScheme: 'CLUB' }))).toBe('Ставка клуба · 30%')
  })
  it('shows a fixed rate per lesson', () => {
    const label = trainerRateLabel(withRate({ commissionPercent: 99, payScheme: 'FIXED', fixedPay: 850 }))
    expect(label).toContain('850'); expect(label).toContain('/ занятие'); expect(label).not.toContain('99%')
  })
  it('distinguishes the preserved legacy scheme from an exclusive percentage', () => {
    expect(trainerRateLabel(staff)).toBe('99% · действующая схема')
    expect(trainerRateLabel(withRate({ commissionPercent: 40, payScheme: 'PERCENT' }))).toBe('40%')
  })
  it('does not show a rate for a former trainer', () => {
    expect(trainerRateLabel({ ...staff, user: { ...staff.user, role: 'GROOM', vkId: null } })).toBe('—')
  })
})
