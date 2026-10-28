import { membershipLessonPrice } from '../payments/accrual.math';
import { refundService, serviceRefundQuote } from '../payments/service-refund';
import type { CancelServiceDto } from '../payments/dto/cancel-service.dto';
import { createHash, randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import type { AuthUser } from '../auth/auth.types';
import { defaultModuleAccess } from '../settings/module-access.service';
import { isSerializationFailure } from '../common/serialization-failure';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ArchiveQueryDto } from '../common/dto/archive-query.dto';
import { archiveTransaction } from '../common/archive-transaction';
import { parseRefineQuery, type PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateMembershipDto } from './dto/create-membership.dto';

const membershipInclude = { client: true, pricingPlan: true, members: { include: { client: { select: { id: true, name: true, firstName: true, lastName: true } } } } } satisfies Prisma.MembershipInclude;
const membershipDetailsInclude = {
  ...membershipInclude,
  _count: { select: { members: true, bookings: true, payments: true, transactions: true, operations: true } },
  operations: {
    orderBy: { createdAt: 'desc' as const },
    include: { lesson: { include: { service: true, trainer: true, arena: true } } },
  },
  bookings: {
    where: { lessonId: { not: null } },
    orderBy: [{ lesson: { startTime: 'desc' as const } }, { id: 'asc' as const }],
    include: {
      horse: { select: { id: true, name: true } },
      lesson: {
        include: {
          service: { select: { id: true, title: true, name: true } },
          trainer: { select: { id: true, name: true } },
          arena: { select: { id: true, name: true } },
        },
      },
    },
  },
  payments: {
    select: { id: true, amount: true, status: true, paidAt: true, description: true, createdAt: true },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.MembershipInclude;
type MembershipRecord = Prisma.MembershipGetPayload<{ include: typeof membershipInclude }>;
type MembershipDetails = Prisma.MembershipGetPayload<{ include: typeof membershipDetailsInclude }>;
export type MembershipResponse = MembershipRecord & { isActive: boolean };

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);
  constructor(private readonly prisma: PrismaService) {}

  refundQuote(id: string) { return this.prisma.$transaction(tx => serviceRefundQuote(tx, 'memberships', id)).then(({ amount, refundMethod, cancelled }) => ({ amount, refundMethod, cancelled })); }

  async findAll(query: ArchiveQueryDto): Promise<PaginatedResult<MembershipResponse>> {
    const options = parseRefineQuery(query, ['id', 'totalLessons', 'remainedLessons', 'validUntil', 'createdAt', 'updatedAt'], 'createdAt');
    const where: Prisma.MembershipWhereInput = options.search ? {
      client: { is: { OR: [
        { name: { contains: options.search, mode: 'insensitive' } },
        { firstName: { contains: options.search, mode: 'insensitive' } },
        { lastName: { contains: options.search, mode: 'insensitive' } },
      ] } },
    } : {};
    if (query.archivedOnly) where.deletedAt = { not: null };
    else if (!query.includeArchived) where.deletedAt = null;
    const orderBy = { [options.sort]: options.order } as Prisma.MembershipOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.membership.count({ where }),
      this.prisma.membership.findMany({ where, include: membershipInclude, orderBy: [orderBy, { id: 'asc' }], skip: options.skip, take: options.take }),
    ]);
    return { total, data: data.map((membership) => this.withActive(membership)) };
  }

  async findOne(id: string): Promise<MembershipDetails & { isActive: boolean; recognizedRevenue: Prisma.Decimal }> {
    const membership = await this.prisma.membership.findUnique({ where: { id }, include: membershipDetailsInclude });
    if (!membership) throw new NotFoundException('Membership not found');
    const revenue = await this.prisma.revenueRecognition.aggregate({ where: { membershipId: id }, _sum: { amount: true } });
    return { ...this.withActive(membership), recognizedRevenue: revenue._sum.amount ?? new Prisma.Decimal(0) };
  }

  async create(dto: CreateMembershipDto, actor: AuthUser): Promise<MembershipResponse> {
    const fingerprint = createHash('sha256').update(JSON.stringify([
      actor.id, dto.clientId, dto.serviceId, dto.pricingPlanId, dto.totalLessons,
      dto.validUntil, dto.pricePerLesson, dto.totalPrice, dto.paymentMethod, dto.reason?.trim(),
    ])).digest('hex');
    for (let attempt = 0; ; attempt++) {
      let stage = 'transaction.start';
      try {
        return await this.prisma.$transaction(async tx => {
          if (dto.requestId) {
            stage = 'idempotency.lock';
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${dto.requestId}, 0))::text`;
            stage = 'idempotency.lookup';
            const previous = await tx.membership.findUnique({ where: { saleRequestId: dto.requestId }, include: membershipInclude });
            if (previous) {
              if (previous.saleFingerprint !== fingerprint) throw new ConflictException('Ключ продажи уже использован с другими данными');
              return this.withActive(previous);
            }
          }
          stage = 'cashbox.settings';
          const cashbox = await tx.clubModuleSettings.findUnique({ where: { module: 'CASHBOX' } });
          const cashboxEnabled = cashbox?.isEnabled ?? true;
          if (cashboxEnabled && actor.role !== 'ADMIN') {
            stage = 'cashbox.permissions';
            const permission = await tx.roleModulePermission.findUnique({ where: { role_module: { role: actor.role, module: 'CASHBOX' } } });
            if ((permission?.accessLevel ?? defaultModuleAccess(actor.role, 'CASHBOX')) !== 'FULL')
              throw new ForbiddenException('Для продажи с оплатой требуется полный доступ к кассе');
          }
          stage = 'client.lookup';
          const client = await tx.client.findUnique({ where: { id: dto.clientId }, select: { id: true, deletedAt: true } });
          if (client?.deletedAt) throw new BadRequestException('Сначала восстановите клиента из архива');
          if (!client) throw new NotFoundException('Клиент не найден');
          stage = 'pricingPlan.lookup';
          const plan = dto.pricingPlanId ? await tx.pricingPlan.findUnique({ where: { id: dto.pricingPlanId } }) : null;
          if (dto.pricingPlanId && !plan) throw new NotFoundException('Тариф не найден');
          stage = 'service.lookup';
          const service = dto.serviceId ? await tx.service.findUnique({ where: { id: dto.serviceId } }) : null;
          if (dto.serviceId && !service) throw new NotFoundException('Услуга не найдена');
          if (service && !service.allowMembership) throw new BadRequestException('Услуга недоступна по абонементу');
          const totalLessons = dto.totalLessons ?? plan?.totalLessons;
          if (!totalLessons || !Number.isInteger(totalLessons) || totalLessons < 1 || totalLessons > 10000)
            throw new BadRequestException('Укажите количество занятий от 1 до 10000');
          const validUntil = dto.validUntil ? new Date(dto.validUntil) : plan ? this.addDays(plan.validDays) : null;
          if (!validUntil || !Number.isFinite(validUntil.getTime()) || validUntil <= new Date())
            throw new BadRequestException('Укажите будущую дату окончания');
          stage = 'sale.validation';
          const basePrice = service?.price ?? dto.pricePerLesson ?? (plan ? new Prisma.Decimal(plan.price).div(totalLessons).toDecimalPlaces(2) : undefined);
          if (basePrice === undefined) throw new BadRequestException('Выберите услугу или укажите базовую цену');
          const pricePerLesson = membershipLessonPrice(dto.totalPrice, totalLessons);
          const totalPrice = new Prisma.Decimal(dto.totalPrice);
          if ([pricePerLesson, totalPrice].some(price => !price.isFinite() || price.lt(0) || price.decimalPlaces() > 2 || price.gt('9999999999.99')))
            throw new BadRequestException('Укажите корректную стоимость с точностью до копеек');
          if (!['CASH', 'CARD'].includes(dto.paymentMethod)) throw new BadRequestException('Выберите наличную или безналичную оплату');
          const title = service?.title || service?.name || plan?.name || 'Индивидуальный абонемент';
          const description = `Оплата абонемента: ${title} (${totalLessons} зан.)`;
          const creditId = randomUUID();
          const creditReason = dto.reason?.trim() || 'Выдача абонемента';
          stage = 'membership.create';
          const membership = await tx.membership.create({ data: {
            clientId: client.id, pricingPlanId: plan?.id, serviceId: service?.id, serviceTitle: title,
            title, status: 'active', totalLessons, remainedLessons: totalLessons, initialUnits: totalLessons, remainingUnits: totalLessons,
            validUntil, validTo: validUntil, pricePerLesson, totalPrice, paymentMethod: dto.paymentMethod,
            saleRequestId: dto.requestId, saleFingerprint: fingerprint, soldById: actor.id, cashboxPosted: cashboxEnabled,
            operations: { create: { id: creditId, type: 'CREDIT', amount: totalLessons, reason: creditReason } },
          }, include: membershipInclude });
          // MembershipOp_project_ledger projects CREDIT inside this transaction.
          // Inserting it again violates LedgerTransaction_sourceMembershipOpId_key.
          if (cashboxEnabled) {
            stage = 'cashbox.shift';
            const shift = await tx.cashShift.findFirst({ where: { cashierId: actor.id, closedAt: null } });
            stage = 'cashbox.payment.create';
            const payment = await tx.payment.create({ data: {
              clientId: client.id, membershipId: membership.id, serviceId: service?.id,
              amount: totalPrice, method: dto.paymentMethod, status: 'PAID', paidAt: new Date(),
              cashierId: actor.id, shiftId: shift?.id, serviceType: 'MEMBERSHIP', description,
            } });
            stage = 'cashbox.ledger.create';
            await tx.ledgerTransaction.create({ data: {
              clientId: client.id, membershipId: membership.id, cashDeskPaymentId: payment.id,
              transactionType: 'purchase', amount: totalPrice, description,
            } });
          }
          stage = 'transaction.commit';
          return this.withActive(membership);
        }, { isolationLevel: 'Serializable' });
      } catch (error) {
        if (error instanceof HttpException) throw error;
        const known = error instanceof Prisma.PrismaClientKnownRequestError ? error : undefined;
        const target = known?.meta?.target;
        const duplicateRequest = dto.requestId && known?.code === 'P2002' && Array.isArray(target) && target.includes('saleRequestId');
        if ((isSerializationFailure(error) || duplicateRequest) && attempt < 4) continue;
        this.logger.error({ event: 'membership_sale_failed', stage, attempt: attempt + 1,
          requestId: dto.requestId, actorId: actor.id, clientId: dto.clientId,
          prismaCode: known?.code, prismaMeta: known?.meta,
          error: error instanceof Error ? error.message : String(error),
        }, error instanceof Error ? error.stack : undefined);
        const rolledBack = { details: { rollbackConfirmed: true } };
        if (known?.code === 'P2002') throw new ConflictException({ ...rolledBack, code: 'MEMBERSHIP_SALE_CONFLICT', message: 'Конфликт данных продажи. Обновите страницу и повторите оформление.' });
        if (known?.code === 'P2003' || known?.code === 'P2025') throw new ConflictException({ ...rolledBack, code: 'MEMBERSHIP_SALE_REFERENCE_CHANGED', message: 'Данные клиента, услуги или кассира изменились. Обновите страницу и выберите их заново.' });
        if (known?.code === 'P2021' || known?.code === 'P2022') throw new ServiceUnavailableException({ ...rolledBack, code: 'MEMBERSHIP_SCHEMA_OUTDATED', message: 'База данных не обновлена. Администратору нужно применить миграции и перезапустить сервер.' });
        if (isSerializationFailure(error)) throw new ConflictException({ ...rolledBack, code: 'MEMBERSHIP_SALE_BUSY', message: 'Продажу одновременно изменяет другой запрос. Повторите оформление.' });
        throw new ServiceUnavailableException({ code: 'MEMBERSHIP_SALE_UNAVAILABLE', message: 'Не удалось оформить абонемент. Повторите запрос; если ошибка сохраняется, обратитесь к администратору.' });
      }
    }
  }

  async remove(id: string, dto?: CancelServiceDto, actor?: AuthUser) {
    return archiveTransaction(this.prisma, async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))::text`;
      await refundService(tx, 'memberships', id, dto, actor);
      await tx.membership.update({ where: { id }, data: { deletedAt: new Date(), cancelledAt: new Date(), status: 'exhausted' } });
      return { id, softDeleted: true, message: 'Абонемент аннулирован и перенесен в архив' };
    });
  }

  async addMember(id: string, clientId: string, actor: AuthUser) {
    return archiveTransaction(this.prisma, async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))::text`;
      const membership = await tx.membership.findUnique({ where: { id } });
      if (!membership) throw new NotFoundException('Абонемент не найден');
      if (!membership.clientId) throw new BadRequestException('У абонемента не указан владелец');
      if (membership.clientId === clientId) throw new BadRequestException('Владелец уже имеет доступ к абонементу');
      const now = new Date();
      if (membership.deletedAt || membership.status !== 'active' || membership.validFrom > now || membership.validTo < now || membership.remainingUnits.lte(0) || membership.type === 'boarding')
        throw new ConflictException('Совместный доступ можно добавить только к активному абонементу');
      const client = await tx.client.findUnique({ where: { id: clientId } });
      if (!client || client.deletedAt) throw new BadRequestException('Выберите действующего клиента');
      if (await tx.membershipMember.findUnique({ where: { membershipId_clientId: { membershipId: id, clientId } } }))
        throw new ConflictException('Клиент уже имеет совместный доступ');
      return tx.membershipMember.create({ data: { membershipId: id, clientId, createdById: actor.id },
        include: { client: { select: { id: true, name: true, firstName: true, lastName: true } } } });
    });
  }

  async removeMember(id: string, clientId: string) {
    return archiveTransaction(this.prisma, async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))::text`;
      if (!await tx.membership.findUnique({ where: { id } })) throw new NotFoundException('Абонемент не найден');
      // Revocation remains available after expiry. Committed financial history is retained.
      await tx.membershipMember.deleteMany({ where: { membershipId: id, clientId } });
      return { membershipId: id, clientId };
    });
  }

  findPricingPlans() {
    return this.prisma.pricingPlan.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  }

  private addDays(days: number): Date {
    return DateTime.now().setZone('Europe/Moscow').plus({ days }).toJSDate();
  }
  private withActive<T extends { remainedLessons: number; validUntil: Date; deletedAt: Date | null; status: string }>(membership: T): T & { isActive: boolean } {
    return { ...membership, isActive: !membership.deletedAt && membership.status === 'active' && membership.remainedLessons > 0 && membership.validUntil >= new Date() };
  }
}
