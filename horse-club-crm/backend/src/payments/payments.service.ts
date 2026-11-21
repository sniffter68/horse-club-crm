import { archiveTransaction } from '../common/archive-transaction';
import { randomUUID } from 'node:crypto';
import { cashShiftAt } from './cash-shift-boundary';
import { rethrowFinancialPeriod } from './financial-period-error';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import type { PaymentQueryDto } from './dto/payment-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery, type PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import type { UpdatePaymentDto } from './dto/update-payment.dto';

const paymentInclude = Prisma.validator<Prisma.PaymentDefaultArgs>()({
  include: {
    client: { select: { id: true, name: true, firstName: true, lastName: true } },
    boardingContract: { include: { horse: { select: { id: true, name: true } }, stall: { select: { id: true, name: true, number: true } } } },
    booking: { include: { lesson: { include: { service: { select: { id: true, title: true, name: true, price: true } } } } } },
    membership: { include: { pricingPlan: { select: { id: true, name: true, price: true } } } },
  },
});
export type PaymentWithRelations = Prisma.PaymentGetPayload<typeof paymentInclude>;

const bookingOptionSelect = {
  id: true,
  clientId: true,
  client: { select: { id: true, name: true, firstName: true, lastName: true } },
  lesson: { select: { id: true, startTime: true, service: { select: { id: true, title: true, name: true, price: true } } } },
} satisfies Prisma.BookingSelect;
export type BookingPaymentOption = Prisma.BookingGetPayload<{ select: typeof bookingOptionSelect }>;

type PaymentData = {
  clientId: string;
  bookingId: string | null;
  boardingContractId: string | null;
  membershipId: string | null;
  amount: number | Prisma.Decimal;
  method: CreatePaymentDto['method'];
  status: NonNullable<CreatePaymentDto['status']>;
  paidAt: Date | null;
  description: string | null;
};

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaymentQueryDto): Promise<PaginatedResult<PaymentWithRelations>> {
    const options = parseRefineQuery(query, ['id', 'amount', 'method', 'status', 'paidAt', 'createdAt', 'updatedAt'], 'createdAt');
    const where: Prisma.PaymentWhereInput = options.search ? { OR: [
      { client: { is: { OR: [
        { name: { contains: options.search, mode: 'insensitive' } },
        { firstName: { contains: options.search, mode: 'insensitive' } },
        { lastName: { contains: options.search, mode: 'insensitive' } },
      ] } } },
      { description: { contains: options.search, mode: 'insensitive' } },
      { boardingContract: { is: { horse: { is: { name: { contains: options.search, mode: 'insensitive' } } } } } },
    ] } : {};
    where.archivedAt = null;
    if (query.cashboxType) where.boardingContractId = query.cashboxType === 'BOARDING' ? { not: null } : null;
    const orderBy = { [options.sort]: options.order } as Prisma.PaymentOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({ where, include: paymentInclude.include, orderBy: [orderBy, { id: 'asc' }], skip: options.skip, take: options.take }),
    ]);
    return { total, data };
  }

  async findOne(id: string): Promise<PaymentWithRelations> {
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: paymentInclude.include });
    if (!payment) throw new NotFoundException('Платёж не найден');
    return payment;
  }

  async findBookingOptions(): Promise<BookingPaymentOption[]> {
    return this.prisma.booking.findMany({
      where: { lessonId: { not: null } },
      select: bookingOptionSelect,
      orderBy: [{ lesson: { startTime: 'desc' } }, { id: 'asc' }],
      take: 100,
    });
  }

  async create(dto: CreatePaymentDto, actor?: { id: string; email: string }): Promise<PaymentWithRelations> {
    try {
      return await archiveTransaction(this.prisma, async tx => {
        const data = await this.resolveData(dto, tx);
        if (data.status === 'PAID' && (!actor || !dto.requestId)) throw new BadRequestException('Для проведения оплаты нужны автор и ключ операции');
        if (dto.requestId) {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${dto.requestId}, 0))::text`;
          const previous = await tx.payment.findUnique({ where: { requestId: dto.requestId }, include: paymentInclude.include });
          if (previous) {
            if (previous.cashierId !== (data.status === 'PAID' ? actor?.id ?? null : null) || previous.clientId !== data.clientId || !previous.amount.equals(data.amount)
              || previous.method !== data.method || previous.status !== data.status || previous.bookingId !== data.bookingId
              || previous.membershipId !== data.membershipId || previous.boardingContractId !== data.boardingContractId
              || previous.description !== data.description || (dto.paidAt && previous.paidAt?.getTime() !== data.paidAt?.getTime())) {
              throw new ConflictException('Ключ операции уже использован для другого платежа');
            }
            return previous;
          }
        }
        const shift = data.status === 'PAID' && actor ? await cashShiftAt(tx, actor.id, data.paidAt ?? new Date()) : null;
        const payment = await tx.payment.create({ data: { ...data, requestId: dto.requestId, cashierId: data.status === 'PAID' ? actor?.id : undefined, shiftId: shift?.id }, include: paymentInclude.include });
        if (data.status === 'PAID' && actor) await this.auditReceipt(tx, payment, actor);
        return payment;
      });
    } catch (error: unknown) {
      return rethrowFinancialPeriod(error, cause => rethrowCatalogMutation(cause, 'Платёж'));
    }
  }

  async update(id: string, dto: UpdatePaymentDto, actor?: { id: string; email: string }): Promise<PaymentWithRelations> {
    try {
      return await archiveTransaction(this.prisma, async tx => {
        const current = await tx.payment.findUnique({ where: { id }, include: { refundExpense: { select: { id: true } } } });
        if (!current) throw new NotFoundException('Платёж не найден');
        if (current.archivedAt || current.cashierId || current.refundExpense || current.status === 'PAID' || current.status === 'REFUNDED' || current.status === 'CANCELLED') throw new ConflictException('Проведённый или отменённый платёж нельзя редактировать');
        const data = await this.resolveData({
          clientId: dto.clientId ?? current.clientId,
          bookingId: dto.bookingId === undefined ? current.bookingId : dto.bookingId,
          boardingContractId: dto.boardingContractId === undefined ? current.boardingContractId : dto.boardingContractId,
          membershipId: dto.membershipId === undefined ? current.membershipId : dto.membershipId,
          amount: dto.amount ?? current.amount.toNumber(),
          method: dto.method ?? current.method,
          status: dto.status ?? current.status,
          paidAt: dto.paidAt === undefined ? current.paidAt?.toISOString() ?? null : dto.paidAt,
          description: dto.description === undefined ? current.description : dto.description,
        }, tx);
        if (data.status === 'PAID' && !actor) throw new BadRequestException('Для проведения оплаты нужен автор');
        const shift = data.status === 'PAID' && actor ? await cashShiftAt(tx, actor.id, data.paidAt ?? new Date()) : null;
        const payment = await tx.payment.update({ where: { id }, data: { ...data, ...(data.status === 'PAID' ? { cashierId: actor?.id, shiftId: shift?.id } : {}) }, include: paymentInclude.include });
        if (data.status === 'PAID' && actor) await this.auditReceipt(tx, payment, actor);
        return payment;
      });
    } catch (error: unknown) {
      return rethrowFinancialPeriod(error, cause => rethrowCatalogMutation(cause, 'Платёж'));
    }
  }

  private async auditReceipt(tx: Prisma.TransactionClient, payment: PaymentWithRelations, actor: { id: string; email: string }) {
    await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: 'PAYMENT_RECEIVED', actorId: actor.id, actorName: actor.email,
      details: { paymentId: payment.id, amount: String(payment.amount), source: 'payments' } } });
  }

  async remove(id: string, actor?: { id: string; email: string }): Promise<PaymentWithRelations> {
    try {
      return await archiveTransaction(this.prisma, async tx => {
        const current = await tx.payment.findUnique({ where: { id }, include: { refundExpense: { select: { id: true } } } });
        if (current?.archivedAt || current?.cashierId || current?.refundExpense || current?.status === 'PAID' || current?.status === 'REFUNDED') throw new ConflictException('Проведённый кассовый платёж нельзя удалить');
        if (!current) throw new NotFoundException('Платёж не найден');
        if (!actor) throw new BadRequestException('Для удаления начисления нужен автор');
        await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: 'PAYMENT_DELETED', actorId: actor.id, actorName: actor.email,
          details: { paymentId: id, clientId: current.clientId, amount: String(current.amount), status: current.status, method: current.method } } });
        return await tx.payment.delete({ where: { id }, include: paymentInclude.include });
      });
    } catch (error: unknown) {
      return rethrowFinancialPeriod(error, cause => rethrowCatalogMutation(cause, 'Платёж'));
    }
  }

  private async resolveData(dto: CreatePaymentDto, tx: Prisma.TransactionClient): Promise<PaymentData> {
    const linkedRecords = [dto.bookingId, dto.boardingContractId, dto.membershipId].filter(Boolean);
    if (linkedRecords.length > 1) {
      throw new BadRequestException('Платёж можно связать только с одним основанием');
    }
    if (dto.status === PaymentStatus.PAID && (dto.bookingId || dto.membershipId)) {
      throw new ConflictException('Оплата занятия или абонемента проводится через кассу');
    }
    let clientId = dto.clientId;
    let amount = dto.amount;
    if (dto.boardingContractId) {
      const contract = await tx.boardingContract.findUnique({
        where: { id: dto.boardingContractId }, select: { clientId: true, monthlyRate: true, cancelledAt: true, status: true },
      });
      if (!contract) throw new NotFoundException('Договор постоя не найден');
      if (contract.cancelledAt || contract.status === 'TERMINATED') throw new ConflictException('Договор постоя отменён');
      if (!contract.clientId) throw new ConflictException('Клубное размещение не предусматривает начислений');
      if (clientId && clientId !== contract.clientId) throw new ConflictException('Клиент не соответствует договору постоя');
      clientId = contract.clientId;
      amount ??= contract.monthlyRate.toNumber();
    }
    if (dto.bookingId) {
      const booking = await tx.booking.findUnique({
        where: { id: dto.bookingId },
        select: { clientId: true, status: true, costAmount: true, lesson: { select: { service: { select: { price: true } } } } },
      });
      if (!booking) throw new NotFoundException('Запись на занятие не найдена');
      if (booking.status?.startsWith('cancelled')) throw new ConflictException('Занятие отменено');
      if (clientId && clientId !== booking.clientId) throw new ConflictException('Клиент не соответствует записи на занятие');
      clientId = booking.clientId;
      amount ??= booking.lesson?.service.price.toNumber() ?? booking.costAmount.toNumber();
    }
    if (dto.membershipId) {
      const membership = await tx.membership.findUnique({
        where: { id: dto.membershipId },
        select: { clientId: true, cancelledAt: true, deletedAt: true, pricingPlan: { select: { price: true } } },
      });
      if (!membership) throw new NotFoundException('Абонемент не найден');
      if (membership.cancelledAt || membership.deletedAt) throw new ConflictException('Абонемент аннулирован');
      if (!membership.clientId) throw new ConflictException('У абонемента не указан клиент');
      if (clientId && clientId !== membership.clientId) throw new ConflictException('Клиент не соответствует абонементу');
      clientId = membership.clientId;
      amount ??= membership.pricingPlan?.price.toNumber();
    }
    if (!clientId) throw new BadRequestException('Укажите клиента или выберите связанную запись');
    if (amount === undefined || amount <= 0) throw new BadRequestException('Сумма платежа должна быть больше нуля');
    const client = await tx.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new NotFoundException('Клиент не найден');
    const status = dto.status ?? PaymentStatus.PENDING;
    if (status === PaymentStatus.REFUNDED) throw new BadRequestException('Возврат проводится через отмену услуги с записью расхода');
    return {
      clientId,
      bookingId: dto.bookingId ?? null,
      boardingContractId: dto.boardingContractId ?? null,
      membershipId: dto.membershipId ?? null,
      amount,
      method: dto.method,
      status,
      paidAt: dto.paidAt ? this.date(dto.paidAt) : status === PaymentStatus.PAID ? new Date() : null,
      description: dto.description?.trim() || null,
    };
  }

  private date(value: string): Date {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException('Некорректная дата оплаты');
    return date;
  }
}
