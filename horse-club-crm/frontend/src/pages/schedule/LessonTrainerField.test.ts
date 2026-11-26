import { describe, expect, it } from 'vitest'
import { isLessonTrainerLocked } from './trainerLock'

describe('trainer settlement lock', () => {
  const unpaid = { status: 'SCHEDULED' as const, cost: 1500, bookings: [] }
  it('allows a replacement before any payment', () => expect(isLessonTrainerLocked(unpaid)).toBe(false))
  it('allows a membership reservation before the visit is debited', () => {
    expect(isLessonTrainerLocked({ ...unpaid, cost: 0, paymentStatus: 'PAID' })).toBe(false)
  })
  for (const paymentStatus of ['PAID', 'PARTIALLY_PAID', 'PAID_BY_MEMBERSHIP'] as const) {
    it(`locks ${paymentStatus}`, () => expect(isLessonTrainerLocked({ ...unpaid, paymentStatus })).toBe(true))
  }
  it('locks completed lessons and prepayments', () => {
    expect(isLessonTrainerLocked({ ...unpaid, status: 'COMPLETED' })).toBe(true)
    expect(isLessonTrainerLocked({ ...unpaid, prepaymentAmount: '100' })).toBe(true)
  })
  it('unlocks a scheduled lesson after settlement was reversed', () => {
    expect(isLessonTrainerLocked({ ...unpaid, paymentStatus: 'UNPAID', prepaymentAmount: '0', finalPaymentAmount: '0' })).toBe(false)
  })
})
