import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Horse } from '@prisma/client';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery } from '../common/refine';
import type { PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateHorseDto } from './dto/create-horse.dto';
import type { UpdateHorseDto } from './dto/update-horse.dto';

@Injectable()
export class HorsesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: RefineQueryDto): Promise<PaginatedResult<Horse>> {
    const options = parseRefineQuery(
      query,
      ['id', 'name', 'maxDailyMinutes', 'minRestMinutes', 'breed', 'riderLevel', 'isUnavailable'],
      'name',
    );
    const where: Prisma.HorseWhereInput = options.search
      ? { name: { contains: options.search, mode: 'insensitive' } }
      : {};
    const orderBy = { [options.sort]: options.order } as Prisma.HorseOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.horse.count({ where }),
      this.prisma.horse.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: options.skip,
        take: options.take,
      }),
    ]);
    return { data, total };
  }

  async findOne(id: string): Promise<Horse> {
    const horse = await this.prisma.horse.findUnique({ where: { id } });
    if (!horse) throw new NotFoundException('Лошадь не найдена');
    return horse;
  }

  create(dto: CreateHorseDto): Promise<Horse> {
    return this.prisma.horse.create({ data: dto });
  }

  async update(id: string, dto: UpdateHorseDto): Promise<Horse> {
    try {
      return await this.prisma.horse.update({ where: { id }, data: dto });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Лошадь');
    }
  }

  async remove(id: string): Promise<Horse> {
    try {
      return await this.prisma.horse.delete({ where: { id } });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Лошадь');
    }
  }
}
