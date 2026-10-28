export function deferredBalance(membership: { deletedAt?: string | null; totalPrice?: string | number;
  pricePerLesson?: string | number; remainedLessons: number; totalLessons: number }): number | undefined {
  if (membership.deletedAt || membership.pricePerLesson == null || membership.totalPrice == null) return undefined
  const totalCents = Math.round(Number(membership.totalPrice) * 100)
  if (membership.remainedLessons === membership.totalLessons) return totalCents / 100
  const unitCents = Math.round(Number(membership.pricePerLesson) * 100)
  return Math.min(totalCents, Math.max(0, membership.remainedLessons) * unitCents) / 100
}
