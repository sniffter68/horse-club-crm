import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../vk-bot/vk-link.service';
import { VkIdentityService } from '../vk-bot/vk-identity.service';

export function verifyVkLaunchParams(input: string, secret: string, appId?: string): string {
  if (!secret) throw new ServiceUnavailableException('VK Mini App не настроено');
  const params = new URLSearchParams(input.replace(/^\?/, ''));
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) throw new UnauthorizedException('Duplicate launch parameters');
  const sign = params.get('sign') ?? '';
  const canonical = new URLSearchParams([...params.entries()].filter(([key]) => key.startsWith('vk_')).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)).toString();
  const expected = createHmac('sha256', secret).update(canonical).digest('base64url');
  if (!/^[A-Za-z0-9_-]{43}$/.test(sign) || !timingSafeEqual(Buffer.from(expected), Buffer.from(sign))) throw new UnauthorizedException('Invalid VK signature');
  const userId = params.get('vk_user_id') ?? '';
  const timestamp = Number(params.get('vk_ts'));
  if (!/^[1-9]\d{0,15}$/.test(userId) || !Number.isSafeInteger(Number(userId)) || !Number.isSafeInteger(timestamp)
    || Math.abs(Date.now() / 1000 - timestamp) > 86400 || (appId && params.get('vk_app_id') !== appId)) throw new UnauthorizedException('Invalid VK launch parameters');
  return userId;
}

@Injectable()
export class VkMiniAppService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  verify(launchParams: string): string {
    return verifyVkLaunchParams(launchParams, process.env.VK_MINI_APP_SECRET ?? '', process.env.VK_MINI_APP_ID);
  }

  async login(launchParams: string) {
    const vkUserId = this.verify(launchParams);
    const user = await this.prisma.user.findFirst({ where: { OR: [{ vkUserId: BigInt(vkUserId) }, { vkId: vkUserId }, { trainer: { vkId: BigInt(vkUserId) } }] }, include: { staffProfile: true, trainer: true } });
    if (user) {
      if (!user.crmAccess || user.staffProfile?.isActive === false || user.trainer?.isActive === false) throw new UnauthorizedException('Доступ отключён');
      return { status: 'LINKED' as const, role: user.role, user: { id: user.id, email: user.email, role: user.role },
        access_token: await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role, authVersion: String(user.tokenVersion) }) };
    }
    const client = await this.prisma.client.findFirst({ where: { OR: [{ vkUserId: BigInt(vkUserId) }, { vkId: vkUserId }] } });
    if (!client) return { status: 'UNLINKED' as const, vkUserId };
    if (client.deletedAt) throw new UnauthorizedException('Профиль в архиве');
    return { status: 'LINKED' as const, role: 'CLIENT' as const, clientId: client.id,
      user: { id: client.id, role: 'CLIENT' as const }, access_token: await this.jwt.signAsync({ sub: client.id, vkUserId, tokenType: 'vk-client-tma' }, { audience: 'client-tma', expiresIn: '1h' }) };
  }

  async linkByVk(launchParams: string, phone?: string, phoneToken?: string) {
    const vkUserId = this.verify(launchParams);
    if (!phone || !phoneToken) throw new BadRequestException('Разрешите VK передать номер телефона');
    const appId = process.env.VK_MINI_APP_ID;
    const secret = process.env.VK_MINI_APP_SECRET;
    if (!appId || !secret) throw new ServiceUnavailableException('VK Mini App не настроено');
    // VK signs the original field value, before any phone normalization.
    const expected = createHash('sha256').update(`${appId}${secret}${vkUserId}phone_number${phone}`).digest('base64url');
    if (!/^[A-Za-z0-9_-]{43}$/.test(phoneToken) || !timingSafeEqual(Buffer.from(expected), Buffer.from(phoneToken))) {
      throw new UnauthorizedException('Не удалось проверить номер VK. Повторите запрос номера');
    }
    const normalized = normalizePhone(phone);
    const digits = normalized.replace(/^\+/, '');
    const variants = digits.startsWith('7') ? [digits, `8${digits.slice(1)}`] : [digits];
    const identity = new VkIdentityService(this.prisma);
    await identity.atomic(async tx => {
      // Normalize legacy formatted phones in SQL, without loading the phone book into memory.
      const matches = await tx.$queryRaw<Array<{ kind: 'CLIENT' | 'STAFF'; id: string }>>(Prisma.sql`
        SELECT 'CLIENT' AS kind, id FROM "Client"
        WHERE "deletedAt" IS NULL AND regexp_replace(phone, '[^0-9]', '', 'g') IN (${Prisma.join(variants)})
        UNION
        SELECT 'STAFF' AS kind, u.id FROM "User" u
        LEFT JOIN "StaffProfile" s ON s."userId" = u.id
        LEFT JOIN "Trainer" t ON t.id = u."trainerId"
        WHERE (regexp_replace(s.phone, '[^0-9]', '', 'g') IN (${Prisma.join(variants)})
          OR regexp_replace(t.phone, '[^0-9]', '', 'g') IN (${Prisma.join(variants)}))
          AND (s.id IS NULL OR s."isActive") AND (t.id IS NULL OR t."isActive")
      `);
      if (!matches.length) throw new BadRequestException('Номер VK не найден в CRM. Передайте VK ID администратору клуба');
      if (matches.length !== 1) throw new ConflictException('Номер указан в нескольких профилях. Обратитесь к администратору');
      const target = matches[0];
      const peer = BigInt(vkUserId);
      if (target.kind === 'CLIENT') {
        const client = await tx.client.findUnique({ where: { id: target.id } });
        if (!client || client.deletedAt) throw new ConflictException('Профиль недоступен');
        if ((client.vkUserId !== null && client.vkUserId !== peer) || (client.vkId !== null && client.vkId !== vkUserId)) {
          throw new ConflictException('Профиль уже связан с другим VK аккаунтом');
        }
        await identity.assertAvailable(tx, vkUserId, 'CLIENT', client.id);
        await tx.client.update({ where: { id: client.id }, data: { vkUserId: peer, vkId: vkUserId } });
      } else {
        const user = await tx.user.findUnique({ where: { id: target.id }, include: { staffProfile: true, trainer: true } });
        if (!user || !user.crmAccess || user.staffProfile?.isActive === false || user.trainer?.isActive === false) throw new UnauthorizedException('Доступ отключён');
        if ((user.vkUserId !== null && user.vkUserId !== peer) || (user.vkId !== null && user.vkId !== vkUserId)
          || (user.trainer?.vkId != null && user.trainer.vkId !== peer)) throw new ConflictException('Профиль уже связан с другим VK аккаунтом');
        await identity.applyStaff(tx, user.id, vkUserId);
        if (user.trainerId) await tx.trainer.update({ where: { id: user.trainerId }, data: { vkId: peer } });
      }
    });
    return this.login(launchParams);
  }
}
