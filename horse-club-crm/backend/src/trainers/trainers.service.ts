import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Trainer } from '@prisma/client';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery } from '../common/refine';
import type { PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTrainerDto } from './dto/create-trainer.dto';
import type { UpdateTrainerDto } from './dto/update-trainer.dto';

@Injectable()
export class TrainersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: RefineQueryDto): Promise<PaginatedResult<Trainer>> {
    const options = parseRefineQuery(query, ['id', 'name', 'phone', 'baseRate', 'maxDailyLoad'], 'name');
    const where: Prisma.TrainerWhereInput = options.search
      ? {
          OR: [
            { name: { contains: options.search, mode: 'insensitive' } },
            { phone: { contains: options.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const orderBy = { [options.sort]: options.order } as Prisma.TrainerOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.trainer.count({ where }),
      this.prisma.trainer.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: options.skip,
        take: options.take,
      }),
    ]);
    return { data, total };
  }

  async findOne(id: string): Promise<Trainer> {
    const trainer = await this.prisma.trainer.findUnique({ where: { id } });
    if (!trainer) throw new NotFoundException('Тренер не найден');
    return trainer;
  }

  create(dto: CreateTrainerDto): Promise<Trainer> {
    return this.prisma.trainer.create({ data: dto });
  }

  async update(id: string, dto: UpdateTrainerDto): Promise<Trainer> {
    try {
      return await this.prisma.trainer.update({ where: { id }, data: dto });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Тренер');
    }
  }

  async remove(id: string): Promise<Trainer> {
    try {
      return await this.prisma.trainer.delete({ where: { id } });
    } catch (error: unknown) {
      return rethrowCatalogMutation(error, 'Тренер');
    }
  }
}
