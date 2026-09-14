import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PricingPlan } from '@prisma/client';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery, type PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePricingPlanDto } from './dto/create-pricing-plan.dto';
import type { UpdatePricingPlanDto } from './dto/update-pricing-plan.dto';

@Injectable()
export class PricingPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: RefineQueryDto): Promise<PaginatedResult<PricingPlan>> {
    const options = parseRefineQuery(query, ['id', 'name', 'totalLessons', 'validDays', 'price', 'createdAt', 'updatedAt'], 'name');
    const where: Prisma.PricingPlanWhereInput = options.search ? { name: { contains: options.search, mode: 'insensitive' } } : {};
    const orderBy = { [options.sort]: options.order } as Prisma.PricingPlanOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.pricingPlan.count({ where }),
      this.prisma.pricingPlan.findMany({ where, orderBy: [orderBy, { id: 'asc' }], skip: options.skip, take: options.take }),
    ]);
    return { data, total };
  }

  async findOne(id: string): Promise<PricingPlan> {
    const plan = await this.prisma.pricingPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Тариф не найден');
    return plan;
  }

  async create(dto: CreatePricingPlanDto): Promise<PricingPlan> {
    const data = { ...dto, name: this.normalizeName(dto.name) };
    await this.ensureUniqueName(data.name);
    return this.prisma.pricingPlan.create({ data });
  }

  async update(id: string, dto: UpdatePricingPlanDto): Promise<PricingPlan> {
    try {
      const name = dto.name === undefined ? undefined : this.normalizeName(dto.name);
      if (name !== undefined) await this.ensureUniqueName(name, id);
      return await this.prisma.pricingPlan.update({ where: { id }, data: { ...dto, ...(name === undefined ? {} : { name }) } });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Тариф');
    }
  }

  async remove(id: string): Promise<PricingPlan> {
    const memberships = await this.prisma.membership.count({ where: { pricingPlanId: id } });
    if (memberships > 0) throw new ConflictException('Тариф уже используется в абонементах и не может быть удалён');
    try {
      return await this.prisma.pricingPlan.delete({ where: { id } });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Тариф');
    }
  }

  private normalizeName(name: string): string { return name.trim().replace(/\s+/g, ' '); }

  private async ensureUniqueName(name: string, excludedId?: string): Promise<void> {
    const existing = await this.prisma.pricingPlan.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(excludedId ? { id: { not: excludedId } } : {}) },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Тариф с таким названием уже существует');
  }
}
