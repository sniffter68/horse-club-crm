import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { ForbiddenException, HttpException, Injectable, ServiceUnavailableException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { TelegramLinkService } from './telegram-link.service';
import { PrismaService } from '../../prisma/prisma.service';
import { validateTelegramInitData, type TelegramIdentity } from './telegram-init-data';

export interface TelegramRequest extends Request {
  telegram: TelegramIdentity & { clientId: string };
}

@Injectable()
export class TelegramAuthGuard implements CanActivate {
  private readonly buckets = new Map<string, { count: number; until: number }>();
  constructor(private readonly prisma: PrismaService, private readonly links: TelegramLinkService, private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) throw new ServiceUnavailableException('Онлайн-запись через Telegram пока недоступна');
    const request = context.switchToHttp().getRequest<TelegramRequest>();
    const authorization = request.get('Authorization');
    const initData = authorization !== undefined ? /^tma (.+)$/i.exec(authorization)?.[1] ?? ''
      : request.get('X-Telegram-Init-Data') ?? '';
    const bearer = /^Bearer (\S+)$/i.exec(authorization ?? '')?.[1];
    let identity: TelegramIdentity;
    let sessionClientId: string | undefined;
    if (bearer) {
      let payload: { sub?: unknown; telegramUserId?: unknown; tokenType?: unknown };
      try { payload = await this.jwt.verifyAsync(bearer, { audience: 'client-tma', algorithms: ['HS256'] }); }
      catch { throw new UnauthorizedException('Сессия Telegram истекла'); }
      if (payload.tokenType !== 'client-tma' || typeof payload.sub !== 'string' || !payload.sub || typeof payload.telegramUserId !== 'string' || !payload.telegramUserId) throw new UnauthorizedException('Недействительная сессия');
      sessionClientId = payload.sub;
      identity = { telegramUserId: payload.telegramUserId, firstName: '', lastName: '' };
    } else identity = validateTelegramInitData(initData, token);
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
    if (sessionClientId) {
      const linked = await this.prisma.client.findUnique({ where: { telegramUserId: identity.telegramUserId }, select: { id: true, deletedAt: true } });
      if (!linked || linked.deletedAt || linked.id !== sessionClientId) throw new UnauthorizedException('Привязка Telegram изменилась');
      request.telegram = { ...identity, clientId: linked.id };
      return true;
    }
    await this.links.bindUsername(identity.telegramUserId, identity.username);
    const client = await this.prisma.client.upsert({
      where: { telegramUserId: identity.telegramUserId },
      create: { telegramUserId: identity.telegramUserId, telegramUsername: identity.username?.toLowerCase(),
        firstName: identity.firstName, lastName: identity.lastName,
        name: [identity.firstName, identity.lastName].filter(Boolean).join(' ') },
      update: {}, select: { id: true, deletedAt: true },
    });
    const bookingFlow = (request.method === 'GET' && (request.path?.endsWith('/services') || slots))
      || (request.method === 'POST' && (request.path?.endsWith('/bookings') || request.path?.endsWith('/client/booking')));
    if (client.deletedAt && !bookingFlow) throw new ForbiddenException('Обратитесь в клуб для восстановления профиля');
    request.telegram = { ...identity, clientId: client.id };
    return true;
  }
}
