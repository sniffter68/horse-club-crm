import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Client } from '@prisma/client';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery } from '../common/refine';
import type { PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateClientDto } from './dto/create-client.dto';
import type { UpdateClientDto } from './dto/update-client.dto';

const paymentSummarySelect = {
  id: true,
  amount: true,
  status: true,
  paidAt: true,
  description: true,
  createdAt: true,
} satisfies Prisma.PaymentSelect;

const clientMembershipSelect = {
  id: true,
  totalLessons: true,
  remainedLessons: true,
  validUntil: true,
  createdAt: true,
  pricingPlan: { select: { id: true, name: true } },
  payments: { select: paymentSummarySelect, orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.MembershipSelect;

type ClientMembership = Prisma.MembershipGetPayload<{ select: typeof clientMembershipSelect }> & { isActive: boolean };
const clientDetailsInclude = Prisma.validator<Prisma.ClientDefaultArgs>()({
  include: {
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
export type ClientListResponse = Client & { membership: ActiveMembership | null };
const ledgerInclude = {
  membership: { select: { pricingPlan: { select: { name: true } } } },
  lesson: { select: { id: true, startTime: true, status: true, service: { select: { title: true, name: true } } } },
} satisfies Prisma.MembershipOpInclude;
export type ClientLedgerOperation = Prisma.MembershipOpGetPayload<{ include: typeof ledgerInclude }>;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureSpecialCategoryAllowed(medicalNotes: string | undefined): void {
    if (medicalNotes?.trim() && process.env.ENABLE_MEDICAL_NOTES !== 'true') {
      throw new BadRequestException('Медицинские сведения отключены до оформления отдельного письменного согласия');
    }
  }

  async findAll(query: RefineQueryDto): Promise<PaginatedResult<ClientListResponse>> {
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
    const orderBy = { [options.sort]: options.order } as Prisma.ClientOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: options.skip,
        take: options.take,
        include: { memberships: {
          where: { remainedLessons: { gt: 0 }, validUntil: { gte: now } },
          orderBy: [{ validUntil: 'asc' }, { id: 'asc' }], take: 1,
          select: { id: true, remainedLessons: true, totalLessons: true, validUntil: true, pricingPlan: { select: { name: true } } },
        } },
      }),
    ]);
    return { data: data.map(({ memberships, ...client }) => {
      const membership = memberships[0];
      return { ...client, membership: membership ? {
        id: membership.id, planName: membership.pricingPlan?.name || 'Индивидуальный абонемент',
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
    const where: Prisma.MembershipOpWhereInput = { membership: { clientId } };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.membershipOp.count({ where }),
      this.prisma.membershipOp.findMany({ where, include: ledgerInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: options.skip, take: options.take }),
    ]);
    return { data, total };
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
      memberships: client.memberships.map((membership) => ({
        ...membership,
        isActive: membership.remainedLessons > 0 && membership.validUntil >= now,
      })),
    };
  }

  async create(dto: CreateClientDto): Promise<Client> {
    this.ensureSpecialCategoryAllowed(dto.medicalNotes);
    const firstName = dto.firstName ?? dto.name;
    const lastName = dto.lastName ?? '';
    try {
      return await this.prisma.client.create({ data: { ...dto, firstName, lastName, name: [firstName, lastName].filter(Boolean).join(' ') } });
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
      return await this.prisma.client.update({ where: { id }, data: { ...dto, firstName, lastName, name: [firstName, lastName].filter(Boolean).join(' ') } });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Клиент');
    }
  }

  async remove(id: string): Promise<Client> {
    try {
      return await this.prisma.client.delete({ where: { id } });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Клиент');
    }
  }
}
