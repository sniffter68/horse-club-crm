import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { AuthUser } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';

export type TelegramEntity = 'client' | 'user';
export type TelegramLinkRole = 'staff' | 'trainer' | 'admin';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const TTL = 15 * 60_000;

@Injectable()
export class TelegramLinkService {
  private readonly attempts = new Map<string, { count: number; until: number }>();
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

  async issue(entityType: TelegramEntity, id: string, actor: AuthUser, requestedRole?: TelegramLinkRole) {
    return this.transaction(async tx => {
      const target = await this.target(tx, entityType, id, actor);
      if (requestedRole && requestedRole !== target.role) throw new BadRequestException('Роль должна соответствовать профилю CRM');
      if (target.telegramUserId) throw new ConflictException('Сначала отвяжите текущий Telegram');
      const token = randomBytes(9).toString('base64url');
      const code = String(randomInt(100000, 1000000));
      const expiresAt = new Date(Date.now() + TTL);
      await tx.telegramLinkToken.deleteMany({ where: { OR: [{ expiresAt: { lte: new Date() } }, { entityType, entityId: id }] } });
      await tx.telegramLinkToken.create({ data: { tokenHash: digest(token), codeHash: digest(code), entityType, entityId: id, expiresAt, createdById: actor.id } });
      return { code, expiresAt, role: target.role, deepLink: `https://t.me/horseclub68_bot?start=link_${entityType}_${id}_${token}` };
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

  async consume(input: string, sender: string, username?: string) {
    if (!/^[1-9]\d{0,19}$/.test(sender)) throw new BadRequestException('Некорректный Telegram ID');
    const now = Date.now();
    for (const [key, row] of this.attempts) if (row.until <= now) this.attempts.delete(key);
    const attempt = this.attempts.get(sender) ?? { count: 0, until: now + TTL };
    if (attempt.count >= 5 || this.attempts.size >= 10000 && !this.attempts.has(sender)) throw new BadRequestException('Слишком много попыток. Повторите через 15 минут');
    attempt.count++; this.attempts.set(sender, attempt);
    const link = /^link_(client|user)_([\da-f-]{36})_([\w-]{12})$/i.exec(input);
    if (!link && !/^\d{6}$/.test(input)) throw new BadRequestException('Неверный код привязки');
    const result = await this.transaction(async tx => {
      const grant = await tx.telegramLinkToken.findUnique({ where: link ? { tokenHash: digest(link[3]) } : { codeHash: digest(input) } });
      if (!grant || grant.expiresAt.getTime() <= now || link && (grant.entityType !== link[1] || grant.entityId !== link[2])) throw new BadRequestException('Код недействителен или истёк. Получите новый код в CRM');
      const kind = grant.entityType === 'client' ? 'client' : 'user';
      const target = await this.target(tx, kind, grant.entityId);
      const owner = kind === 'client' ? await tx.client.findUnique({ where: { telegramUserId: sender } }) : await tx.user.findUnique({ where: { telegramUserId: sender } });
      if (target.telegramUserId && target.telegramUserId !== sender || owner && owner.id !== grant.entityId) throw new ConflictException('Telegram уже привязан к другому профилю. Обратитесь в клуб');
      // Delete and update in one serializable transaction: concurrent redemption cannot succeed twice.
      await tx.telegramLinkToken.delete({ where: { tokenHash: grant.tokenHash } });
      const data = { telegramUserId: sender, telegramUsername: username ?? null };
      if (kind === 'client') await tx.client.update({ where: { id: grant.entityId }, data });
      else await tx.user.update({ where: { id: grant.entityId }, data });
      return target.role;
    });
    this.attempts.delete(sender);
    return result;
  }

  private async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try { return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2025', 'P2034'].includes(error.code)) throw new ConflictException('Привязка изменилась. Обновите карточку и повторите');
      throw error;
    }
  }
}
