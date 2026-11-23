import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, type Payment } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { UpdatePaymentDto } from './dto/update-payment.dto';
import { cashShiftAt } from './cash-shift-boundary';
import { paymentStatus } from '../lessons/lesson-finance';

export async function correctPayment(tx: Prisma.TransactionClient, current: Payment, dto: UpdatePaymentDto, actor?: { id: string; email: string }) {
  if (!actor) throw new BadRequestException('Для исправления оплаты нужен автор');
  for (const key of ['clientId', 'bookingId', 'membershipId', 'boardingContractId', 'status', 'requestId'] as const) {
    if (dto[key] !== undefined && dto[key] !== current[key]) throw new BadRequestException('Можно изменить только способ, сумму, дату и комментарий оплаты');
  }
  if (dto.paidAt === null || dto.method === 'UNSPECIFIED') throw new BadRequestException('Укажите дату и способ оплаты');
  const paidAt = dto.paidAt ? new Date(dto.paidAt) : current.paidAt ?? current.createdAt;
  if (!Number.isFinite(+paidAt) || paidAt > new Date()) throw new BadRequestException('Дата оплаты не может быть в будущем');
  if (current.shiftId) {
    // Row lock prevents a concurrent close from racing with this correction.
    await tx.$queryRaw`SELECT id FROM "CashShift" WHERE id = ${current.shiftId}::uuid FOR UPDATE`;
    const shift = await tx.cashShift.findUnique({ where: { id: current.shiftId } });
    if (!shift || shift.closedAt || shift.archivedAt) throw new ConflictException('Нельзя изменить оплату закрытой смены');
  }
  const cashierId = current.cashierId ?? actor.id;
  await cashShiftAt(tx, cashierId, current.paidAt ?? current.createdAt);
  const shift = await cashShiftAt(tx, cashierId, paidAt);
  const amount = new Prisma.Decimal(dto.amount ?? current.amount);
  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) throw new BadRequestException('Укажите положительную сумму с точностью до копеек');
  const difference = amount.minus(current.amount);
  const payment = await tx.payment.update({ where: { id: current.id }, data: {
    amount, method: dto.method ?? current.method, paidAt, shiftId: shift?.id ?? null,
    description: dto.description === undefined ? current.description : dto.description?.trim() || null,
    ...(dto.description !== undefined ? { notes: dto.description?.trim() || null } : {}),
    ...(!difference.isZero() || (dto.method !== undefined && dto.method !== current.method) ? { cashGiven: null, cashChange: null } : {}),
  }, include: {
    client: { select: { id: true, name: true, firstName: true, lastName: true } },
    boardingContract: { include: { horse: { select: { id: true, name: true } }, stall: { select: { id: true, name: true, number: true } } } },
    booking: { include: { lesson: { include: { service: { select: { id: true, title: true, name: true, price: true } } } } } },
    membership: { include: { pricingPlan: { select: { id: true, name: true, price: true } } } },
  } });
  // Boarding account compensation is appended by Payment_boarding_ledger in PostgreSQL.
  if (!current.boardingContractId && !difference.isZero()) {
    const ledger = await tx.ledgerTransaction.findUnique({ where: { cashDeskPaymentId: current.id } });
    if (ledger) await tx.ledgerTransaction.create({ data: { clientId: current.clientId, bookingId: current.bookingId,
      sourcePaymentId: current.id, transactionType: 'purchase', amount: difference, description: 'Корректировка оплаты' } });
  }
  if (!current.bookingId && !current.membershipId && !current.boardingContractId && current.serviceId
    && (!difference.isZero() || +paidAt !== +(current.paidAt ?? current.createdAt))) {
    // Append compensations; never rewrite immutable recognized revenue.
    for (const [value, at] of [[current.amount.negated(), current.paidAt ?? current.createdAt], [amount, paidAt]] as const) {
      await tx.revenueRecognition.create({ data: { sourcePaymentId: current.id, type: `PAYMENT_CORRECTION:${randomUUID()}`,
        amount: value, recognizedAt: at, createdById: actor.id } });
    }
  }
  if (current.bookingId) {
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: current.bookingId } });
    const receipts = await tx.payment.aggregate({ where: { bookingId: booking.id, status: 'PAID', archivedAt: null }, _sum: { amount: true } });
    // Legacy cash-desk bookings may only have receipts and isPaid, without payment snapshots.
    const originalFinal = Prisma.Decimal.max(booking.finalPaymentAmount,
      new Prisma.Decimal(receipts._sum.amount ?? 0).minus(difference).minus(booking.prepaymentAmount));
    const prepayment = current.serviceType === 'LESSON_PREPAYMENT';
    const prepaymentAmount = prepayment ? booking.prepaymentAmount.plus(difference) : booking.prepaymentAmount;
    const finalPaymentAmount = prepayment ? originalFinal : originalFinal.plus(difference);
    if (prepaymentAmount.lt(0) || finalPaymentAmount.lt(0) || prepaymentAmount.plus(finalPaymentAmount).gt(booking.costAmount)) {
      throw new BadRequestException('Исправленная сумма не соответствует стоимости и оплатам занятия');
    }
    await tx.booking.update({ where: { id: booking.id }, data: { prepaymentAmount, finalPaymentAmount,
      ...(prepayment ? { prepaymentMethod: payment.method } : { finalPaymentMethod: payment.method }),
      isPaid: prepaymentAmount.plus(finalPaymentAmount).gte(booking.costAmount) } });
    if (booking.lessonId) {
      const bookings = await tx.booking.findMany({ where: { lessonId: booking.lessonId } });
      const cost = bookings.reduce((sum, row) => sum.plus(row.costAmount), new Prisma.Decimal(0));
      const prepaid = bookings.reduce((sum, row) => sum.plus(row.prepaymentAmount), new Prisma.Decimal(0));
      const final = bookings.reduce((sum, row) => sum.plus(row.finalPaymentAmount), new Prisma.Decimal(0));
      await tx.lesson.update({ where: { id: booking.lessonId }, data: { prepaymentAmount: prepaid, finalPaymentAmount: final,
        paymentStatus: paymentStatus(cost, prepaid.plus(final)), ...(prepayment ? { prepaymentMethod: payment.method } : { finalPaymentMethod: payment.method }) } });
    }
  }
  if (current.membershipId && !difference.isZero()) {
    const membership = await tx.membership.findUniqueOrThrow({ where: { id: current.membershipId } });
    if (membership.type === 'deposit') {
      if (membership.remainingUnits.plus(difference).lt(0)) throw new ConflictException('Средства абонемента уже использованы');
      await tx.membership.update({ where: { id: membership.id }, data: { remainingUnits: { increment: difference }, initialUnits: { increment: difference } } });
    }
  }
  const snapshot = (row: Payment) => ({ amount: row.amount.toString(), method: row.method,
    paidAt: row.paidAt?.toISOString() ?? null, description: row.description, notes: row.notes,
    cashGiven: row.cashGiven?.toString() ?? null, cashChange: row.cashChange?.toString() ?? null, shiftId: row.shiftId });
  await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: 'PAYMENT_CORRECTED', actorId: actor.id,
    actorName: actor.email, details: { paymentId: current.id, before: snapshot(current), after: snapshot(payment) } } });
  return payment;
}
