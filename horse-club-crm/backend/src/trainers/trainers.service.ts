import { phoneSearchIds } from '../common/phone-search';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Trainer } from '@prisma/client';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { rethrowCatalogMutation } from '../common/prisma-errors';
import { parseRefineQuery } from '../common/refine';
import type { PaginatedResult } from '../common/refine';
import { VkIdentityService } from '../vk-bot/vk-identity.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTrainerDto } from './dto/create-trainer.dto';
import type { UpdateTrainerDto } from './dto/update-trainer.dto';

@Injectable()
export class TrainersService {
  constructor(private readonly prisma: PrismaService, private readonly identity: VkIdentityService = new VkIdentityService(prisma)) {}

  async findAll(query: RefineQueryDto): Promise<PaginatedResult<Trainer>> {
    const options = parseRefineQuery(query, ['id', 'name', 'phone', 'baseRate', 'maxDailyLoad'], 'name');
    const phoneIds = await phoneSearchIds(this.prisma, 'Trainer', options.search);
    const where: Prisma.TrainerWhereInput = options.search
      ? {
          OR: [
            { name: { contains: options.search, mode: 'insensitive' } },
            ...(phoneIds.length ? [{ id: { in: phoneIds } }] : []),
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

  async create(dto: CreateTrainerDto): Promise<Trainer> {
    const { vkId: input, ...data } = dto;
    const vk = input === undefined ? null : await this.identity.normalize(input);
    return this.identity.atomic(async tx => {
      await this.identity.assertAvailable(tx, vk?.vkId ?? null, 'TRAINER');
      return tx.trainer.create({ data: { ...data, vkId: vk?.vkId ? BigInt(vk.vkId) : null } });
    });
  }

  async update(id: string, dto: UpdateTrainerDto): Promise<Trainer> {
    const { vkId: input, ...data } = dto;
    const vk = input === undefined ? undefined : await this.identity.normalize(input);
    try {
      if (!vk) return await this.prisma.trainer.update({ where: { id }, data });
      return await this.identity.atomic(async tx => {
        await this.identity.applyTrainer(tx, id, vk.vkId);
        return tx.trainer.update({ where: { id }, data });
      });
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
