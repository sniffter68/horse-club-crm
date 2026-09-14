import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery, type PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import type { UpdatePaymentDto } from './dto/update-payment.dto';

const paymentInclude = Prisma.validator<Prisma.PaymentDefaultArgs>()({
  include: {
    client: { select: { id: true, name: true, firstName: true, lastName: true } },
    boardingContract: { include: { horse: { select: { id: true, name: true } }, stall: { select: { id: true, name: true } } } },
    booking: { include: { lesson: { include: { service: { select: { id: true, title: true, name: true, price: true } } } } } },
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
  amount: number | Prisma.Decimal;
  method: CreatePaymentDto['method'];
  status: NonNullable<CreatePaymentDto['status']>;
  paidAt: Date | null;
  description: string | null;
};

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: RefineQueryDto): Promise<PaginatedResult<PaymentWithRelations>> {
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
      select: bookingOptionSelect,
      orderBy: [{ lesson: { startTime: 'desc' } }, { id: 'asc' }],
      take: 100,
    });
  }

  async create(dto: CreatePaymentDto): Promise<PaymentWithRelations> {
    try {
      const data = await this.resolveData(dto);
      return await this.prisma.payment.create({ data, include: paymentInclude.include });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Платёж');
    }
  }

  async update(id: string, dto: UpdatePaymentDto): Promise<PaymentWithRelations> {
    try {
      const current = await this.prisma.payment.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Платёж не найден');
      const data = await this.resolveData({
        clientId: dto.clientId ?? current.clientId,
        bookingId: dto.bookingId === undefined ? current.bookingId : dto.bookingId,
        boardingContractId: dto.boardingContractId === undefined ? current.boardingContractId : dto.boardingContractId,
        amount: dto.amount ?? current.amount.toNumber(),
        method: dto.method ?? current.method,
        status: dto.status ?? current.status,
        paidAt: dto.paidAt === undefined ? current.paidAt?.toISOString() ?? null : dto.paidAt,
        description: dto.description === undefined ? current.description : dto.description,
      });
      return await this.prisma.payment.update({ where: { id }, data, include: paymentInclude.include });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Платёж');
    }
  }

  async remove(id: string): Promise<PaymentWithRelations> {
    try {
      return await this.prisma.payment.delete({ where: { id }, include: paymentInclude.include });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Платёж');
    }
  }

  private async resolveData(dto: CreatePaymentDto): Promise<PaymentData> {
    if (dto.bookingId && dto.boardingContractId) {
      throw new BadRequestException('Платёж нельзя одновременно связать с занятием и договором постоя');
    }
    let clientId = dto.clientId;
    let amount = dto.amount;
    if (dto.boardingContractId) {
      const contract = await this.prisma.boardingContract.findUnique({
        where: { id: dto.boardingContractId }, select: { clientId: true, monthlyRate: true },
      });
      if (!contract) throw new NotFoundException('Договор постоя не найден');
      if (clientId && clientId !== contract.clientId) throw new ConflictException('Клиент не соответствует договору постоя');
      clientId = contract.clientId;
      amount ??= contract.monthlyRate.toNumber();
    }
    if (dto.bookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: dto.bookingId },
        select: { clientId: true, lesson: { select: { service: { select: { price: true } } } } },
      });
      if (!booking) throw new NotFoundException('Запись на занятие не найдена');
      if (clientId && clientId !== booking.clientId) throw new ConflictException('Клиент не соответствует записи на занятие');
      clientId = booking.clientId;
      amount ??= booking.lesson.service.price.toNumber();
    }
    if (!clientId) throw new BadRequestException('Укажите клиента или выберите связанную запись');
    if (amount === undefined || amount <= 0) throw new BadRequestException('Сумма платежа должна быть больше нуля');
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new NotFoundException('Клиент не найден');
    const status = dto.status ?? PaymentStatus.PENDING;
    return {
      clientId,
      bookingId: dto.bookingId ?? null,
      boardingContractId: dto.boardingContractId ?? null,
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
