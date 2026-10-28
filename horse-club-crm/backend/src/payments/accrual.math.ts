import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function membershipLessonPrice(totalPrice: Prisma.Decimal.Value, totalLessons: number) {
  const total = new Prisma.Decimal(totalPrice);
  if (!Number.isInteger(totalLessons) || totalLessons < 1 || !total.isFinite() || total.lt(0)) {
    throw new BadRequestException('Укажите стоимость и положительное число занятий');
  }
  return total.div(totalLessons).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

// The first recognized lesson absorbs rounding; later lessons use the unit price.
export function membershipDeferred(total: Prisma.Decimal.Value, price: Prisma.Decimal.Value, remaining: number, totalLessons?: number) {
  if (remaining === totalLessons) return new Prisma.Decimal(total);
  return Prisma.Decimal.min(new Prisma.Decimal(total), new Prisma.Decimal(price).mul(Math.max(0, remaining)));
}
