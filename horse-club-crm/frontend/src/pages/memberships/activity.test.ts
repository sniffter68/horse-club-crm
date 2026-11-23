import { describe, expect, it } from 'vitest'
import { isMembershipActive } from './activity'
import type { MembershipSummary } from '../schedule/types'

const now = +new Date('2026-11-24T12:00:00Z')
const membership: MembershipSummary = {
  id: 'membership', totalLessons: 8, remainedLessons: 1, remainingUnits: '1',
  validFrom: '2026-11-01T00:00:00Z', validTo: '2026-11-25T00:00:00Z',
  validUntil: '2026-11-25T00:00:00Z', status: 'active', isActive: true,
}

describe('membership availability in payment and booking selectors', () => {
  it('disappears after the final debit and returns after a refund', () => {
    expect(isMembershipActive(membership, now)).toBe(true)
    expect(isMembershipActive({ ...membership, remainingUnits: '0', isActive: false }, now)).toBe(false)
    expect(isMembershipActive({ ...membership, remainingUnits: '1' }, now)).toBe(true)
  })
  it.each<Partial<MembershipSummary>>([
    { remainingUnits: '0' }, { remainingUnits: '-1' }, { isActive: false },
    { cancelledAt: '2026-11-23' }, { deletedAt: '2026-11-23' },
    { status: 'frozen' }, { status: 'exhausted' }, { status: 'expired' },
    { validTo: '2026-11-24T11:59:59.999Z' }, { validFrom: '2026-11-25' },
  ])('excludes unavailable memberships: %j', patch => {
    expect(isMembershipActive({ ...membership, ...patch }, now)).toBe(false)
  })
  it('includes the exact expiration instant and supports legacy responses', () => {
    expect(isMembershipActive({ ...membership, validTo: new Date(now).toISOString() }, now)).toBe(true)
    expect(isMembershipActive({ ...membership, remainingUnits: undefined, validTo: undefined }, now)).toBe(true)
  })
})
