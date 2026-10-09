import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isSerializationFailure } from '../common/serialization-failure';
import { CashDeskPaymentDto, CashSummaryQueryDto, OpenCashShiftDto } from './dto/cash-desk.dto';
import { aggregatePaymentMethods, calculateCashChange } from './cash-desk.math';

const include = {
  client: { select: { id: true, name: true, firstName: true, lastName: true, phone: true } },
  cashier: { select: { id: true, email: true } }, service: true,
  booking: { include: { lesson: { include: { service: true } } } },
  membership: { include: { pricingPlan: true } },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class CashDeskService {
  constructor(private readonly prisma: PrismaService) {}

  private async atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(work, { isolationLevel: 'Serializable' }); }
      catch (error) { if ((isSerializationFailure(error) || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) && attempt < 4) continue; throw error; }
    }
  }

  async pay(dto: CashDeskPaymentDto, cashierId: string) {
    dto = { ...dto, cashGiven: dto.cashGiven ?? undefined };
    if (dto.bookingId && dto.membershipId) throw new BadRequestException('Выберите занятие или абонемент');
    if (dto.method !== 'CASH' && dto.cashGiven !== undefined) throw new BadRequestException('Внесённые наличные доступны только при оплате наличными');
    const requestId = dto.requestId ?? randomUUID();
    const change = calculateCashChange(dto.amount, dto.cashGiven);
    return this.atomic(async tx => {
      // Serialize retries by operation key; a lost HTTP response must not produce a second receipt.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}, 0))::text`;
      const previous = await tx.payment.findUnique({ where: { requestId }, include });
      if (previous) {
        if (previous.cashierId !== cashierId || previous.clientId !== dto.clientId || !previous.amount.equals(dto.amount)
          || previous.method !== dto.method || previous.bookingId !== (dto.bookingId ?? null)
          || previous.membershipId !== (dto.membershipId ?? null) || previous.serviceId !== (dto.serviceId ?? null)
          || previous.serviceType !== (dto.serviceType ?? null) || previous.notes !== (dto.notes?.trim() || null)
          || (previous.cashGiven?.toString() ?? null) !== (dto.cashGiven === undefined ? null : new Prisma.Decimal(dto.cashGiven).toString())) {
          throw new ConflictException('Этот ключ операции уже использован для другого платежа');
        }
        return previous;
      }
      if (!await tx.client.findUnique({ where: { id: dto.clientId } })) throw new NotFoundException('Клиент не найден');
      if (dto.serviceId && !await tx.service.findUnique({ where: { id: dto.serviceId } })) throw new NotFoundException('Услуга не найдена');
      let pendingId: string | undefined;
      if (dto.bookingId) {
        const booking = await tx.booking.findUnique({ where: { id: dto.bookingId }, include: { transactions: true } });
        if (!booking || booking.clientId !== dto.clientId) throw new BadRequestException('Занятие не принадлежит клиенту');
        if (booking.isPaid || await tx.payment.count({ where: { bookingId: booking.id, status: 'PAID' } })) throw new ConflictException('Занятие уже оплачено');
        if (booking.status.startsWith('cancelled') || booking.status === 'penalty_cancellation') throw new ConflictException('Занятие отменено');
        if (booking.transactions.some(row => row.membershipId && row.transactionType === 'usage')) throw new ConflictException('Занятие уже списано с абонемента');
        pendingId = (await tx.payment.findFirst({ where: { bookingId: booking.id, status: 'PENDING' }, orderBy: { createdAt: 'asc' } }))?.id;
      }
      if (dto.membershipId) {
        const membership = await tx.membership.findUnique({ where: { id: dto.membershipId } });
        if (!membership || membership.clientId !== dto.clientId) throw new BadRequestException('Абонемент не принадлежит клиенту');
        if (membership.status === 'frozen' || (membership.totalLessons > 0 ? membership.validUntil : membership.validTo) < new Date()) throw new ConflictException('Абонемент заморожен или истёк');
        pendingId = (await tx.payment.findFirst({ where: { membershipId: membership.id, status: 'PENDING' }, orderBy: { createdAt: 'asc' } }))?.id;
        if (membership.type === 'fixed_lessons') {
          if (await tx.payment.count({ where: { membershipId: membership.id, status: 'PAID' } })) throw new ConflictException('Абонемент уже оплачен');
          // Issuance already credits lesson units; accepting money must not credit them a second time.
          await tx.membership.update({ where: { id: membership.id }, data: { status: 'active' } });
        } else {
          await tx.membership.update({ where: { id: membership.id }, data: {
            remainingUnits: { increment: dto.amount }, initialUnits: { increment: dto.amount }, status: 'active',
          } });
        }
      }
      const shift = await tx.cashShift.findFirst({ where: { cashierId, closedAt: null } });
      const data = {
        clientId: dto.clientId, bookingId: dto.bookingId ?? null, membershipId: dto.membershipId ?? null,
        amount: new Prisma.Decimal(dto.amount), method: dto.method, cashGiven: dto.cashGiven === undefined ? null : new Prisma.Decimal(dto.cashGiven),
        cashChange: change, cashierId, shiftId: shift?.id ?? null, serviceId: dto.serviceId ?? null, serviceType: dto.serviceType ?? null,
        notes: dto.notes?.trim() || null, description: dto.notes?.trim() || null, requestId,
        status: 'PAID' as const, paidAt: new Date(),
      };
      const payment = pendingId
        ? await tx.payment.update({ where: { id: pendingId }, data, include })
        : await tx.payment.create({ data, include });
      await tx.ledgerTransaction.create({ data: {
        clientId: dto.clientId, bookingId: dto.bookingId, membershipId: dto.membershipId,
        cashDeskPaymentId: payment.id, transactionType: 'purchase', amount: data.amount,
        description: dto.notes?.trim() || 'Приём оплаты в кассе',
      } });
      if (dto.bookingId) {
        await tx.booking.update({ where: { id: dto.bookingId }, data: { isPaid: true } });
        await tx.payment.updateMany({ where: { bookingId: dto.bookingId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      }
      return payment;
    });
  }

  async summary(query: CashSummaryQueryDto) {
    const from = new Date(query.from), to = new Date(query.to);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) throw new BadRequestException('Укажите корректный период: начало раньше конца');
    const where: Prisma.PaymentWhereInput = {
      status: 'PAID', OR: [{ paidAt: { gte: from, lt: to } }, { paidAt: null, createdAt: { gte: from, lt: to } }],
      ...(query.cashierId ? { cashierId: query.cashierId } : {}), ...(query.shiftId ? { shiftId: query.shiftId } : {}),
    };
    return this.prisma.$transaction(async tx => {
      const groups = await tx.payment.groupBy({ by: ['method'], where, _sum: { amount: true }, _count: { _all: true } });
      const operations = await tx.payment.findMany({ where, include, orderBy: [{ paidAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      return { ...aggregatePaymentMethods(groups), operations, page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: 'RepeatableRead' });
  }

  currentShift(cashierId: string) { return this.prisma.cashShift.findFirst({ where: { cashierId, closedAt: null } }); }
  openShift(dto: OpenCashShiftDto, cashierId: string) {
    return this.atomic(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${cashierId}, 0))::text`;
      if (await tx.cashShift.findFirst({ where: { cashierId, closedAt: null } })) throw new ConflictException('Смена уже открыта');
      return tx.cashShift.create({ data: { cashierId, startingCash: dto.startingCash, notes: dto.notes?.trim() } });
    });
  }
  closeShift(id: string, cashierId: string) {
    return this.atomic(async tx => {
      const shift = await tx.cashShift.findFirst({ where: { id, cashierId, closedAt: null } });
      if (!shift) throw new ConflictException('Открытая смена не найдена');
      return tx.cashShift.update({ where: { id }, data: { closedAt: new Date() } });
    });
  }

  async options(clientId: string) {
    return this.prisma.$transaction(async tx => ({
      bookings: await tx.booking.findMany({ where: { clientId, isPaid: false, status: { in: ['scheduled', 'completed', 'no_show'] }, payments: { none: { status: 'PAID' } } }, include: { lesson: { include: { service: true } } }, orderBy: { startTime: 'desc' }, take: 100 }),
      memberships: await tx.membership.findMany({ where: { clientId }, include: { pricingPlan: true, payments: { select: { status: true, amount: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    }));
  }
}
