import type { MembershipSummary } from '../schedule/types'

export function isMembershipActive(membership: MembershipSummary, now = Date.now()): boolean {
  return membership.isActive !== false && !membership.deletedAt && !membership.cancelledAt
    && (!membership.status || membership.status === 'active')
    && Number(membership.remainingUnits ?? membership.remainedLessons) > 0
    && +new Date(membership.validTo || membership.validUntil) >= now
    && (!membership.validFrom || +new Date(membership.validFrom) <= now)
}
