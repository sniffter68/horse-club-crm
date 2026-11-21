import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export async function cashShiftAt(tx: Prisma.TransactionClient, cashierId: string, at: Date) {
  const closed = await tx.cashShift.findFirst({ where: { cashierId, archivedAt: null, openedAt: { lte: at }, closedAt: { gte: at } } });
  if (closed) throw new ConflictException('Нельзя изменить проводки закрытой смены');
  return tx.cashShift.findFirst({ where: { cashierId, archivedAt: null, openedAt: { lte: at }, closedAt: null } });
}
