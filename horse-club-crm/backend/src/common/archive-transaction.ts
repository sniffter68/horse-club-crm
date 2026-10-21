import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { isSerializationFailure } from './serialization-failure';

/** Retry the complete history check and mutation, never a stale delete decision. */
export async function archiveTransaction<T>(prisma: PrismaService, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (isSerializationFailure(error)) {
        if (attempt < 4) continue;
        throw new ConflictException('История изменилась. Обновите карточку и повторите действие');
      }
      throw error;
    }
  }
}
