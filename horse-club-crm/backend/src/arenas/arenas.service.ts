import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Arena } from '@prisma/client';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery, type PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateArenaDto } from './dto/create-arena.dto';
import type { UpdateArenaDto } from './dto/update-arena.dto';

@Injectable()
export class ArenasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: RefineQueryDto): Promise<PaginatedResult<Arena>> {
    const options = parseRefineQuery(query, ['id', 'name', 'capacity', 'isUnavailable', 'createdAt', 'updatedAt'], 'name');
    const where: Prisma.ArenaWhereInput = options.search
      ? { OR: [
          { name: { contains: options.search, mode: 'insensitive' } },
          { description: { contains: options.search, mode: 'insensitive' } },
        ] }
      : {};
    const orderBy = { [options.sort]: options.order } as Prisma.ArenaOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.arena.count({ where }),
      this.prisma.arena.findMany({ where, orderBy: [orderBy, { id: 'asc' }], skip: options.skip, take: options.take }),
    ]);
    return { total, data };
  }

  async findOne(id: string): Promise<Arena> {
    const arena = await this.prisma.arena.findUnique({ where: { id } });
    if (!arena) throw new NotFoundException('Манеж не найден');
    return arena;
  }

  async create(dto: CreateArenaDto): Promise<Arena> {
    try {
      return await this.prisma.arena.create({ data: this.normalize(dto) });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Манеж');
    }
  }

  async update(id: string, dto: UpdateArenaDto): Promise<Arena> {
    try {
      return await this.prisma.arena.update({ where: { id }, data: this.normalize(dto) });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Манеж');
    }
  }

  async remove(id: string): Promise<Arena> {
    try {
      return await this.prisma.arena.delete({ where: { id } });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Манеж');
    }
  }

  private normalize<T extends CreateArenaDto | UpdateArenaDto>(dto: T): T {
    return {
      ...dto,
      ...(dto.name !== undefined ? { name: dto.name.trim().replace(/\s+/g, ' ') } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || undefined } : {}),
    };
  }
}
