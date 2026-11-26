import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export const trainerLockedMessage = 'Тренер зафиксирован после оплаты. Сначала отмените или верните оплату занятия';

export async function assertTrainerUnlocked(tx: Prisma.TransactionClient, bookingIds: string[], completed: boolean) {
  if (completed || await tx.booking.count({ where: { id: { in: bookingIds }, OR: [
    { isPaid: true }, { prepaymentAmount: { gt: 0 } }, { finalPaymentAmount: { gt: 0 } },
    { payments: { some: { status: 'PAID', archivedAt: null } } },
  ] } })) throw new BadRequestException(trainerLockedMessage);
}
