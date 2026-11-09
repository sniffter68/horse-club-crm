import type { PrismaService } from '../../prisma/prisma.service';

/** Lesson packages only: deposit balances are rubles, boarding balances are days. */
export async function activeTelegramMembership(prisma: Pick<PrismaService, 'membership'>, clientId: string, now = new Date()) {
  const row = await prisma.membership.findFirst({
    where: {
      deletedAt: null, type: 'fixed_lessons', status: 'active',
      validFrom: { lte: now }, validUntil: { gte: now }, remainedLessons: { gt: 0 },
      OR: [{ clientId }, { members: { some: { clientId } } }],
    },
    orderBy: [{ validUntil: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
    select: { id: true, title: true, serviceTitle: true, totalLessons: true, remainedLessons: true,
      validUntil: true, pricingPlan: { select: { name: true } } },
  });
  return row ? {
    id: row.id, title: row.title || row.serviceTitle || row.pricingPlan?.name || 'Абонемент',
    totalLessons: row.totalLessons, remainingLessons: row.remainedLessons,
    validUntil: row.validUntil.toISOString(),
    isExpiringSoon: row.remainedLessons <= 1 || row.validUntil.getTime() - now.getTime() <= 3 * 86_400_000,
  } : null;
}
