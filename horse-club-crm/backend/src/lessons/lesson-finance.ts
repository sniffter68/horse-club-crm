import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, type PaymentMethod } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { defaultModuleAccess } from '../settings/module-access.service';

export function money(value: Prisma.Decimal.Value): Prisma.Decimal {
  const result = new Prisma.Decimal(value);
  if (!result.isFinite() || result.isNegative() || result.decimalPlaces() > 2 || result.gt('9999999999.99')) {
    throw new BadRequestException('Укажите неотрицательную сумму с точностью до копеек');
  }
  return result;
}

export function paymentStatus(cost: Prisma.Decimal, paid: Prisma.Decimal) {
  return paid.gte(cost) ? 'PAID' as const : paid.gt(0) ? 'PARTIALLY_PAID' as const : 'UNPAID' as const;
}

export async function postLessonReceipt(tx: Prisma.TransactionClient, actor: AuthUser | undefined,
  booking: { id: string; clientId: string }, serviceId: string, amount: Prisma.Decimal,
  method: PaymentMethod | undefined, description: string, category: 'LESSON_PREPAYMENT' | 'LESSON_PAYMENT') {
  if (!method || !['CASH', 'CARD'].includes(method)) throw new BadRequestException('Выберите наличные или карту');
  if (!actor) throw new ForbiddenException('Для приёма оплаты требуется пользователь');
  const settings = await tx.clubModuleSettings.findUnique({ where: { module: 'CASHBOX' } });
  if (settings?.isEnabled === false) return;
  if (actor.role !== 'ADMIN') {
    const permission = await tx.roleModulePermission.findUnique({ where: { role_module: { role: actor.role, module: 'CASHBOX' } } });
    if ((permission?.accessLevel ?? defaultModuleAccess(actor.role, 'CASHBOX')) !== 'FULL') {
      throw new ForbiddenException('Для приёма оплаты требуется полный доступ к кассе');
    }
  }
  const shift = await tx.cashShift.findFirst({ where: { cashierId: actor.id, closedAt: null } });
  const payment = await tx.payment.create({ data: {
    clientId: booking.clientId, bookingId: booking.id, serviceId, amount, method,
    status: 'PAID', paidAt: new Date(), cashierId: actor.id, shiftId: shift?.id,
    serviceType: category, description,
  } });
  await tx.ledgerTransaction.create({ data: {
    clientId: booking.clientId, bookingId: booking.id, cashDeskPaymentId: payment.id,
    transactionType: 'purchase', amount, description,
  } });
}
