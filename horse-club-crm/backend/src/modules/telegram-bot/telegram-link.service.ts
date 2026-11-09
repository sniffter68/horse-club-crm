import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';

export type TelegramEntity = 'client' | 'user';
export function normalizeTelegram(input: string) {
  const value = input.replace(/\s/g, '').replace(/^(?:https?:\/\/)?t\.me\//i, '').replace(/^@/, '').replace(/\/$/, '').toLowerCase();
  if (/^[1-9]\d{0,19}$/.test(value)) return { telegramUserId: value, telegramUsername: null };
  if (/^[a-z][a-z0-9_]{4,31}$/.test(value)) return { telegramUserId: null, telegramUsername: value };
  throw new BadRequestException('Укажите корректный Telegram username или числовой ID');
}

@Injectable()
export class TelegramLinkService {
  constructor(private readonly prisma: PrismaService) {}

  async status(entityType: TelegramEntity, id: string) {
    if (entityType === 'client') {
      const row = await this.prisma.client.findUnique({ where: { id }, select: { telegramUserId: true, telegramUsername: true } });
      if (!row) throw new NotFoundException('Клиент не найден');
      return row;
    }
    const row = await this.prisma.user.findUnique({ where: { id }, select: { telegramUserId: true, telegramUsername: true } });
    if (!row) throw new NotFoundException('Сотрудник не найден');
    return row;
  }

  private async target(tx: Prisma.TransactionClient, entityType: TelegramEntity, id: string, actor?: AuthUser) {
    if (entityType === 'client') {
      const client = await tx.client.findUnique({ where: { id } });
      if (!client || client.deletedAt) throw new NotFoundException('Клиент не найден');
      return { telegramUserId: client.telegramUserId, role: 'client' as const };
    }
    const user = await tx.user.findUnique({ where: { id }, include: { staffProfile: true, trainer: true } });
    if (!user || user.staffProfile?.isActive === false || user.trainer?.isActive === false) throw new NotFoundException('Сотрудник не найден или неактивен');
    if (actor && user.role === 'ADMIN' && actor.role !== 'ADMIN') throw new ForbiddenException('Привязка администратора доступна только администратору');
    return { telegramUserId: user.telegramUserId, role: user.role === 'ADMIN' ? 'admin' as const : user.role === 'TRAINER' ? 'trainer' as const : 'staff' as const };
  }

  async save(entityType: TelegramEntity, id: string, actor: AuthUser, input: string) {
    const data = normalizeTelegram(input);
    return this.transaction(async tx => {
      await this.target(tx, entityType, id, actor);
      const where = { id: { not: id }, ...(data.telegramUserId ? { telegramUserId: data.telegramUserId } : { telegramUsername: data.telegramUsername }) };
      const owner = entityType === 'client' ? await tx.client.findFirst({ where }) : await tx.user.findFirst({ where });
      if (owner) throw new ConflictException('Telegram уже привязан к другому профилю');
      const select = { telegramUserId: true, telegramUsername: true };
      const result = entityType === 'client' ? await tx.client.update({ where: { id }, data, select }) : await tx.user.update({ where: { id }, data, select });
      await tx.telegramLinkToken.deleteMany({ where: { entityType, entityId: id } });
      return result;
    });
  }

  /** Called only with a Telegram update identity or verified TMA initData. */
  async bindUsername(sender: string, username?: string) {
    if (!username) return;
    const telegramUsername = username.toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(telegramUsername) || !/^[1-9]\d{0,19}$/.test(sender)) return;
    await this.transaction(async tx => {
      const where = { telegramUsername, telegramUserId: null };
      // Never replace an existing numeric identity or choose arbitrarily between duplicates.
      if (!await tx.client.findUnique({ where: { telegramUserId: sender } })) {
        const clients = await tx.client.findMany({ where: { ...where, deletedAt: null }, take: 2 });
        if (clients.length === 1) await tx.client.updateMany({ where: { id: clients[0].id, ...where, deletedAt: null }, data: { telegramUserId: sender } });
      }
      if (!await tx.user.findUnique({ where: { telegramUserId: sender } })) {
        const users = await tx.user.findMany({ where, include: { staffProfile: true, trainer: true }, take: 2 });
        if (users.length === 1 && users[0].staffProfile?.isActive !== false && users[0].trainer?.isActive !== false)
          await tx.user.updateMany({ where: { id: users[0].id, ...where }, data: { telegramUserId: sender } });
      }
    });
  }

  async unlink(entityType: TelegramEntity, id: string, actor: AuthUser) {
    return this.transaction(async tx => {
      await this.target(tx, entityType, id, actor);
      const data = { telegramUserId: null, telegramUsername: null };
      if (entityType === 'client') await tx.client.update({ where: { id }, data });
      else await tx.user.update({ where: { id }, data });
      await tx.telegramLinkToken.deleteMany({ where: { entityType, entityId: id } });
      return { success: true };
    });
  }

  private async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2025', 'P2034'].includes(error.code)) throw new ConflictException('Привязка изменилась. Обновите карточку и повторите');
        throw error;
      }
    }
  }
}
