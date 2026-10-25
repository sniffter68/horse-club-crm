import { VkIdentityService } from '../vk-bot/vk-identity.service';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { hash } from 'bcrypt';
import type { RefineQueryDto } from '../common/dto/refine-query.dto';
import { parseRefineQuery, type PaginatedResult } from '../common/refine';
import { PrismaService } from '../prisma/prisma.service';
import { BCRYPT_ROUNDS } from '../auth/auth.config';
import type { CreateUserDto } from './dto/create-user.dto';

export type PublicUser = { id: string; email: string; role: Role; trainerId: string | null; vkUserId: bigint | null; vkId: string | null; createdAt: Date; updatedAt: Date };
const publicUserSelect = { id: true, email: true, role: true, trainerId: true, vkUserId: true, vkId: true, createdAt: true, updatedAt: true } satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly identity: VkIdentityService = new VkIdentityService(prisma)) {}

  async setTrainer(id: string, trainerId: string | null) {
    if (trainerId === undefined) throw new BadRequestException('Укажите тренера или null для снятия привязки');
    try {
      return await this.prisma.$transaction(async tx => {
        const user = await tx.user.findUnique({ where: { id } });
        if (!user || user.role !== Role.TRAINER) throw new BadRequestException('Привязка доступна только для учётной записи тренера');
        if (trainerId && !await tx.trainer.findUnique({ where: { id: trainerId } })) throw new BadRequestException('Тренер не найден');
        return tx.user.update({ where: { id }, data: { trainerId, tokenVersion: { increment: 1 } }, select: publicUserSelect });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Этот тренер уже привязан к другой учётной записи');
      throw error;
    }
  }

  async setVkRecipient(id: string, vkUserId: string | null): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== Role.ADMIN) throw new BadRequestException('Получателем заявок может быть только администратор');
    return this.identity.setStaff(id, vkUserId);
  }

  async findAll(query: RefineQueryDto): Promise<PaginatedResult<PublicUser>> {
    const options = parseRefineQuery(query, ['id', 'email', 'role', 'createdAt', 'updatedAt'], 'createdAt');
    const where: Prisma.UserWhereInput = options.search ? { email: { contains: options.search, mode: 'insensitive' } } : {};
    const orderBy = { [options.sort]: options.order } as Prisma.UserOrderByWithRelationInput;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, select: publicUserSelect, orderBy: [orderBy, { id: 'asc' }], skip: options.skip, take: options.take }),
    ]);
    return { total, data };
  }

  async create(dto: CreateUserDto): Promise<PublicUser> {
    if (Buffer.byteLength(dto.password, 'utf8') > 72) throw new BadRequestException('Password must not exceed 72 UTF-8 bytes');
    try {
      return await this.prisma.user.create({
        data: { email: dto.email.trim().toLowerCase(), passwordHash: await hash(dto.password, BCRYPT_ROUNDS), role: dto.role },
        select: publicUserSelect,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('User already exists');
      throw error;
    }
  }
}
