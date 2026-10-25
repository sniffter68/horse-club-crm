import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { defaultModuleAccess } from '../settings/module-access.service';
import type { CancelServiceDto } from './dto/cancel-service.dto';

export type RefundSource = 'lessons' | 'memberships' | 'boarding-contracts';

// Both preview and commit use the same database calculation. Never trust a UI amount.
export async function serviceRefundQuote(tx: Prisma.TransactionClient, source: RefundSource, id: string) {
  let where: Prisma.PaymentWhereInput;
  let cap: Prisma.Decimal | undefined;
  let paidFraction: Prisma.Decimal | undefined;
  let cancelled = false;
  let label: string;
  if (source === 'lessons') {
    const lesson = await tx.lesson.findUnique({ where: { id }, include: { bookings: { include: { client: true } } } });
    if (!lesson) throw new NotFoundException('Занятие не найдено');
    cancelled = Boolean(lesson.cancelledAt);
    where = { booking: { lessonId: id } };
    label = `Возврат за отмену тренировки ${lesson.startTime.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} / ${lesson.bookings.map(b => b.client.name).join(', ')}`;
  } else if (source === 'memberships') {
    const membership = await tx.membership.findUnique({ where: { id }, include: { client: true, pricingPlan: true } });
    if (!membership) throw new NotFoundException('Абонемент не найден');
    cancelled = Boolean(membership.cancelledAt || membership.deletedAt);
    where = { membershipId: id };
    // Fixed visits are priced against the full sale price, capped by actual receipts.
    // Deposit units already represent money; unused deposits are returned at face value.
    if (membership.type === 'fixed_lessons') {
      const price = membership.totalPrice ?? (membership.pricePerLesson ? membership.pricePerLesson.mul(membership.totalLessons) : membership.pricingPlan?.price);
      paidFraction = membership.totalLessons > 0 ? Prisma.Decimal.min(1, new Prisma.Decimal(Math.max(0, membership.remainedLessons)).div(membership.totalLessons)) : new Prisma.Decimal(0);
      if (price) cap = price.mul(paidFraction).toDecimalPlaces(2);
    } else cap = Prisma.Decimal.max(0, membership.remainingUnits);
    label = `Возврат за аннулирование абонемента / ${membership.client?.name ?? id}`;
  } else {
    const contract = await tx.boardingContract.findUnique({ where: { id }, include: { client: true } });
    if (!contract) throw new NotFoundException('Договор постоя не найден');
    cancelled = Boolean(contract.cancelledAt || contract.status === 'TERMINATED');
    where = { boardingContractId: id };
    // Receipts have no paid service period: refund the actual payment, not invented days.
    label = `Возврат за отмену постоя / ${contract.client?.name ?? id}`;
  }
  const payments = await tx.payment.findMany({ where: { ...where, status: 'PAID', refundExpense: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const paid = payments.reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
  const amount = cancelled ? new Prisma.Decimal(0) : Prisma.Decimal.min(paid, cap ?? paid.mul(paidFraction ?? 1).toDecimalPlaces(2));
  const methods = new Set(payments.map(p => p.method === 'CASH' ? 'CASH' : p.method === 'UNSPECIFIED' ? 'UNKNOWN' : 'BANK'));
  const refundMethod = methods.size === 1 && !methods.has('UNKNOWN') ? [...methods][0] as 'CASH' | 'BANK' : undefined;
  return { amount, paid, refundMethod, cancelled, label, payments, where };
}

export async function refundService(tx: Prisma.TransactionClient, source: RefundSource, id: string,
  dto: Partial<CancelServiceDto> | undefined, actor: AuthUser | undefined) {
  const quote = await serviceRefundQuote(tx, source, id);
  if (quote.cancelled) return;
  if (!actor) throw new ForbiddenException('Для отмены требуется пользователь');
  if (quote.paid.gt(0) && typeof dto?.refund !== 'boolean') throw new BadRequestException('Укажите, требуется ли возврат оплаченной услуги');
  if (dto?.refund && quote.amount.gt(0)) {
    if (actor.role !== 'ADMIN') {
      const permission = await tx.roleModulePermission.findUnique({ where: { role_module: { role: actor.role, module: 'CASHBOX' } } });
      if ((permission?.accessLevel ?? defaultModuleAccess(actor.role, 'CASHBOX')) !== 'FULL') throw new ForbiddenException('Для возврата требуется полный доступ к кассе');
    }
    const method = dto.refundMethod ?? quote.refundMethod;
    if (!method) throw new BadRequestException('Выберите способ возврата для смешанной или неизвестной оплаты');
    const shift = await tx.cashShift.findFirst({ where: { cashierId: actor.id, closedAt: null, archivedAt: null } });
    let remaining = quote.amount;
    for (const payment of quote.payments) {
      const amount = Prisma.Decimal.min(remaining, payment.amount);
      if (amount.lte(0)) break;
      await tx.expense.create({ data: { amount, operationType: 'REFUND', paymentMethod: method === 'CASH' ? 'CASH' : 'CARD', category: 'OTHER',
        description: `${quote.label}${dto.reason?.trim() ? `: ${dto.reason.trim()}` : ''}`.slice(0, 500),
        refundPaymentId: payment.id, createdById: actor.id, shiftId: shift?.id } });
      remaining = remaining.minus(amount);
    }
  }
  await tx.payment.updateMany({ where: { ...quote.where, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: 'SERVICE_CANCELLED', actorId: actor.id, actorName: actor.email,
    details: { source, id, refund: Boolean(dto?.refund), amount: dto?.refund ? quote.amount.toFixed(2) : '0.00',
      retained: dto?.refund ? quote.paid.minus(quote.amount).toFixed(2) : quote.paid.toFixed(2),
      reason: dto?.reason?.trim() || 'Причина не указана', refundMethod: dto?.refundMethod ?? quote.refundMethod ?? null } } });
}
