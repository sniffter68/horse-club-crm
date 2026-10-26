import { describe, expect, it } from 'vitest'
import { paidPeriodFor, type PaidPeriod } from './types'

describe('paid shift date markers', () => {
  const periods: PaidPeriod[] = [{ id: 'payroll', staffId: 'staff', periodStart: '2026-10-10T00:00:00.000Z', periodEnd: '2026-10-15T00:00:00.000Z', createdAt: '2026-10-16T12:00:00Z' }]
  it('includes both calendar boundaries without affecting adjacent or future days', () => {
    for (const date of ['2026-10-10', '2026-10-12', '2026-10-15']) expect(paidPeriodFor(periods, 'staff', date)?.id).toBe('payroll')
    for (const date of ['2026-10-09', '2026-10-16', '2099-01-01']) expect(paidPeriodFor(periods, 'staff', date)).toBeUndefined()
  })
  it('does not mark another employee or a reopened period', () => {
    expect(paidPeriodFor(periods, 'other', '2026-10-12')).toBeUndefined()
    expect(paidPeriodFor([], 'staff', '2026-10-12')).toBeUndefined()
  })
})
