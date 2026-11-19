import { phoneSearchIds } from '../common/phone-search';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { hash } from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { BCRYPT_ROUNDS } from '../auth/auth.config';
import type { AuthUser } from '../auth/auth.types';
import type { TrainerAccountDto } from './dto/trainer-account.dto';
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

  async setAccount(id: string, dto: TrainerAccountDto, actor: AuthUser) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Доступ выдаёт администратор');
    if (dto.userId && (dto.email || dto.password)) throw new BadRequestException('Выберите создание или привязку учётной записи');
    if (!dto.userId && (!dto.email || !dto.password)) throw new BadRequestException('Укажите email и пароль');
    if (dto.password && Buffer.byteLength(dto.password, 'utf8') > 72) throw new BadRequestException('Пароль должен быть не длиннее 72 байт UTF-8');
    const passwordHash = dto.password ? await hash(dto.password, BCRYPT_ROUNDS) : undefined;
    try {
      return await this.prisma.$transaction(async tx => {
        const trainer = await tx.trainer.findUnique({ where: { id }, include: { user: { select: { id: true, crmAccess: true, role: true } } } });
        if (!trainer) throw new NotFoundException('Тренер не найден');
        if (!trainer.isActive) throw new BadRequestException('Тренер неактивен');
        if (trainer.user && (dto.userId || trainer.user.crmAccess)) throw new ConflictException('У тренера уже есть учётная запись');
        if (trainer.user && trainer.user.role !== 'TRAINER') throw new ConflictException('Проверьте роль привязанной учётной записи');
        const select = { id: true, email: true, crmAccess: true } satisfies Prisma.UserSelect;
        let account: { id: string; email: string; crmAccess: boolean };
        if (dto.userId) {
          const user = await tx.user.findUnique({ where: { id: dto.userId } });
          if (!user || user.role !== 'TRAINER') throw new BadRequestException('Выберите учётную запись с ролью Тренер');
          if (user.trainerId) throw new ConflictException('Учётная запись уже привязана к тренеру');
          account = await tx.user.update({ where: { id: user.id }, data: { trainerId: id, tokenVersion: { increment: 1 } }, select });
        } else if (trainer.user) {
          account = await tx.user.update({ where: { id: trainer.user.id }, data: { email: dto.email!.trim().toLowerCase(), passwordHash: passwordHash!, crmAccess: true, tokenVersion: { increment: 1 } }, select });
        } else {
          account = await tx.user.create({ data: { email: dto.email!.trim().toLowerCase(), passwordHash: passwordHash!, role: 'TRAINER', trainerId: id, crmAccess: true }, select });
        }
        await tx.cashAuditLog.create({ data: { requestId: randomUUID(), action: 'TRAINER_ACCOUNT_LINKED', actorId: actor.id, actorName: actor.email, details: { trainerId: id, userId: account.id } } });
        return account;
      }, { isolationLevel: 'Serializable' });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new ConflictException('Email или тренер уже привязаны. Обновите карточку');
      throw error;
    }
  }

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
        include: { user: { select: { id: true, email: true, crmAccess: true } } },
      }),
    ]);
    return { data, total };
  }

  async findOne(id: string): Promise<Trainer> {
    const trainer = await this.prisma.trainer.findUnique({ where: { id }, include: { user: { select: { id: true, email: true, crmAccess: true } } } });
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
