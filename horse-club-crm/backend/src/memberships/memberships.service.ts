import { createHash, randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import type { AuthUser } from '../auth/auth.types';
import { defaultModuleAccess } from '../settings/module-access.service';
import { isSerializationFailure } from '../common/serialization-failure';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { parseRefineQuery, type PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateMembershipDto } from './dto/create-membership.dto';

const membershipInclude = { client: true, pricingPlan: true } satisfies Prisma.MembershipInclude;
const membershipDetailsInclude = {
  ...membershipInclude,
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
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: RefineQueryDto): Promise<PaginatedResult<MembershipResponse>> {
    const options = parseRefineQuery(query, ['id', 'totalLessons', 'remainedLessons', 'validUntil', 'createdAt', 'updatedAt'], 'createdAt');
    const where: Prisma.MembershipWhereInput = options.search ? {
      client: { is: { OR: [
        { name: { contains: options.search, mode: 'insensitive' } },
        { firstName: { contains: options.search, mode: 'insensitive' } },
        { lastName: { contains: options.search, mode: 'insensitive' } },
      ] } },
    } : {};
    const orderBy = { [options.sort]: options.order } as Prisma.MembershipOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.membership.count({ where }),
      this.prisma.membership.findMany({ where, include: membershipInclude, orderBy: [orderBy, { id: 'asc' }], skip: options.skip, take: options.take }),
    ]);
    return { total, data: data.map((membership) => this.withActive(membership)) };
  }

  async findOne(id: string): Promise<MembershipDetails & { isActive: boolean }> {
    const membership = await this.prisma.membership.findUnique({ where: { id }, include: membershipDetailsInclude });
    if (!membership) throw new NotFoundException('Membership not found');
    return this.withActive(membership);
  }

  async create(dto: CreateMembershipDto, actor: AuthUser): Promise<MembershipResponse> {
    const fingerprint = createHash('sha256').update(JSON.stringify([
      actor.id, dto.clientId, dto.serviceId, dto.pricingPlanId, dto.totalLessons,
      dto.validUntil, dto.pricePerLesson, dto.totalPrice, dto.paymentMethod, dto.reason?.trim(),
    ])).digest('hex');
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          if (dto.requestId) {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${dto.requestId}, 0))::text`;
            const previous = await tx.membership.findUnique({ where: { saleRequestId: dto.requestId }, include: membershipInclude });
            if (previous) {
              if (previous.saleFingerprint !== fingerprint) throw new ConflictException('Ключ продажи уже использован с другими данными');
              return this.withActive(previous);
            }
          }
          const cashbox = await tx.clubModuleSettings.findUnique({ where: { module: 'CASHBOX' } });
          const cashboxEnabled = cashbox?.isEnabled ?? true;
          if (cashboxEnabled && actor.role !== 'ADMIN') {
            const permission = await tx.roleModulePermission.findUnique({ where: { role_module: { role: actor.role, module: 'CASHBOX' } } });
            if ((permission?.accessLevel ?? defaultModuleAccess(actor.role, 'CASHBOX')) !== 'FULL')
              throw new ForbiddenException('Для продажи с оплатой требуется полный доступ к кассе');
          }
          const client = await tx.client.findUnique({ where: { id: dto.clientId }, select: { id: true } });
          if (!client) throw new NotFoundException('Клиент не найден');
          const plan = dto.pricingPlanId ? await tx.pricingPlan.findUnique({ where: { id: dto.pricingPlanId } }) : null;
          if (dto.pricingPlanId && !plan) throw new NotFoundException('Тариф не найден');
          const service = dto.serviceId ? await tx.service.findUnique({ where: { id: dto.serviceId } }) : null;
          if (dto.serviceId && !service) throw new NotFoundException('Услуга не найдена');
          if (service && !service.allowMembership) throw new BadRequestException('Услуга недоступна по абонементу');
          const totalLessons = dto.totalLessons ?? plan?.totalLessons;
          if (!totalLessons || !Number.isInteger(totalLessons) || totalLessons < 1 || totalLessons > 10000)
            throw new BadRequestException('Укажите количество занятий от 1 до 10000');
          const validUntil = dto.validUntil ? new Date(dto.validUntil) : plan ? this.addDays(plan.validDays) : null;
          if (!validUntil || !Number.isFinite(validUntil.getTime()) || validUntil <= new Date())
            throw new BadRequestException('Укажите будущую дату окончания');
          const basePrice = service?.price ?? dto.pricePerLesson ?? (plan ? new Prisma.Decimal(plan.price).div(totalLessons).toDecimalPlaces(2) : undefined);
          if (basePrice === undefined) throw new BadRequestException('Выберите услугу или укажите базовую цену');
          const pricePerLesson = new Prisma.Decimal(basePrice);
          const totalPrice = new Prisma.Decimal(dto.totalPrice);
          if ([pricePerLesson, totalPrice].some(price => !price.isFinite() || price.lt(0) || price.decimalPlaces() > 2 || price.gt('9999999999.99')))
            throw new BadRequestException('Укажите корректную стоимость с точностью до копеек');
          if (!['CASH', 'CARD'].includes(dto.paymentMethod)) throw new BadRequestException('Выберите наличную или безналичную оплату');
          const title = service?.title || service?.name || plan?.name || 'Индивидуальный абонемент';
          const description = `Оплата абонемента: ${title} (${totalLessons} зан.)`;
          const creditId = randomUUID();
          const creditReason = dto.reason?.trim() || 'Выдача абонемента';
          const membership = await tx.membership.create({ data: {
            clientId: client.id, pricingPlanId: plan?.id, serviceId: service?.id, serviceTitle: title,
            title, totalLessons, remainedLessons: totalLessons, initialUnits: totalLessons, remainingUnits: totalLessons,
            validUntil, validTo: validUntil, pricePerLesson, totalPrice, paymentMethod: dto.paymentMethod,
            saleRequestId: dto.requestId, saleFingerprint: fingerprint, soldById: actor.id, cashboxPosted: cashboxEnabled,
            operations: { create: { id: creditId, type: 'CREDIT', amount: totalLessons, reason: creditReason } },
          }, include: membershipInclude });
          await tx.ledgerTransaction.create({ data: {
            clientId: client.id, membershipId: membership.id, sourceMembershipOpId: creditId,
            transactionType: 'purchase', amount: totalLessons, description: creditReason,
          } });
          if (cashboxEnabled) {
            const shift = await tx.cashShift.findFirst({ where: { cashierId: actor.id, closedAt: null } });
            const payment = await tx.payment.create({ data: {
              clientId: client.id, membershipId: membership.id, serviceId: service?.id,
              amount: totalPrice, method: dto.paymentMethod, status: 'PAID', paidAt: new Date(),
              cashierId: actor.id, shiftId: shift?.id, serviceType: 'MEMBERSHIP', description,
            } });
            await tx.ledgerTransaction.create({ data: {
              clientId: client.id, membershipId: membership.id, cashDeskPaymentId: payment.id,
              transactionType: 'purchase', amount: totalPrice, description,
            } });
          }
          return this.withActive(membership);
        }, { isolationLevel: 'Serializable' });
      } catch (error) {
        const duplicateRequest = dto.requestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if ((isSerializationFailure(error) || duplicateRequest) && attempt < 4) continue;
        throw error;
      }
    }
  }

  findPricingPlans() {
    return this.prisma.pricingPlan.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  }

  private addDays(days: number): Date {
    return DateTime.now().setZone('Europe/Moscow').plus({ days }).toJSDate();
  }
  private withActive<T extends { remainedLessons: number; validUntil: Date }>(membership: T): T & { isActive: boolean } {
    return { ...membership, isActive: membership.remainedLessons > 0 && membership.validUntil >= new Date() };
  }
}
