import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Stall } from '@prisma/client';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery, type PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateStallDto } from './dto/create-stall.dto';
import type { UpdateStallDto } from './dto/update-stall.dto';

@Injectable()
export class StallsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: RefineQueryDto): Promise<PaginatedResult<Stall>> {
    const options = parseRefineQuery(
      query,
      ['id', 'name', 'isUnavailable', 'createdAt', 'updatedAt'],
      'name',
    );
    const where: Prisma.StallWhereInput = options.search
      ? {
          OR: [
            { name: { contains: options.search, mode: 'insensitive' } },
            { description: { contains: options.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const orderBy = { [options.sort]: options.order } as Prisma.StallOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.stall.count({ where }),
      this.prisma.stall.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: options.skip,
        take: options.take,
      }),
    ]);
    return { total, data };
  }

  async findOne(id: string): Promise<Stall> {
    const stall = await this.prisma.stall.findUnique({ where: { id } });
    if (!stall) throw new NotFoundException('Денник не найден');
    return stall;
  }

  async create(dto: CreateStallDto): Promise<Stall> {
    try {
      return await this.prisma.stall.create({ data: this.normalize(dto) });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Денник');
    }
  }

  async update(id: string, dto: UpdateStallDto): Promise<Stall> {
    try {
      return await this.prisma.stall.update({ where: { id }, data: this.normalize(dto) });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Денник');
    }
  }

  async remove(id: string): Promise<Stall> {
    try {
      return await this.prisma.stall.delete({ where: { id } });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Денник');
    }
  }

  private normalize<T extends CreateStallDto | UpdateStallDto>(dto: T): T {
    return {
      ...dto,
      ...(dto.name !== undefined ? { name: dto.name.trim().replace(/\s+/g, ' ') } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || undefined } : {}),
    };
  }
}
