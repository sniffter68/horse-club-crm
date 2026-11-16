import type { Prisma } from '@prisma/client';

// Call only for performed procedures, inside the transaction locking the horse.
export async function applyCastration(tx: Prisma.TransactionClient, horseId: string, type: string) {
  if (type === 'CASTRATION') {
    await tx.horse.updateMany({ where: { id: horseId, sex: 'STALLION' }, data: { sex: 'GELDING' } });
  }
}
