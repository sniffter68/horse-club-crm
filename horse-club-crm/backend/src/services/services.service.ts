import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Service } from '@prisma/client';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery } from '../common/refine';
import type { PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateServiceDto } from './dto/create-service.dto';
import type { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: RefineQueryDto): Promise<PaginatedResult<Service>> {
    const options = parseRefineQuery(
      query,
      ['id', 'name', 'durationMinutes', 'price', 'createdAt', 'updatedAt', 'title', 'maxCapacity', 'cancellationWindowHours'],
      'name',
    );
    const where: Prisma.ServiceWhereInput = options.search
      ? { name: { contains: options.search, mode: 'insensitive' } }
      : {};
    const orderBy = { [options.sort]: options.order } as Prisma.ServiceOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.service.count({ where }),
      this.prisma.service.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: options.skip,
        take: options.take,
      }),
    ]);
    return { data, total };
  }

  async findOne(id: string): Promise<Service> {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) throw new NotFoundException('Услуга не найдена');
    return service;
  }

  create(dto: CreateServiceDto): Promise<Service> {
    const title = dto.title ?? dto.name;
    return this.prisma.service.create({ data: { ...dto, name: title, title } });
  }

  async update(id: string, dto: UpdateServiceDto): Promise<Service> {
    try {
      const title = dto.title ?? dto.name;
      return await this.prisma.service.update({ where: { id }, data: { ...dto, ...(title !== undefined ? { name: title, title } : {}) } });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Услуга');
    }
  }

  async remove(id: string): Promise<Service> {
    try {
      return await this.prisma.service.delete({ where: { id } });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Услуга');
    }
  }
}
