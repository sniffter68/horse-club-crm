import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { parseRefineQuery, type PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateMembershipDto } from './dto/create-membership.dto';

const membershipInclude = { client: true, pricingPlan: true } satisfies Prisma.MembershipInclude;
const membershipDetailsInclude = { ...membershipInclude, operations: { orderBy: { createdAt: 'desc' as const }, include: { lesson: true } } } satisfies Prisma.MembershipInclude;
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

  async create(dto: CreateMembershipDto): Promise<MembershipResponse> {
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId }, select: { id: true } });
    if (!client) throw new NotFoundException('Client not found');
    const plan = dto.pricingPlanId
      ? await this.prisma.pricingPlan.findUnique({ where: { id: dto.pricingPlanId } })
      : null;
    if (dto.pricingPlanId && !plan) throw new NotFoundException('Pricing plan not found');
    if (!plan && (dto.totalLessons === undefined || !dto.validUntil)) {
      throw new BadRequestException('totalLessons and validUntil are required without pricingPlanId');
    }
    const totalLessons = plan?.totalLessons ?? dto.totalLessons!;
    const validUntil = plan ? this.addDays(plan.validDays) : new Date(dto.validUntil!);
    if (!Number.isFinite(validUntil.getTime()) || validUntil <= new Date()) throw new BadRequestException('validUntil must be in the future');
    const membership = await this.prisma.membership.create({
      data: {
        clientId: client.id, pricingPlanId: plan?.id, totalLessons, remainedLessons: totalLessons, validUntil,
        operations: { create: { type: 'CREDIT', amount: totalLessons, reason: dto.reason?.trim() || 'Initial membership issue' } },
      }, include: membershipInclude,
    });
    return this.withActive(membership);
  }

  findPricingPlans() {
    return this.prisma.pricingPlan.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  }

  private addDays(days: number): Date {
    const date = new Date(); date.setUTCDate(date.getUTCDate() + days); return date;
  }
  private withActive<T extends { remainedLessons: number; validUntil: Date }>(membership: T): T & { isActive: boolean } {
    return { ...membership, isActive: membership.remainedLessons > 0 && membership.validUntil >= new Date() };
  }
}
