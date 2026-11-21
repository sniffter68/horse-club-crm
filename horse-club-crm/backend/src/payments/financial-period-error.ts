import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// DB triggers are the final authority, including writers racing with closing.
export function rethrowFinancialPeriod(error: unknown, fallback?: (error: unknown) => never): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && /Финансовый период закрыт|Финансовый месяц закрыт/.test(JSON.stringify(error.meta))) {
    throw new ConflictException('Финансовый период закрыт. Изменение проводок запрещено');
  }
  if (fallback) return fallback(error);
  throw error;
}
