import { describe, expect, it } from 'vitest'
import { deferredBalance } from './deferredBalance'

describe('membership deferred balance', () => {
  it('preserves sale cents before the first lesson and carries remaining unit value', () => {
    const membership = { totalPrice: '100.00', pricePerLesson: '33.33', totalLessons: 3, remainedLessons: 3 }
    expect(deferredBalance(membership)).toBe(100)
    expect(deferredBalance({ ...membership, remainedLessons: 2 })).toBe(66.66)
    expect(deferredBalance({ ...membership, remainedLessons: 0 })).toBe(0)
  })
  it('does not display a fabricated zero for an unknown valuation or archived membership', () => {
    expect(deferredBalance({ totalLessons: 8, remainedLessons: 3 })).toBeUndefined()
    expect(deferredBalance({ totalPrice: 8000, pricePerLesson: 1000, totalLessons: 8, remainedLessons: 3, deletedAt: '2026-10-01' })).toBeUndefined()
  })
})
