import { ForbiddenException, HttpException, Injectable, ServiceUnavailableException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { validateTelegramInitData, type TelegramIdentity } from './telegram-init-data';

export interface TelegramRequest extends Request {
  telegram: TelegramIdentity & { clientId: string };
}

@Injectable()
export class TelegramAuthGuard implements CanActivate {
  private readonly buckets = new Map<string, { count: number; until: number }>();
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) throw new ServiceUnavailableException('Онлайн-запись через Telegram пока недоступна');
    const request = context.switchToHttp().getRequest<TelegramRequest>();
    const authorization = request.get('Authorization');
    const initData = authorization !== undefined ? /^tma (.+)$/i.exec(authorization)?.[1] ?? ''
      : request.get('X-Telegram-Init-Data') ?? '';
    const identity = validateTelegramInitData(initData, token);
    const now = Date.now();
    for (const [key, bucket] of this.buckets) if (bucket.until <= now) this.buckets.delete(key);
    const slots = request.path?.endsWith('/slots');
    const key = `${identity.telegramUserId}:${slots ? 'slots' : 'general'}`;
    const bucket = this.buckets.get(key);
    if ((!bucket && this.buckets.size >= 10_000) || (bucket && bucket.count >= (slots ? 10 : 60))) throw new HttpException('Слишком много запросов. Повторите через минуту', 429);
    this.buckets.set(key, { count: (bucket?.count ?? 0) + 1, until: bucket?.until ?? now + 60_000 });
    // Personal TMA routes have no staff role: enforce enabled SCHEDULE and ownership,
    // never manufacture an ADMIN/JWT identity or grant access to CRM endpoints.
    const settings = await this.prisma.clubModuleSettings.findUnique({ where: { module: 'SCHEDULE' } });
    if (settings && !settings.isEnabled) throw new ForbiddenException('Онлайн-запись временно отключена');
    const client = await this.prisma.client.upsert({
      where: { telegramUserId: identity.telegramUserId },
      create: { telegramUserId: identity.telegramUserId, telegramUsername: identity.username,
        firstName: identity.firstName, lastName: identity.lastName,
        name: [identity.firstName, identity.lastName].filter(Boolean).join(' ') },
      update: {}, select: { id: true, deletedAt: true },
    });
    const bookingFlow = (request.method === 'GET' && (request.path?.endsWith('/services') || slots))
      || (request.method === 'POST' && request.path?.endsWith('/bookings'));
    if (client.deletedAt && !bookingFlow) throw new ForbiddenException('Обратитесь в клуб для восстановления профиля');
    request.telegram = { ...identity, clientId: client.id };
    return true;
  }
}
