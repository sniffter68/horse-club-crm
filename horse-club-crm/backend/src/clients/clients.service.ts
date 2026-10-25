import { VkIdentityService } from '../vk-bot/vk-identity.service';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Client } from '@prisma/client';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery } from '../common/refine';
import type { PaginatedResult } from '../common/refine';
import { archiveTransaction } from '../common/archive-transaction';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateClientDto } from './dto/create-client.dto';
import type { ClientQueryDto } from './dto/client-query.dto';
import type { QuickCreateClientDto } from './dto/quick-create-client.dto';
import type { UpdateClientDto } from './dto/update-client.dto';

const preferredResourcesInclude = {
  preferredTrainer: { select: { id: true, name: true } },
  preferredHorse: { select: { id: true, name: true } },
} satisfies Prisma.ClientInclude;

const paymentSummarySelect = {
  id: true,
  amount: true,
  status: true,
  paidAt: true,
  description: true,
  createdAt: true,
} satisfies Prisma.PaymentSelect;

const clientMembershipSelect = {
  clientId: true, client: { select: { name: true, firstName: true, lastName: true } },
  members: { include: { client: { select: { id: true, name: true, firstName: true, lastName: true } } } },
  deletedAt: true, _count: { select: { bookings: true, operations: true, transactions: true, payments: true } }, totalPrice: true, type: true, title: true, initialUnits: true, remainingUnits: true, validFrom: true, validTo: true, status: true,
  id: true,
  totalLessons: true,
  remainedLessons: true,
  validUntil: true,
  createdAt: true,
  pricingPlan: { select: { id: true, name: true } },
  payments: { select: paymentSummarySelect, orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.MembershipSelect;

type ClientMembership = Prisma.MembershipGetPayload<{ select: typeof clientMembershipSelect }> & { isActive: boolean; ownerClientId: string | null; isShared: boolean; ownerName: string };
const clientDetailsInclude = Prisma.validator<Prisma.ClientDefaultArgs>()({
  include: {
    ...preferredResourcesInclude,
    _count: { select: { sharedMemberships: true, bookings: true, memberships: true, payments: true, transactions: true, boardingContracts: true, boardingDailyLogs: true, ownedHorses: true, leadRequests: true } },
    sharedMemberships: { include: { membership: { select: clientMembershipSelect } } },
    memberships: { select: clientMembershipSelect, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] },
    boardingContracts: {
      include: {
        horse: { select: { id: true, name: true } },
        stall: { select: { id: true, name: true } },
        payments: { select: paymentSummarySelect, orderBy: { createdAt: 'desc' } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 20,
    },
    bookings: {
      where: { lessonId: { not: null } },
      include: {
        horse: { select: { id: true, name: true } },
        membership: { select: { id: true } },
        payments: { select: paymentSummarySelect, orderBy: { createdAt: 'desc' } },
        lesson: {
          include: {
            service: { select: { id: true, title: true, name: true } },
            trainer: { select: { id: true, name: true } },
            arena: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ lesson: { startTime: 'desc' } }, { id: 'asc' }],
      take: 20,
    },
    payments: {
      select: {
        ...paymentSummarySelect,
        bookingId: true,
        boardingContractId: true,
        membershipId: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 20,
    },
  },
});
type ClientDetails = Prisma.ClientGetPayload<typeof clientDetailsInclude>;
export type ClientDetailsResponse = Omit<ClientDetails, 'memberships'> & { memberships: ClientMembership[] };

export type ActiveMembership = {
  id: string; planName: string; remainingUnits: number; totalUnits: number;
  validUntil: Date; status: 'ACTIVE' | 'EXPIRING';
};
export type ClientListResponse = Prisma.ClientGetPayload<{ include: typeof preferredResourcesInclude }> & { membership: ActiveMembership | null };
const ledgerInclude = {
  membership: { select: { title: true, type: true, pricingPlan: { select: { name: true } } } },
  booking: { select: { id: true, startTime: true, status: true, serviceType: true,
    lesson: { select: { id: true, startTime: true, status: true, service: { select: { title: true, name: true } } } } } },
} satisfies Prisma.LedgerTransactionInclude;
type LedgerRow = Prisma.LedgerTransactionGetPayload<{ include: typeof ledgerInclude }>;
export type ClientLedgerOperation = Omit<LedgerRow, 'amount'> & { amount: number; type: 'DEBIT' | 'CREDIT' | 'REFUND'; reason: string; signedAmount: string; unit: 'RUB' | 'lessons'; lesson: { id: string; startTime: Date; status: string; service: { title: string; name: string } } | null };

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService, private readonly identity: VkIdentityService = new VkIdentityService(prisma)) {}

  private ensureSpecialCategoryAllowed(medicalNotes: string | undefined): void {
    if (medicalNotes?.trim() && process.env.ENABLE_MEDICAL_NOTES !== 'true') {
      throw new BadRequestException('Медицинские сведения отключены до оформления отдельного письменного согласия');
    }
  }

  async findAll(query: ClientQueryDto): Promise<PaginatedResult<ClientListResponse>> {
    const now = new Date();
    const options = parseRefineQuery(query, ['id', 'name', 'phone', 'email', 'firstName', 'lastName', 'createdAt'], 'name');
    const where: Prisma.ClientWhereInput = options.search
      ? {
          OR: [
            { name: { contains: options.search, mode: 'insensitive' } },
            { phone: { contains: options.search, mode: 'insensitive' } },
            { email: { contains: options.search, mode: 'insensitive' } },
          ],
        }
      : {};
    if (query.archivedOnly) where.deletedAt = { not: null };
    else if (!query.includeArchived) where.deletedAt = null;
    if (query.clientType) where.clientType = query.clientType;
    const orderBy = { [options.sort]: options.order } as Prisma.ClientOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: options.skip,
        take: options.take,
        include: { ...preferredResourcesInclude, memberships: {
          where: { deletedAt: null, type: 'fixed_lessons', status: 'active', validFrom: { lte: now }, remainedLessons: { gt: 0 }, validUntil: { gte: now } },
          orderBy: [{ validUntil: 'asc' }, { id: 'asc' }], take: 1,
          select: { id: true, serviceTitle: true, remainedLessons: true, totalLessons: true, validUntil: true, pricingPlan: { select: { name: true } } },
        } },
      }),
    ]);
    return { data: data.map(({ memberships, ...client }) => {
      const membership = memberships[0];
      return { ...client, membership: membership ? {
        id: membership.id, planName: membership.serviceTitle || membership.pricingPlan?.name || 'Индивидуальный абонемент',
        remainingUnits: membership.remainedLessons, totalUnits: membership.totalLessons,
        validUntil: membership.validUntil,
        status: membership.validUntil.getTime() - now.getTime() <= 7 * 86_400_000 ? 'EXPIRING' as const : 'ACTIVE' as const,
      } : null };
    }), total };
  }

  async findLedger(clientId: string, query: RefineQueryDto): Promise<PaginatedResult<ClientLedgerOperation>> {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new NotFoundException('Клиент не найден');
    const options = parseRefineQuery(query, ['createdAt'], 'createdAt');
    const where: Prisma.LedgerTransactionWhereInput = { clientId };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.ledgerTransaction.count({ where }),
      this.prisma.ledgerTransaction.findMany({ where, include: ledgerInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: options.skip, take: options.take }),
    ]);
    const services: Record<string, string> = { dressage: 'Выездка', jumping: 'Конкур', walks: 'Прогулка шагом', beginners: 'Начинающие', photoshoot: 'Фотосессия', corde: 'Корда' };
    return { data: data.map(row => ({ ...row, amount: row.amount.abs().toNumber(),
      type: row.transactionType === 'refund' ? 'REFUND' as const : row.amount.isNegative() ? 'DEBIT' as const : 'CREDIT' as const,
      reason: row.description || '', signedAmount: row.amount.toString(), unit: row.cashDeskPaymentId || row.membership?.type === 'deposit' || row.boardingContractId || row.boardingDailyLogId ? 'RUB' as const : 'lessons' as const,
      lesson: row.booking?.lesson ?? (row.booking ? { id: row.booking.id, startTime: row.booking.startTime, status: row.booking.status,
        service: { name: services[row.booking.serviceType ?? ''] || 'Тренировка', title: services[row.booking.serviceType ?? ''] || 'Тренировка' } } : null),
    })), total };
  }

  async findOne(id: string): Promise<ClientDetailsResponse> {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: clientDetailsInclude.include,
    });
    if (!client) throw new NotFoundException('Клиент не найден');
    const now = new Date();
    return {
      ...client,
      memberships: [...client.memberships, ...(client.deletedAt ? [] : client.sharedMemberships ?? [])
        .map(member => member.membership)
        .filter(m => !m.deletedAt && m.status === 'active' && Number(m.remainingUnits) > 0 && m.validFrom <= now && m.validTo >= now)].map((membership) => ({
        ...membership,
        ownerClientId: membership.clientId,
        isShared: membership.clientId !== id,
        ownerName: membership.client?.name || [membership.client?.firstName, membership.client?.lastName].filter(Boolean).join(' '),
        isActive: !membership.deletedAt && membership.status === 'active' && membership.remainedLessons > 0 && membership.validUntil >= now,
      })),
    };
  }

  async quickCreate(dto: QuickCreateClientDto): Promise<Client> {
    const name = dto.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('Введите имя клиента');
    return this.create({ name, phone: dto.phone?.trim() || undefined,
      clientType: dto.isOneTime ? 'ONE_TIME' : 'REGULAR', preferences: dto.note,
      riderLevel: dto.isOneTime ? undefined : dto.riderLevel });
  }

  async convertToRegular(id: string): Promise<Client> {
    try {
      return await this.prisma.client.update({ where: { id }, data: { clientType: 'REGULAR' } });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Клиент');
    }
  }

  async create(dto: CreateClientDto): Promise<Client> {
    this.ensureSpecialCategoryAllowed(dto.medicalNotes);
    const firstName = dto.firstName ?? dto.name;
    const lastName = dto.lastName ?? '';
    try {
      const { vkId: input, vkScreenName: screen, ...fields } = dto;
      const data = { ...fields, firstName, lastName, name: [firstName, lastName].filter(Boolean).join(' ') };
      if (input === undefined && screen === undefined) return await this.prisma.client.create({ include: preferredResourcesInclude, data });
      const profile = await this.identity.normalize(input !== undefined ? input : screen ?? null);
      return await this.identity.atomic(async tx => {
        await this.identity.assertAvailable(tx, profile.vkId, 'CLIENT');
        return tx.client.create({ include: preferredResourcesInclude, data: { ...data, ...profile, vkUserId: profile.vkId ? BigInt(profile.vkId) : null } });
      });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Клиент');
    }
  }

  async update(id: string, dto: UpdateClientDto): Promise<Client> {
    this.ensureSpecialCategoryAllowed(dto.medicalNotes);
    try {
      const current = await this.findOne(id);
      const firstName = dto.firstName ?? (dto.name !== undefined ? dto.name : current.firstName);
      const lastName = dto.lastName ?? (dto.name !== undefined && dto.firstName === undefined ? '' : current.lastName);
      const { vkId: input, vkScreenName: screen, ...fields } = dto;
      const data = { ...fields, firstName, lastName, name: [firstName, lastName].filter(Boolean).join(' ') };
      if (input === undefined && screen === undefined) return await this.prisma.client.update({ where: { id }, include: preferredResourcesInclude, data });
      const profile = await this.identity.normalize(input !== undefined ? input : screen ?? null);
      return await this.identity.atomic(async tx => {
        await this.identity.assertAvailable(tx, profile.vkId, 'CLIENT', id);
        const previous = await tx.client.findUnique({ where: { id } });
        if (previous?.vkUserId && previous.vkUserId !== (profile.vkId ? BigInt(profile.vkId) : null)) await tx.vkNotification.deleteMany({ where: { peerId: previous.vkUserId, sentAt: null } });
        return tx.client.update({ where: { id }, include: preferredResourcesInclude, data: { ...data, ...profile, vkUserId: profile.vkId ? BigInt(profile.vkId) : null } });
      });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Клиент');
    }
  }

  async restore(id: string): Promise<Client> {
    try {
      return await this.prisma.client.update({ where: { id }, data: { deletedAt: null } });
    } catch (error) { return rethrowCatalogMutation(error, 'Клиент'); }
  }

  async remove(id: string) {
    try {
      return await archiveTransaction(this.prisma, async tx => {
        const client = await tx.client.findUnique({ where: { id }, select: {
          id: true, deletedAt: true, boardingBalance: true,
          _count: { select: { sharedMemberships: true, bookings: true, memberships: true, payments: true, transactions: true,
            boardingContracts: true, boardingDailyLogs: true, ownedHorses: true, leadRequests: true } },
        } });
        if (!client) throw new NotFoundException('Клиент не найден');
        const softDeleted = Boolean(client.deletedAt) || !client.boardingBalance.isZero() || Object.values(client._count).some(count => count > 0);
        if (softDeleted) await tx.client.update({ where: { id }, data: { deletedAt: client.deletedAt ?? new Date() } });
        else await tx.client.delete({ where: { id } });
        return { id, softDeleted, message: softDeleted ? 'Клиент перенесен в архив. История сохранена' : 'Клиент удален безвозвратно' };
      });
    } catch (error) { return rethrowCatalogMutation(error, 'Клиент'); }
  }
}
