import { Prisma, type TrainerPayScheme } from '@prisma/client';

// The established club default; legacy individual rates remain untouched.
export const CLUB_TRAINER_PERCENT = 30;
export type TrainerPay = { payScheme?: TrainerPayScheme; fixedPay?: Prisma.Decimal.Value; commissionPercent?: Prisma.Decimal.Value };
export function lessonPay(price: Prisma.Decimal.Value, rate: TrainerPay): Prisma.Decimal {
  if (rate.payScheme === 'FIXED') return new Prisma.Decimal(rate.fixedPay ?? 0);
  return new Prisma.Decimal(price).mul(rate.payScheme === 'CLUB' ? CLUB_TRAINER_PERCENT : rate.commissionPercent ?? CLUB_TRAINER_PERCENT).div(100);
}
