import { MembershipStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/** Lesson packages only: deposit balances are rubles, boarding balances are days. */
export async function activeTelegramMembership(prisma: Pick<PrismaService, 'membership'>, clientId: string, now = new Date()) {
  const row = await prisma.membership.findFirst({
    where: {
      deletedAt: null, type: 'fixed_lessons',
      // Match supported enum spellings without passing invalid values to Prisma.
      status: { in: Object.values(MembershipStatus).filter(status => status.toLowerCase() === 'active') },
      validFrom: { lte: now }, validUntil: { gte: now }, remainedLessons: { gt: 0 },
      OR: [{ clientId }, { members: { some: { clientId } } }],
    },
    orderBy: [{ validUntil: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    select: { id: true, title: true, serviceTitle: true, totalLessons: true, remainedLessons: true,
      validUntil: true, status: true, pricingPlan: { select: { name: true, lessonsCount: true } } },
  });
  return row ? {
    id: row.id, title: row.title || row.serviceTitle || row.pricingPlan?.name || 'Абонемент',
    totalLessons: row.pricingPlan?.lessonsCount ?? row.remainedLessons,
    remainedLessons: row.remainedLessons, remainingLessons: row.remainedLessons,
    status: row.status, planName: row.pricingPlan?.name ?? 'Абонемент',
    validUntil: row.validUntil.toISOString(),
    isExpiringSoon: row.remainedLessons <= 1 || row.validUntil.getTime() - now.getTime() <= 3 * 86_400_000,
  } : null;
}
